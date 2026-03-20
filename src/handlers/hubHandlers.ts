import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError, serviceLog } from "../helpers/logger";
import {
  WhitelistedInvestorService,
  TokenService,
  PoolSpokeBlockchainService,
  PoolManagerService,
  AccountService,
  centrifugeIdFromAssetId,
  VaultService,
  AssetService,
} from "../services";
import { VaultCrosschainInProgressTypes } from "ponder:schema";

multiMapper("hub:NotifyPool", async ({ event, context }) => {
  logEvent(event, context, "hub:NotifyPool");
  const { poolId, centrifugeId } = event.args;

  await PoolSpokeBlockchainService.getOrInit(
    context,
    {
      poolId,
      centrifugeId: centrifugeId.toString(),
    },
    event
  );
});

multiMapper("hub:UpdateRestriction", async ({ event, context }) => {
  logEvent(event, context, "hub:UpdateRestriction");
  const { centrifugeId: spokeCentrifugeId, scId: tokenId, payload } = event.args;

  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService | null;
  if (!token) {
    serviceError(`Token not found. Cannot retrieve poolId for restriction update`);
    return;
  }
  const { poolId } = token.read();

  const decodedPayload = decodeUpdateRestriction(payload);
  if (!decodedPayload) {
    serviceError("Unable to decode updateRestriction payload: ", payload);
    return;
  }

  const [restrictionType, accountAddress, validUntil] = decodedPayload;

  const whitelistedInvestor = (await WhitelistedInvestorService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      centrifugeId: spokeCentrifugeId.toString(),
      accountAddress,
    },
    event
  )) as WhitelistedInvestorService;

  switch (restrictionType) {
    case RestrictionType.Member:
      whitelistedInvestor.setValidUntil(validUntil);
      await whitelistedInvestor.save(event);
      break;
    case RestrictionType.Freeze:
      whitelistedInvestor.freeze();
      await whitelistedInvestor.save(event);
      break;
    case RestrictionType.Unfreeze:
      whitelistedInvestor.unfreeze();
      await whitelistedInvestor.save(event);
      break;
    default:
      break;
  }
});

multiMapper("hub:UpdateBalanceSheetManager", async ({ event, context }) => {
  logEvent(event, context, "hub:UpdateBalanceSheetManager");
  const { poolId, manager: _manager, canManage, centrifugeId: spokeCentrifugeId } = event.args;
  const manager = _manager.toLowerCase().substring(0, 42) as `0x${string}`;

  const _account = (await AccountService.getOrInit(
    context,
    {
      address: manager,
    },
    event
  )) as AccountService;

  const poolManager = (await PoolManagerService.getOrInit(
    context,
    { poolId, centrifugeId: spokeCentrifugeId.toString(), address: manager },
    event,
    undefined,
    true
  )) as PoolManagerService;
  poolManager.setCrosschainInProgress(canManage ? `CanManage` : `CanNotManage`);
  await poolManager.save(event);
});

multiMapper("hub:UpdateVault", async ({ event, context }) => {
  logEvent(event, context, "hub:UpdateVault");

  const { assetId, kind, vaultOrFactory, poolId, scId: tokenId } = event.args;
  // Only track in progress for Link (1) and Unlink (2). Skip Deploy (0) for now.
  if (kind == 0)
    return serviceLog(`Skipping vault update: only Link/Unlink tracked (kind=${kind})`);

  const destCentrifugeId = centrifugeIdFromAssetId(assetId);
  if (!destCentrifugeId)
    return serviceError(`Invalid assetId. Cannot retrieve destCentrifugeId for vault update`);

  const vaultAddress: `0x${string}` = vaultOrFactory.substring(0, 42) as `0x${string}`;

  const vaultUpdateKind = VaultCrosschainInProgressTypes[kind];
  if (!vaultUpdateKind) return serviceError(`Invalid vault update kind. Cannot update vault`);

  const vault = (await VaultService.getOrInit(
    context,
    {
      id: vaultAddress,
      centrifugeId: destCentrifugeId,
      poolId,
      tokenId,
      assetId,
    },
    event,
    undefined,
    true
  )) as VaultService;
  await vault.setCrosschainInProgress(vaultUpdateKind).save(event);
});

multiMapper("hub:UpdateContract", async ({ event, context }) => {
  logEvent(event, context, "hub:UpdateContract");
  const { centrifugeId: destCentrifugeId, poolId, scId: tokenId, payload } = event.args;

  const decoded = decodeUpdateContract(payload);
  if (!decoded || !decoded.payload)
    return serviceError(`Invalid update contract payload: ${payload}`);

  if (decoded.kind === "MaxReserve" && "maxReserve" in decoded.payload) {
    const { assetId, maxReserve } = decoded.payload as { assetId: bigint; maxReserve: bigint };
    const asset = await AssetService.get(context, { id: assetId });
    if (!asset)
      return serviceError(`Asset not found for assetId ${assetId}. Cannot update vault maxReserve`);
    const assetAddress = asset.read().address as `0x${string}`;
    if (!assetAddress) return serviceError(`Asset has no address for assetId ${assetId}`);

    const vault = (await VaultService.get(context, {
      centrifugeId: destCentrifugeId.toString(),
      poolId,
      tokenId,
      assetAddress,
    })) as VaultService | null;
    if (!vault) return serviceError(`Vault not found. Cannot update maxReserve`);
    await vault.setMaxReserve(maxReserve).setCrosschainInProgress().save(event);
  }
});

enum RestrictionType {
  "Invalid",
  "Member",
  "Freeze",
  "Unfreeze",
}

/**
 * Decodes the update restriction payload into its parameters.
 * @param payload - The payload to decode.
 * @returns The decoded parameters.
 */
function decodeUpdateRestriction(
  payload: `0x${string}`
):
  | [
      restrictionType: (typeof RestrictionType)[keyof typeof RestrictionType],
      accountAddress: `0x${string}`,
      validUntil: Date | null,
    ]
  | null {
  const buffer = Buffer.from(payload.slice(2), "hex");
  const restrictionType = buffer.readUInt8(0);
  const accountBuffer = buffer.subarray(1, 32);
  const accountAddress = `0x${accountBuffer.toString("hex").slice(0, 40)}` as `0x${string}`;
  switch (restrictionType) {
    case RestrictionType.Member:
      const _validUntil = Number(buffer.readBigUInt64BE(33) * 1000n);
      const validUntil = Number.isSafeInteger(_validUntil)
        ? new Date(Number(_validUntil))
        : new Date("9999-12-31T23:59:59Z");
      return [restrictionType, accountAddress, validUntil];
    case RestrictionType.Freeze:
      return [restrictionType, accountAddress, null];
    case RestrictionType.Unfreeze:
      return [restrictionType, accountAddress, null];
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// UpdateContract: single-pass decoding (SyncManager, OnOfframpManager, BaseTransferHook)
// ---------------------------------------------------------------------------

/** ABI word size. Solidity abi.encode uses 32-byte words; uint8/uint128/bool are right-aligned. */
const WORD_SIZE = 32;
/** Start offset of word N (0-based). */
const word = (n: number) => n * WORD_SIZE;
/** Decode a value from the 32-byte ABI word at wordIndex using the given decoder. */
function decodeAtWord<T>(buffer: Buffer, wordIndex: number, decoder: (chunk: Buffer) => T): T {
  const start = wordIndex * WORD_SIZE;
  return decoder(buffer.subarray(start, start + WORD_SIZE));
}
/** Decoder: right-aligned uint8 in a 32-byte word (bytes 31). */
const decodeUint8InWord = (chunk: Buffer): number => chunk.readUInt8(WORD_SIZE - 1);
/** Decoder: right-aligned uint128 in a 32-byte word (bytes 16–31). */
const decodeUint128InWord = (chunk: Buffer): bigint =>
  chunk.readBigUInt64BE(16) | (chunk.readBigUInt64BE(24) << 64n);
/** Decoder: bytes32 as 20-byte address (right-padded, bytes 12–31). */
const decodeBytes32Address = (chunk: Buffer): `0x${string}` =>
  `0x${chunk.subarray(12, 32).toString("hex")}` as `0x${string}`;
/** Payload kind (uint8) in UpdateContract; matches SyncManager / OnOfframpManager / BaseTransferHook TrustedCall. */
enum UpdateContractPayloadKind {
  "Valuation", // SyncManager.Valuation | OnOfframpManager.Onramp | BaseTransferHook.UpdateHookManager
  "MaxReserve", // SyncManager.MaxReserve | OnOfframpManager.Relayer
  "Offramp", // OnOfframpManager.Offramp
  "Withdraw", // OnOfframpManager.Withdraw
}

/** All possible decoded payloads from protocol UpdateContract, by kind. Payload is null when shape is unrecognized. */
export type DecodedUpdateContract =
  | {
      kind: "Valuation";
      payload:
        | { valuation: `0x${string}` } // SyncManager
        | { assetId: bigint; isEnabled: boolean } // OnOfframpManager.Onramp
        | { manager: `0x${string}`; canManage: boolean } // BaseTransferHook.UpdateHookManager
        | null;
    }
  | {
      kind: "MaxReserve";
      payload:
        | { assetId: bigint; maxReserve: bigint } // SyncManager
        | { relayerAddress: `0x${string}`; isEnabled: boolean } // OnOfframpManager.Relayer
        | null;
    }
  | {
      kind: "Offramp";
      payload:
        | { assetId: bigint; receiverAddress: `0x${string}`; isEnabled: boolean } // OnOfframpManager.Offramp
        | null;
    }
  | {
      kind: "Withdraw";
      payload:
        | { assetId: bigint; amount: bigint; receiverAddress: `0x${string}` } // OnOfframpManager.Withdraw
        | null;
    };

/** True if word at index looks like a right-aligned uint128 (bytes 0–15 zero). */
function isWordZeroPaddedUint128(b: Buffer, wordIndex: number): boolean {
  const start = wordIndex * WORD_SIZE;
  for (let i = 0; i < 16; i++) if (b[start + i] !== 0) return false;
  return true;
}

/**
 * Decodes the update contract payload into its parameters.
 * Does not resolve target address; decoding is based only on payload kind and shape.
 * @param payload - The payload to decode.
 * @returns The decoded parameters.
 */
export function decodeUpdateContract(payload: `0x${string}`): DecodedUpdateContract | null {
  const b = Buffer.from(payload.slice(2), "hex");
  if (b.length < WORD_SIZE) return null;
  const kindValue = decodeAtWord(b, 0, decodeUint8InWord);
  // Numeric TS enums list reverse-mapping keys ("0","1",…) first in Object.keys — use enum[value] for the name.
  if (
    kindValue < UpdateContractPayloadKind.Valuation ||
    kindValue > UpdateContractPayloadKind.Withdraw
  ) {
    return null;
  }
  const kind = UpdateContractPayloadKind[kindValue] as DecodedUpdateContract["kind"];

  const result: DecodedUpdateContract = {
    kind,
    payload: null,
  };

  // ABI layout: each slot is 32 bytes; uint8/uint128/bool right-aligned.
  switch (kind) {
    case "Valuation":
      // (uint8, bytes32) = 2 words — SyncManager only
      if (b.length === word(2)) {
        result.payload = {
          valuation: decodeAtWord(b, 1, decodeBytes32Address),
        };
      }
      // (uint8, uint128, bool) = 3 words (Onramp) | (uint8, bytes32, bool) = 3 words (UpdateHookManager)
      if (b.length === word(3) && isWordZeroPaddedUint128(b, 1)) {
        result.payload = {
          assetId: decodeAtWord(b, 1, decodeUint128InWord),
          isEnabled: decodeAtWord(b, 2, decodeUint8InWord) !== 0,
        };
      }
      if (b.length === word(3) && !isWordZeroPaddedUint128(b, 1)) {
        result.payload = {
          manager: decodeAtWord(b, 1, decodeBytes32Address),
          canManage: decodeAtWord(b, 2, decodeUint8InWord) !== 0,
        };
      }
      break;
    case "MaxReserve":
      // (uint8, uint128, uint128) = 3 words (SyncManager) | (uint8, bytes32, bool) = 3 words (Relayer)
      if (b.length === word(3)) {
        if (isWordZeroPaddedUint128(b, 1) && isWordZeroPaddedUint128(b, 2)) {
          result.payload = {
            assetId: decodeAtWord(b, 1, decodeUint128InWord),
            maxReserve: decodeAtWord(b, 2, decodeUint128InWord),
          };
        } else {
          result.payload = {
            relayerAddress: decodeAtWord(b, 1, decodeBytes32Address),
            isEnabled: decodeAtWord(b, 2, decodeUint8InWord) !== 0,
          };
        }
      }
      break;
    case "Offramp":
      // (uint8, uint128, bytes32, bool) = 4 words
      if (b.length === word(4)) {
        result.payload = {
          assetId: decodeAtWord(b, 1, decodeUint128InWord),
          receiverAddress: decodeAtWord(b, 2, decodeBytes32Address),
          isEnabled: decodeAtWord(b, 3, decodeUint8InWord) !== 0,
        };
      }
      break;
    case "Withdraw":
      // (uint8, uint128, uint128, bytes32) = 4 words
      if (b.length === word(4)) {
        result.payload = {
          assetId: decodeAtWord(b, 1, decodeUint128InWord),
          amount: decodeAtWord(b, 2, decodeUint128InWord),
          receiverAddress: decodeAtWord(b, 3, decodeBytes32Address),
        };
      }
      break;
  }

  return result;
}
