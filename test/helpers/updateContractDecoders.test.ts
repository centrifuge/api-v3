import { describe, expect, it } from "vitest";
import { decodeAbiParameters, encodeAbiParameters } from "viem";
import { decodeOnOfframpManagerTrustedCall } from "../../src/helpers/updateContractDecoders";

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
