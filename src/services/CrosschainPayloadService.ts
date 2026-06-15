import { eq, sql } from "drizzle-orm";
import { CrosschainPayload, CrosschainPayloadStatuses } from "ponder:schema";
import { Service, type DataWithoutDefaults, type ReadOnlyContext } from "./Service";
import { Event, Context } from "ponder:registry";
import { getCrosschainMessageLength } from ".";
import { keccak256, encodePacked } from "viem";
import { expandInlineObject, serviceError, serviceLog } from "../helpers/logger";
import { timestamper } from "../helpers/timestamper";
import { RegistryVersions } from "../chains";
import { buildCrosschainPayloadConflictSet, NULL_CROSSCHAIN_PAYLOAD_FACTS } from "../helpers/crosschainUpsert";

/**
 * Service class for managing CrosschainPayload entities (primary key `id` + `payloadIndex`).
 *
 * **v3:** Typically one active row per `payloadId` through underpaid → in-transit; adapters may add
 * proof rounds (see multi-adapter handlers). **v3_1:** Multiple rows per `payloadId` (1..n indices)
 * are normal; there is no adapter proof phase.
 *
 * @extends {Service<typeof CrosschainPayload>}
 */
export class CrosschainPayloadService extends Service<typeof CrosschainPayload> {
  static readonly entityTable = CrosschainPayload;
  static readonly entityName = "CrosschainPayload";

  /**
   * Next payload index for a payloadId (MAX(index)+1).
   * @param context - Ponder context
   * @param payloadId - Payload id
   * @returns Next index (0 when none exist)
   */
  static async nextPayloadIndex(
    context: Context,
    payloadId: `0x${string}`
  ): Promise<number> {
    const db = context.db.sql;
    const [result] = await db
      .select({ maxIndex: sql<number>`coalesce(max(${CrosschainPayload.index}), -1)::int` })
      .from(CrosschainPayload)
      .where(eq(CrosschainPayload.id, payloadId));
    return (result?.maxIndex ?? -1) + 1;
  }

  /**
   * Upserts fact columns and recomputes status via SQL CASE (multichain-safe).
   * @param context - Ponder context
   * @param event - Source event
   * @param key - Payload primary key
   * @param facts - Fact fields (status derived on conflict)
   * @returns Service instance
   */
  static async upsertFacts(
    context: Context,
    event: Extract<Event, { transaction: { hash: `0x${string}` } }>,
    key: { id: `0x${string}`; index: number },
    facts: Partial<DataWithoutDefaults<typeof CrosschainPayload>>
  ): Promise<CrosschainPayloadService> {
    serviceLog(
      "CrosschainPayload upsertFacts",
      expandInlineObject({ id: key.id, index: key.index })
    );
    const row = {
      ...NULL_CROSSCHAIN_PAYLOAD_FACTS,
      ...facts,
      ...key,
      rawData: facts.rawData ?? "0x",
      fromCentrifugeId: facts.fromCentrifugeId ?? "0",
      toCentrifugeId: facts.toCentrifugeId ?? "0",
      status: facts.status ?? "Underpaid",
      preparedAt: facts.preparedAt ?? new Date(Number(event.block.timestamp) * 1000),
      preparedAtBlock: facts.preparedAtBlock ?? Number(event.block.number),
      preparedAtTxHash: facts.preparedAtTxHash ?? event.transaction.hash,
      createdAt: new Date(Number(event.block.timestamp) * 1000),
      createdAtBlock: Number(event.block.number),
      createdAtTxHash: event.transaction.hash,
      updatedAt: new Date(Number(event.block.timestamp) * 1000),
      updatedAtBlock: Number(event.block.number),
      updatedAtTxHash: event.transaction.hash,
    };

    const conflictSet = buildCrosschainPayloadConflictSet();
    const [entity] = await context.db.sql
      .insert(CrosschainPayload)
      .values(row)
      .onConflictDoUpdate({
        target: [CrosschainPayload.id, CrosschainPayload.index],
        set: conflictSet as unknown as Partial<typeof row>,
      })
      .returning();

    if (!entity) throw new Error(`CrosschainPayload upsertFacts failed for ${key.id}`);
    return new CrosschainPayloadService(
      CrosschainPayload,
      "CrosschainPayload",
      context,
      entity
    );
  }

  /**
   * Looks up a payload by the transaction hash that prepared it on the source chain.
   */
  static async getByPreparedAtTxHash(
    context: Context | ReadOnlyContext,
    preparedAtTxHash: `0x${string}`
  ): Promise<CrosschainPayloadService | null> {
    const table = this.entityTable;
    const name = this.entityName;
    const db = "sql" in context.db ? context.db.sql : context.db;
    serviceLog(`${name} getByPreparedAtTxHash`, expandInlineObject({ preparedAtTxHash }));
    const [entity] = await db
      .select()
      .from(table)
      .where(eq(CrosschainPayload.preparedAtTxHash, preparedAtTxHash))
      .limit(1);
    if (!entity) return null;
    return new this(table, name, context, entity) as CrosschainPayloadService;
  }

  /**
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getUndeliveredFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog("CrosschainPayload getUndeliveredFromQueue", expandInlineObject({ payloadId }));
    const crosschainMessages = (await this.query(context, {
      id: payloadId,
      status_not: "Delivered",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainMessages.length === 0) return null;
    return crosschainMessages.shift()!;
  }

  /**
   * Gets the first payload from the in transit or delivered queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getInTransitOrDeliveredFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog(
      "CrosschainPayload getInTransitOrDeliveredFromQueue",
      expandInlineObject({ payloadId })
    );
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status_in: ["InTransit", "Delivered"],
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the underpaid queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getUnderpaidFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog("CrosschainPayload getUnderpaidFromQueue", expandInlineObject({ payloadId }));
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status: "Underpaid",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the underpaid or in transit queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getUnderpaidOrInTransitFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog(
      "CrosschainPayload getUnderpaidOrInTransitFromQueue",
      expandInlineObject({ payloadId })
    );
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status_in: ["Underpaid", "InTransit"],
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];

    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getDeliveredFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog("CrosschainPayload getDeliveredFromQueue", expandInlineObject({ payloadId }));
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status: "Delivered",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getDeliveredOrPartiallyFailedFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog(
      "CrosschainPayload getDeliveredOrPartiallyFailedFromQueue",
      expandInlineObject({ payloadId })
    );
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status_in: ["Delivered", "PartiallyFailed"],
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first incomplete payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first incomplete payload from the queue or null if no payload is found
   */
  static async getIncompleteFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog("CrosschainPayload getIncompleteFromQueue", expandInlineObject({ payloadId }));
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status_not: "Completed",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Sets the status of the CrosschainPayload entity.
   *
   * @param {CrosschainPayloadStatuses} status - The new status to set for the CrosschainPayload
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public setStatus(status: (typeof CrosschainPayloadStatuses)[number]) {
    serviceLog(
      `CrosschainPayload setStatus id=${this.data.id} index=${this.data.index} status=${status}`
    );
    this.data.status = status;
    return this;
  }

  /**
   * Marks the CrosschainPayload as in transit.
   *
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public InTransit() {
    serviceLog(`CrosschainPayload InTransit id=${this.data.id} index=${this.data.index}`);
    this.data.status = "InTransit";
    return this;
  }

  /**
   * Marks the CrosschainPayload as delivered.
   *
   * @param {Event} event - The event that marks the CrosschainPayload as delivered
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public delivered(
    event: Event<
      | "multiAdapterV3:HandlePayload"
      | "multiAdapterV3:HandleProof"
      | "multiAdapterV3_1:HandlePayload"
    >
  ) {
    serviceLog(`CrosschainPayload delivered id=${this.data.id} index=${this.data.index}`);
    this.data = {
      ...this.data,
      status: "Delivered",
      ...timestamper("delivered", event),
    };
    return this;
  }

  /**
   * Marks the CrosschainPayload as completed.
   *
   * @param {Event} event - The event that marks the CrosschainPayload as completed
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public completed(
    event: Event<
      | "multiAdapterV3:HandleProof"
      | "gatewayV3:ExecuteMessage"
      | "gatewayV3_1:ExecuteMessage"
      | "multiAdapterV3:HandlePayload"
      | "multiAdapterV3_1:HandlePayload"
    >
  ) {
    serviceLog(`CrosschainPayload completed id=${this.data.id} index=${this.data.index}`);
    this.data.status = "Completed";
    this.data = {
      ...this.data,
      status: "Completed",
      ...timestamper("completed", event),
    };
    return this;
  }
}

/**
 * Extracts individual cross-chain messages from a concatenated payload
 *
 * Takes a hex-encoded payload containing multiple concatenated messages and splits it into
 * individual message bytes. Each message consists of a 1-byte type identifier followed by
 * a fixed-length payload specific to that message type.
 *
 * @param payload - Hex string containing concatenated messages, with '0x' prefix
 * @returns Array of hex strings, each representing a single message (including type byte)
 * @throws {Error} If an invalid/unknown message type is encountered
 *
 * @example
 * const payload = '0x2100...3300...' // Multiple concatenated messages
 * const messages = extractMessagesFromPayload(payload)
 * // Returns: ['0x21...', '0x33...'] // Individual message bytes
 */
export function extractMessagesFromPayload(payload: `0x${string}`, version: RegistryVersions) {
  const payloadBuffer = Buffer.from(payload.substring(2), "hex");
  const messages: `0x${string}`[] = [];
  let offset = 0;
  // Keep extracting messages while we have enough bytes remaining
  while (offset < payloadBuffer.length) {
    const messageType = payloadBuffer.readUInt8(offset);
    // Pass the buffer slice starting from current offset
    const currentBuffer = payloadBuffer.subarray(offset);
    const messageLength = getCrosschainMessageLength(messageType, currentBuffer, version);
    if (!messageLength) {
      serviceError(`Invalid message type: ${messageType}`);
      break;
    }

    // Extract message bytes including the type byte
    const messageBytes = currentBuffer.subarray(0, messageLength);
    messages.push(`0x${messageBytes.toString("hex")}`);

    // Move offset past this message
    offset += messageLength;
  }
  return messages;
}

/**
 * Generates a unique payload ID by hashing chain IDs and payload bytes
 *
 * @param fromCentrifugeId - The Centrifuge Chain ID of the source chain
 * @param toCentrifugeId - The Centrifuge Chain ID of the destination chain
 * @param payload - The hex-encoded payload bytes
 * @returns The keccak256 hash of the encoded parameters as the payload ID
 */
export function getPayloadId(
  fromCentrifugeId: string,
  toCentrifugeId: string,
  payload: `0x${string}`
) {
  return keccak256(
    encodePacked(
      ["uint16", "uint16", "bytes32"],
      [Number(fromCentrifugeId), Number(toCentrifugeId), keccak256(payload)]
    )
  );
}
