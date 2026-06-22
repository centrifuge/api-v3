import type { Event } from "ponder:registry";

type TimestampObject<N extends string> = {
  [K in `${N}At`]: Date;
} & {
  [K in `${N}AtBlock`]: number;
} & {
  [K in `${N}AtTxHash`]: `0x${string}`;
};

type TimestampWithChainObject<N extends string> = TimestampObject<N> & {
  [K in `${N}AtChainId`]: number;
};

type NulledTimestampObject<N extends string> = {
  [K in `${N}At`]: null;
} & {
  [K in `${N}AtBlock`]: null;
} & {
  [K in `${N}AtTxHash`]: null;
};

type NulledTimestampWithChainObject<N extends string> = NulledTimestampObject<N> & {
  [K in `${N}AtChainId`]: null;
};

type TxEvent = Extract<Event, { transaction: { hash: `0x${string}` } }>;

export function timestamper<N extends string>(fieldName: N, event: TxEvent): TimestampObject<N>;

export function timestamper<N extends string>(
  fieldName: N,
  event: null | undefined
): NulledTimestampObject<N>;

/**
 * Creates a timestamp object with the given field name and event.
 *
 * @param fieldName - The name of the field to create a timestamp for
 * @param event - The event to create a timestamp for
 * @returns A timestamp object with the given field name and event
 */
export function timestamper<N extends string>(
  fieldName: N,
  event: TxEvent | null | undefined
): TimestampObject<N> | NulledTimestampObject<N> {
  if (event) {
    return {
      [fieldName + "At"]: new Date(Number(event.block.timestamp) * 1000),
      [fieldName + "AtBlock"]: Number(event.block.number),
      [fieldName + "AtTxHash"]: event.transaction.hash,
    } as TimestampObject<N>;
  } else {
    return {
      [fieldName + "At"]: event,
      [fieldName + "AtBlock"]: event,
      [fieldName + "AtTxHash"]: event,
    } as NulledTimestampObject<N>;
  }
}

/**
 * Timestamp fields including chain id for multichain fact columns.
 * @param fieldName - Base field name (e.g. prepared)
 * @param event - Ponder event or null
 * @param chainId - Chain id when event is set
 * @returns At, AtBlock, AtTxHash, AtChainId fields
 */
export function timestamperWithChain<N extends string>(
  fieldName: N,
  event: TxEvent,
  chainId: number
): TimestampWithChainObject<N>;

export function timestamperWithChain<N extends string>(
  fieldName: N,
  event: null | undefined,
  chainId?: number
): NulledTimestampWithChainObject<N>;

export function timestamperWithChain<N extends string>(
  fieldName: N,
  event: TxEvent | null | undefined,
  chainId?: number
): TimestampWithChainObject<N> | NulledTimestampWithChainObject<N> {
  if (event) {
    return {
      ...timestamper(fieldName, event),
      [fieldName + "AtChainId"]: chainId ?? 0,
    } as TimestampWithChainObject<N>;
  }
  return {
    ...timestamper(fieldName, event),
    [fieldName + "AtChainId"]: null,
  } as NulledTimestampWithChainObject<N>;
}
