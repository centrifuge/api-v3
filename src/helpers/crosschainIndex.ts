/**
 * Pure helpers for `(payloadId, index)` resolution — no Ponder imports.
 */

/** Minimal payload row shape for open/closed and index resolution. */
export type PayloadRowForIndex = {
  index: number;
  completedAt?: Date | null;
  repaidAt?: Date | null;
  preparedAt?: Date | null;
  deliveredAt?: Date | null;
  partiallyFailedAt?: Date | null;
};

/** Minimal message row shape for payload index linkage. */
export type MessageRowForPayloadIndex = {
  payloadIndex?: number | null;
  payloadId?: `0x${string}` | null;
  preparedAt?: Date | null;
  batchedAt?: Date | null;
};

/** Sender / receive payload events that allocate or target `(payloadId, index)`. */
export type PayloadEventKind = "UnderpaidBatch" | "RepayBatch" | "SendPayload" | "HandlePayload";

/** Result of resolving which payload index an event should upsert. */
export type ResolvePayloadKeyResult =
  | { action: "mutate"; index: number }
  | { action: "create"; index: number }
  | { action: "defer" };

/**
 * Whether a payload row is terminal (no further sender-side mutations).
 * @param row - Payload row facts
 * @returns True when `completedAt` is set
 */
export function isPayloadRowClosed(row: PayloadRowForIndex): boolean {
  return row.completedAt != null;
}

/**
 * Whether a payload row can still accept repay / send / delivery facts.
 * @param row - Payload row facts
 * @returns True when not completed
 */
export function isPayloadRowOpen(row: PayloadRowForIndex): boolean {
  return !isPayloadRowClosed(row);
}

/**
 * Lowest-index open payload row for a `payloadId`, or null.
 * @param rows - All rows for one payload id (any order)
 * @returns Open row with minimum `index`, or null
 */
export function findOpenPayloadCandidate(
  rows: PayloadRowForIndex[]
): PayloadRowForIndex | null {
  const open = rows.filter(isPayloadRowOpen).sort((a, b) => a.index - b.index);
  return open[0] ?? null;
}

/**
 * Next index when starting a new send attempt (all prior rows closed).
 * @param rows - All rows for one payload id
 * @returns `0` when empty, else `MAX(index) + 1`
 */
export function nextPayloadIndexWhenAllClosed(rows: PayloadRowForIndex[]): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.index)) + 1;
}

/**
 * Unique `payloadIndex` from linked message rows (includes batch-only rows).
 * @param messages - Message rows sharing a payload id
 * @returns Single index, or null when none linked
 */
export function payloadIndexFromMessages(
  messages: MessageRowForPayloadIndex[]
): number | null {
  const indices = new Set<number>();
  for (const message of messages) {
    if (message.payloadIndex != null) indices.add(message.payloadIndex);
  }
  if (indices.size === 0) return null;
  if (indices.size === 1) return [...indices][0]!;
  return Math.min(...indices);
}

/**
 * Resolves payload `(id, index)` for a sender-side or handle event.
 * @param eventKind - Event being processed
 * @param rows - All committed payload rows for the id
 * @param options - Defer flag and optional message linkage hint
 * @returns Mutate existing index, create new index, or defer (cross-chain)
 */
export function resolvePayloadKeyForEvent(
  eventKind: PayloadEventKind,
  rows: PayloadRowForIndex[],
  options: { deferAllowed: boolean; messagePayloadIndex?: number | null }
): ResolvePayloadKeyResult {
  const open = findOpenPayloadCandidate(rows);

  if (options.messagePayloadIndex != null) {
    const linked = rows.find((r) => r.index === options.messagePayloadIndex);
    if (linked && isPayloadRowOpen(linked)) {
      return { action: "mutate", index: linked.index };
    }
  }

  switch (eventKind) {
    case "UnderpaidBatch":
      if (open) return { action: "mutate", index: open.index };
      return { action: "create", index: nextPayloadIndexWhenAllClosed(rows) };

    case "RepayBatch":
      if (open) return { action: "mutate", index: open.index };
      return { action: "defer" };

    case "SendPayload":
      if (open) return { action: "mutate", index: open.index };
      if (rows.length === 0) return { action: "create", index: 0 };
      if (rows.every(isPayloadRowClosed)) {
        return { action: "create", index: nextPayloadIndexWhenAllClosed(rows) };
      }
      return options.deferAllowed
        ? { action: "defer" }
        : { action: "create", index: nextPayloadIndexWhenAllClosed(rows) };

    case "HandlePayload": {
      const openRepaid = rows
        .filter((r) => isPayloadRowOpen(r) && r.repaidAt != null)
        .sort((a, b) => a.index - b.index);
      if (openRepaid[0]) return { action: "mutate", index: openRepaid[0].index };
      if (open) return { action: "mutate", index: open.index };
      return { action: "defer" };
    }

    default: {
      const _exhaustive: never = eventKind;
      return _exhaustive;
    }
  }
}
