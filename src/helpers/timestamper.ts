import type { Event } from "ponder:registry";

type TimestampObject<N extends string> = {
  [K in `${N}At`]: Date;
} & {
  [K in `${N}AtBlock`]: number;
} & {
  [K in `${N}AtTxHash`]: `0x${string}`;
};

type NulledTimestampObject<N extends string> = {
  [K in `${N}At`]: null;
} & {
  [K in `${N}AtBlock`]:  null;
} & {
  [K in `${N}AtTxHash`]:  null;
};

// Need function sugnatures tor both event cases to overload
export function timestamper<N extends string>(
  fieldName: N,
  event: Extract<Event, { transaction: any }>
): TimestampObject<N>;

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
  event: Extract<Event, { transaction: any }> | null | undefined
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
