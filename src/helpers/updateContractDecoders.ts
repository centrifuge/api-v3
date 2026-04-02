/**
 * Decoders for `hub:UpdateContract` calldata-style payloads: Merkle policy layout detection,
 * `ISyncManager` trusted calls, `IOnOfframpManager` trusted calls, and `hub:UpdateRestriction`
 * packed payloads (via viem + word-layout guards).
 */

import { decodeAbiParameters, hexToBigInt, hexToNumber, slice } from "viem";
import { formatBytes32ToAddress } from "./formatter";

/** Word size in bytes for ABI static encoding (`abi.encode` slots). */
const WORD_SIZE = 32;

/** Total byte length of a payload made of `n` ABI words (each 32 bytes). */
function word(n: number): number {
  return n * WORD_SIZE;
}

/**
 * Runs a synchronous decoder and maps thrown errors to `null`.
 * @param fn - Closure that calls viem or other decoding that may throw.
 * @returns The function result, or `null` if it threw.
 */
function safeDecode<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Whether a 32-byte word looks like a Solidity ABI-encoded `uint8` (value in the last byte only).
 * Used to tell Merkle `bytes32` words apart from a TrustedCall `uint8` discriminator.
 * @param chunk - Exactly 32 bytes.
 */
function isAbiUint8PaddedWord(chunk: Buffer): boolean {
  for (let i = 0; i < 31; i++) if (chunk[i] !== 0) return false;
  return true;
}

/**
 * Whether the high 16 bytes of a word are zero (typical top padding for a right-aligned `uint128`).
 * @param b - Full ABI payload buffer.
 * @param wordIndex - 0-based word index.
 */
function isWordZeroPaddedUint128(b: Buffer, wordIndex: number): boolean {
  const start = wordIndex * WORD_SIZE;
  for (let i = 0; i < 16; i++) if (b[start + i] !== 0) return false;
  return true;
}

/**
 * Reads the leading `uint8` from the first ABI word of `payload`.
 * @param payload - Full hex payload (`0x` + even hex).
 * @returns The kind byte as a number, or `null` if the first word is missing or invalid.
 */
function decodeLeadingUint8(payload: `0x${string}`): number | null {
  const hex = payload.slice(2);
  if (hex.length < 64) return null;
  const firstWord = `0x${hex.slice(0, 64)}` as `0x${string}`;
  const row = safeDecode(() =>
    decodeAbiParameters([{ type: "uint8" }], firstWord)
  );
  if (!row) return null;
  return Number(row[0]);
}

/**
 * Detects the Merkle proof manager policy payload shape: exactly two words, first word **not**
 * ABI `uint8`-padded (so it is not a TrustedCall kind byte).
 * @param payload - Hex-encoded trusted-call payload.
 * @returns `true` when length and first word match the Merkle policy layout gate.
 */
export function isMerklePolicyPayloadShape(payload: `0x${string}`): boolean {
  const b = Buffer.from(payload.slice(2), "hex");
  if (b.length !== word(2)) return false;
  if (isAbiUint8PaddedWord(b.subarray(0, WORD_SIZE))) return false;
  return true;
}

/**
 * Decodes `MerkleProofManager.trustedCall` policy update data: `abi.encode(bytes32 who, bytes32 what)`.
 * Caller should gate with {@link isMerklePolicyPayloadShape} first (or rely on this function’s internal check).
 * @param payload - Full ABI-encoded payload.
 * @returns Strategist / `who` address derived from the first `bytes32`, or `null` if shape or decode fails.
 */
export function decodeMerklePolicyUpdatePayload(payload: `0x${string}`): `0x${string}` | null {
  if (!isMerklePolicyPayloadShape(payload)) return null;
  const row = safeDecode(() =>
    decodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      payload
    )
  );
  if (!row) return null;
  const [who] = row;
  return formatBytes32ToAddress(who);
}

/**
 * Discriminated union for `ISyncManager.TrustedCall`: valuation update vs vault max reserve.
 */
export type DecodedSyncManagerTrustedCall =
  | { kind: "Valuation"; valuation: `0x${string}` }
  | { kind: "MaxReserve"; assetId: bigint; maxReserve: bigint };

/**
 * Decodes `ISyncManager.TrustedCall` payloads only (kind `0` Valuation, kind `1` MaxReserve).
 * Rejects ambiguous or non-matching layouts (e.g. kind `1` with two uint128-shaped words is MaxReserve only).
 * @param payload - Full ABI-encoded trusted call body.
 * @returns Parsed variant or `null`.
 */
export function decodeSyncManagerTrustedCall(payload: `0x${string}`): DecodedSyncManagerTrustedCall | null {
  const b = Buffer.from(payload.slice(2), "hex");
  if (b.length < WORD_SIZE) return null;

  const kindValue = decodeLeadingUint8(payload);
  if (kindValue === 0) {
    if (b.length !== word(2)) return null;
    const row = safeDecode(() =>
      decodeAbiParameters(
        [{ type: "uint8" }, { type: "address" }],
        payload
      )
    );
    if (!row) return null;
    return {
      kind: "Valuation",
      valuation: formatBytes32ToAddress(row[1]),
    };
  }
  if (kindValue === 1) {
    if (
      b.length !== word(3) ||
      !isWordZeroPaddedUint128(b, 1) ||
      !isWordZeroPaddedUint128(b, 2)
    ) {
      return null;
    }
    const row = safeDecode(() =>
      decodeAbiParameters(
        [{ type: "uint8" }, { type: "uint128" }, { type: "uint128" }],
        payload
      )
    );
    if (!row) return null;
    return {
      kind: "MaxReserve",
      assetId: row[1],
      maxReserve: row[2],
    };
  }
  return null;
}

/**
 * Discriminated union for `IOnOfframpManager.TrustedCall` (onramp / relayer / offramp / withdraw).
 */
export type DecodedOnOfframpManagerTrustedCall =
  | { kind: "Onramp"; assetId: bigint; isEnabled: boolean }
  | { kind: "Relayer"; relayerAddress: `0x${string}`; isEnabled: boolean }
  | { kind: "Offramp"; assetId: bigint; receiverAddress: `0x${string}`; isEnabled: boolean }
  | { kind: "Withdraw"; assetId: bigint; amount: bigint; receiverAddress: `0x${string}` };

/**
 * Decodes `IOnOfframpManager.TrustedCall` payloads (kinds 0–3). Does not handle sync manager or hook layouts.
 * Kind `1` rejects two uint128-shaped words so MaxReserve-shaped sync payloads are not misread as Relayer.
 * @param payload - Full ABI-encoded trusted call body.
 * @returns Parsed variant or `null`.
 */
export function decodeOnOfframpManagerTrustedCall(
  payload: `0x${string}`
): DecodedOnOfframpManagerTrustedCall | null {
  const b = Buffer.from(payload.slice(2), "hex");
  if (b.length < WORD_SIZE) return null;

  const kindValue = decodeLeadingUint8(payload);
  if (kindValue === null || kindValue > 3) return null;

  if (kindValue === 0) {
    if (b.length !== word(3) || !isWordZeroPaddedUint128(b, 1)) return null;
    const row = safeDecode(() =>
      decodeAbiParameters(
        [{ type: "uint8" }, { type: "uint128" }, { type: "bool" }],
        payload
      )
    );
    if (!row) return null;
    return {
      kind: "Onramp",
      assetId: row[1],
      isEnabled: row[2],
    };
  }

  if (kindValue === 1) {
    if (b.length !== word(3)) return null;
    if (isWordZeroPaddedUint128(b, 1) && isWordZeroPaddedUint128(b, 2)) {
      return null;
    }
    const row = safeDecode(() =>
      decodeAbiParameters(
        [{ type: "uint8" }, { type: "address" }, { type: "bool" }],
        payload
      )
    );
    if (!row) return null;
    return {
      kind: "Relayer",
      relayerAddress: formatBytes32ToAddress(row[1]),
      isEnabled: row[2],
    };
  }

  if (kindValue === 2) {
    if (b.length !== word(4)) return null;
    const row = safeDecode(() =>
      decodeAbiParameters(
        [
          { type: "uint8" },
          { type: "uint128" },
          { type: "address" },
          { type: "bool" },
        ],
        payload
      )
    );
    if (!row) return null;
    return {
      kind: "Offramp",
      assetId: row[1],
      receiverAddress: formatBytes32ToAddress(row[2]),
      isEnabled: row[3],
    };
  }

  if (kindValue === 3) {
    if (b.length !== word(4)) return null;
    const row = safeDecode(() =>
      decodeAbiParameters(
        [
          { type: "uint8" },
          { type: "uint128" },
          { type: "uint128" },
          { type: "address" },
        ],
        payload
      )
    );
    if (!row) return null;
    return {
      kind: "Withdraw",
      assetId: row[1],
      amount: row[2],
      receiverAddress: formatBytes32ToAddress(row[3]),
    };
  }

  return null;
}

/** Numeric `UpdateRestrictionType` values from `UpdateRestrictionMessageLib` (cfg-protocol). */
const UPDATE_RESTRICTION_TYPE = {
  Invalid: 0,
  Member: 1,
  Freeze: 2,
  Unfreeze: 3,
} as const;

const UPDATE_RESTRICTION_LEN = {
  /** `abi.encodePacked(uint8, bytes32, uint64)` */
  Member: 1 + 32 + 8,
  /** `abi.encodePacked(uint8, bytes32)` */
  FreezeOrUnfreeze: 1 + 32,
} as const;

/**
 * Discriminated union for `hub:UpdateRestriction` payloads: `abi.encodePacked` per
 * `UpdateRestrictionMessageLib` (Member / Freeze / Unfreeze).
 */
export type DecodedUpdateRestriction =
  | { kind: "Member"; accountAddress: `0x${string}`; validUntil: Date }
  | { kind: "Freeze"; accountAddress: `0x${string}` }
  | { kind: "Unfreeze"; accountAddress: `0x${string}` };

/**
 * Decodes `UpdateRestriction` event `payload` bytes (packed layout from the protocol message lib).
 * @param payload - `abi.encodePacked` body (`uint8` kind, `bytes32` user, optional `uint64` validUntil).
 * @returns Parsed variant or `null` for unknown kind or length mismatch.
 */
export function decodeUpdateRestriction(payload: `0x${string}`): DecodedUpdateRestriction | null {
  const b = Buffer.from(payload.slice(2), "hex");
  if (b.length < 1) return null;

  const kindValue = safeDecode(() => hexToNumber(slice(payload, 0, 1)));
  if (kindValue === null) return null;

  if (kindValue === UPDATE_RESTRICTION_TYPE.Member) {
    if (b.length !== UPDATE_RESTRICTION_LEN.Member) return null;
    const accountAddress = formatBytes32ToAddress(slice(payload, 1, 33));
    const validUntilSecs = safeDecode(() => hexToBigInt(slice(payload, 33, 41)));
    if (validUntilSecs === null) return null;
    const ms = Number(validUntilSecs * 1000n);
    const validUntil = Number.isSafeInteger(ms)
      ? new Date(ms)
      : new Date("9999-12-31T23:59:59Z");
    return { kind: "Member", accountAddress, validUntil };
  }

  if (kindValue === UPDATE_RESTRICTION_TYPE.Freeze) {
    if (b.length !== UPDATE_RESTRICTION_LEN.FreezeOrUnfreeze) return null;
    return {
      kind: "Freeze",
      accountAddress: formatBytes32ToAddress(slice(payload, 1, 33)),
    };
  }

  if (kindValue === UPDATE_RESTRICTION_TYPE.Unfreeze) {
    if (b.length !== UPDATE_RESTRICTION_LEN.FreezeOrUnfreeze) return null;
    return {
      kind: "Unfreeze",
      accountAddress: formatBytes32ToAddress(slice(payload, 1, 33)),
    };
  }

  return null;
}
