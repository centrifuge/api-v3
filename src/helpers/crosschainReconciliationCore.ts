/** Minimal message row shape for send-target selection (no Ponder imports). */
export type MessageRowForPick = {
  index: number;
  preparedAt: Date | null;
  batchedAt?: Date | null;
  repaidAt?: Date | null;
  failedAt?: Date | null;
  executedAt?: Date | null;
};

/** Row accessor used by pickSendTarget. */
export type MessageRowRef = { read: () => MessageRowForPick };

/** Normalized gateway receive fact for execute/fail reconciliation. */
export type MessageReceiveEntry = {
  source: "incoming" | "queue";
  status: "execute" | "fail";
  messageId: `0x${string}`;
  receivedAt: Date;
  receivedAtBlock: number;
};

/**
 * Send anchor timestamp for a committed message row (latest send-side fact before receive).
 * @param row - Message row data
 * @returns Anchor time or null
 */
export function getMessageSendAnchorAt(row: {
  preparedAt: Date | null;
  batchedAt?: Date | null;
  repaidAt?: Date | null;
}): Date | null {
  return row.repaidAt ?? row.batchedAt ?? row.preparedAt ?? null;
}

/**
 * Send anchor timestamp for a committed payload row.
 * @param row - Payload row data
 * @returns Anchor time or null
 */
export function getPayloadSendAnchorAt(row: {
  preparedAt: Date | null;
  repaidAt: Date | null;
}): Date | null {
  return row.repaidAt ?? row.preparedAt ?? null;
}

/**
 * Causal ordering: receive must not precede the send anchor.
 * Uses `>=` so equal block timestamps (common across chains) match omnichain main,
 * which has no timestamp gate when send is already indexed.
 * @param receivedAt - Receive timestamp
 * @param sendAnchorAt - Send anchor timestamp
 * @returns Whether causal rule passes
 */
export function passesCausalOrder(receivedAt: Date, sendAnchorAt: Date | null): boolean {
  if (!sendAnchorAt) return false;
  return receivedAt.getTime() >= sendAnchorAt.getTime();
}

/**
 * Picks the committed message row index for a receive fact.
 * Matches origin/main `getFromAwaitingBatchDeliveryOrFailedQueue` (lowest qualifying index).
 * @param rows - Committed rows for one message id
 * @param status - execute or fail
 * @returns Target row or null
 */
export function pickSendTarget(
  rows: MessageRowRef[],
  status: "execute" | "fail"
): MessageRowRef | null {
  const withAnchor = rows.filter((r) => getMessageSendAnchorAt(r.read()) != null);
  if (withAnchor.length === 0) return null;

  if (status === "fail") {
    const open = withAnchor.filter((r) => r.read().executedAt == null);
    if (open.length === 0) return null;
    return open.reduce((min, r) => (r.read().index < min.read().index ? r : min));
  }

  const retryFailed = withAnchor.filter((r) => {
    const d = r.read();
    return d.failedAt != null && d.executedAt == null;
  });
  if (retryFailed.length > 0) {
    return retryFailed.reduce((min, r) => (r.read().index < min.read().index ? r : min));
  }

  const open = withAnchor.filter((r) => {
    const d = r.read();
    return d.executedAt == null && d.failedAt == null;
  });
  if (open.length === 0) return null;
  return open.reduce((min, r) => (r.read().index < min.read().index ? r : min));
}

/**
 * FIFO sort for message receive work list (fail before execute at equal time).
 * @param entries - Entries to sort
 * @returns Sorted copy
 */
export function sortMessageQueueFifo<T extends MessageReceiveEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const ta = a.receivedAt.getTime();
    const tb = b.receivedAt.getTime();
    if (ta !== tb) return ta - tb;
    if (a.status === "fail" && b.status === "execute") return -1;
    if (a.status === "execute" && b.status === "fail") return 1;
    return a.receivedAtBlock - b.receivedAtBlock;
  });
}
