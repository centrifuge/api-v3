import { describe, expect, it } from "vitest";
import { decodeAbiParameters, encodeAbiParameters } from "viem";
import { MAX_UINT64_DATE } from "../../../src/config";
import {
  decodeOnOfframpManagerTrustedCall,
  decodeUpdateRestriction,
} from "../../../src/helpers/updateContractDecoders";

/** CastLib.toBytes32(address): address in the high 20 bytes, low 12 bytes zero. */
function castLibToBytes32(address: `0x${string}`): `0x${string}` {
  return `0x${address.slice(2).toLowerCase().padEnd(64, "0")}` as `0x${string}`;
}

describe("decodeOnOfframpManagerTrustedCall", () => {
  it("decodes Offramp kind with CastLib left-padded receiver (HYB Avax regression)", () => {
    const receiver = "0xa5aaf18275cb27245e6d0f6bf2bbcbb0f9bf2498" as const;
    const assetId = 25961484292674138142652481646100481n;
    const payload = encodeAbiParameters(
      [{ type: "uint8" }, { type: "uint128" }, { type: "bytes32" }, { type: "bool" }],
      [2, assetId, castLibToBytes32(receiver), true]
    );

    const decoded = decodeOnOfframpManagerTrustedCall(payload);
    expect(decoded).toEqual({
      kind: "Offramp",
      assetId,
      receiverAddress: receiver,
      isEnabled: true,
    });
    expect(decoded?.kind === "Offramp" ? decoded.receiverAddress : null).not.toBe(
      "0xf2bbcbb0f9bf2498000000000000000000000000"
    );
  });

  it("does not misread left-padded bytes32 as ABI address (old decode bug)", () => {
    const receiver = "0xa5aaf18275cb27245e6d0f6bf2bbcbb0f9bf2498" as const;
    const assetId = 25961484292674138142652481646100481n;
    const payload = encodeAbiParameters(
      [{ type: "uint8" }, { type: "uint128" }, { type: "bytes32" }, { type: "bool" }],
      [2, assetId, castLibToBytes32(receiver), true]
    );

    const wrongRow = decodeAbiParameters(
      [{ type: "uint8" }, { type: "uint128" }, { type: "address" }, { type: "bool" }],
      payload
    );
    expect(wrongRow[2].toLowerCase()).toBe("0xf2bbcbb0f9bf2498000000000000000000000000");
  });

  it("decodes Relayer kind with CastLib left-padded address", () => {
    const relayer = "0xa5aaf18275cb27245e6d0f6bf2bbcbb0f9bf2498" as const;
    const payload = encodeAbiParameters(
      [{ type: "uint8" }, { type: "bytes32" }, { type: "bool" }],
      [1, castLibToBytes32(relayer), true]
    );

    expect(decodeOnOfframpManagerTrustedCall(payload)).toEqual({
      kind: "Relayer",
      relayerAddress: relayer,
      isEnabled: true,
    });
  });
});

/** Builds `abi.encodePacked(uint8, bytes32, uint64)` = 41 bytes for a Member restriction. */
function encodeUpdateRestrictionMember(
  user: `0x${string}`,
  validUntil: bigint
): `0x${string}` {
  const kind = Buffer.from([0x01]);
  const userBytes = Buffer.from(user.slice(2).toLowerCase().padEnd(64, "0"), "hex");
  const validUntilBuf = Buffer.alloc(8);
  validUntilBuf.writeBigUInt64BE(validUntil);
  return `0x${Buffer.concat([kind, userBytes, validUntilBuf]).toString("hex")}` as `0x${string}`;
}

/** Builds `abi.encodePacked(uint8, bytes32)` = 33 bytes for Freeze (0x02) or Unfreeze (0x03). */
function encodeUpdateRestrictionFreezeOrUnfreeze(
  kind: 0x02 | 0x03,
  user: `0x${string}`
): `0x${string}` {
  const kindBuf = Buffer.from([kind]);
  const userBytes = Buffer.from(user.slice(2).toLowerCase().padEnd(64, "0"), "hex");
  return `0x${Buffer.concat([kindBuf, userBytes]).toString("hex")}` as `0x${string}`;
}

describe("decodeUpdateRestriction", () => {
  const user = "0x474ec0f2634565e27764b21319ec9141892f31fd" as `0x${string}`;

  it("decodes a Member with a normal Unix-seconds validUntil", () => {
    const validUntil = 1_785_220_752n;
    const payload = encodeUpdateRestrictionMember(user, validUntil);

    const decoded = decodeUpdateRestriction(payload);
    expect(decoded).toEqual({
      kind: "Member",
      accountAddress: user,
      validUntil: new Date(Number(validUntil * 1000n)),
    });
    expect(decoded?.kind === "Member" ? decoded.validUntil.toISOString() : "").toBe(
      "2026-07-28T06:39:12.000Z"
    );
  });

  it("clamps a Member validUntil that overflows Postgres timestamptz (year 61971 regression)", () => {
    // 0x1b8dac5b400 = 1,893,455,999,000 seconds = year ~61971 AD. From the failing testnet event.
    const validUntil = 0x1b8dac5b400n;
    const payload = encodeUpdateRestrictionMember(user, validUntil);

    const decoded = decodeUpdateRestriction(payload);
    expect(decoded?.kind).toBe("Member");
    if (decoded?.kind !== "Member") return;
    expect(decoded.validUntil.toISOString()).toBe(MAX_UINT64_DATE.toISOString());
  });

  it("clamps type(uint64).max (protocol 'forever' sentinel) to MAX_UINT64_DATE", () => {
    const payload = encodeUpdateRestrictionMember(user, 2n ** 64n - 1n);

    const decoded = decodeUpdateRestriction(payload);
    expect(decoded?.kind).toBe("Member");
    if (decoded?.kind !== "Member") return;
    expect(decoded.validUntil.toISOString()).toBe(MAX_UINT64_DATE.toISOString());
  });

  it("keeps validUntil = 0 faithful as epoch (1970-01-01)", () => {
    const payload = encodeUpdateRestrictionMember(user, 0n);

    const decoded = decodeUpdateRestriction(payload);
    expect(decoded?.kind).toBe("Member");
    if (decoded?.kind !== "Member") return;
    expect(decoded.validUntil.toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("decodes Freeze", () => {
    const payload = encodeUpdateRestrictionFreezeOrUnfreeze(0x02, user);

    expect(decodeUpdateRestriction(payload)).toEqual({
      kind: "Freeze",
      accountAddress: user,
    });
  });

  it("decodes Unfreeze", () => {
    const payload = encodeUpdateRestrictionFreezeOrUnfreeze(0x03, user);

    expect(decodeUpdateRestriction(payload)).toEqual({
      kind: "Unfreeze",
      accountAddress: user,
    });
  });

  it("returns null for an unknown kind byte", () => {
    const kindBuf = Buffer.from([0xff]);
    const userBytes = Buffer.from(user.slice(2).toLowerCase().padEnd(64, "0"), "hex");
    const payload = `0x${Buffer.concat([kindBuf, userBytes]).toString("hex")}` as `0x${string}`;

    expect(decodeUpdateRestriction(payload)).toBeNull();
  });

  it("returns null for a Member payload with wrong length", () => {
    const kindBuf = Buffer.from([0x01]);
    const userBytes = Buffer.from(user.slice(2).toLowerCase().padEnd(64, "0"), "hex");
    const payload = `0x${Buffer.concat([kindBuf, userBytes]).toString("hex")}` as `0x${string}`;

    expect(decodeUpdateRestriction(payload)).toBeNull();
  });
});
