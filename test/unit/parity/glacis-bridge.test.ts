import { describe, expect, it } from "vitest";
import {
  addressToBytes32,
  bridgeStatusForPayload,
  decodeFailReason,
  receiverToEvmAddress,
} from "../../../src/api/glacis";

describe("addressToBytes32", () => {
  const receiver = "0xca27858fef8df24148ab69f62794e6d185e7fce4";

  it("left-aligns the address, matching the protocol's bytes32(bytes20(addr))", () => {
    expect(addressToBytes32(receiver)).toBe(
      "0xca27858fef8df24148ab69f62794e6d185e7fce4000000000000000000000000"
    );
  });

  it("does not right-align: CastLib.toAddress reverts 'Input should be 20 bytes'", () => {
    // Right-aligned receivers executed the initiate leg and then reverted on the destination,
    // stranding shares at the hub (mainnet: hub -> centrifugeId 4 and hub -> centrifugeId 5).
    expect(addressToBytes32(receiver)).not.toBe(`0x${"0".repeat(24)}${receiver.slice(2)}`);
  });

  it("round-trips through the receiver decoder", () => {
    expect(receiverToEvmAddress(addressToBytes32(receiver))).toBe(receiver);
  });

  it("normalizes case and a missing 0x prefix", () => {
    expect(addressToBytes32("CA27858FEF8DF24148AB69F62794E6D185E7FCE4")).toBe(
      "0xca27858fef8df24148ab69f62794e6d185e7fce4000000000000000000000000"
    );
  });
});

describe("receiverToEvmAddress", () => {
  it("reads the high 20 bytes of a left-aligned receiver", () => {
    // Payload 0x29cfdfcb… — reading the low 20 bytes produced the bogus
    // 0x2794e6d185e7fce4000000000000000000000000 seen by integrators.
    expect(
      receiverToEvmAddress("0xca27858fef8df24148ab69f62794e6d185e7fce4000000000000000000000000")
    ).toBe("0xca27858fef8df24148ab69f62794e6d185e7fce4");
  });

  it("still decodes right-aligned receivers that exist on chain", () => {
    expect(
      receiverToEvmAddress("0x000000000000000000000000e72fe64840f4ef80e3ec73a1c749491b5c938cb9")
    ).toBe("0xe72fe64840f4ef80e3ec73a1c749491b5c938cb9");
  });

  it("returns null for a 32-byte non-EVM receiver instead of inventing an address", () => {
    // Base -> centrifugeId 7 deJAAA transfers carry a full 32-byte receiver.
    expect(
      receiverToEvmAddress("0xe0ea91247c6c5ae160e0baf2369d02ea88039514d17038ea7a4ae28fe3839b70")
    ).toBeNull();
  });

  it("returns null for malformed or wrong-length words", () => {
    expect(receiverToEvmAddress("0x1234")).toBeNull();
    expect(receiverToEvmAddress("0xnothex")).toBeNull();
    expect(receiverToEvmAddress(`0x${"z".repeat(64)}`)).toBeNull();
  });

  it("decodes the zero receiver", () => {
    expect(receiverToEvmAddress(`0x${"0".repeat(64)}`)).toBe(
      "0x0000000000000000000000000000000000000000"
    );
  });
});

describe("decodeFailReason", () => {
  it("decodes an Error(string) revert", () => {
    const encoded =
      "0x08c379a0" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000018" +
      "496e7075742073686f756c642062652032302062797465730000000000000000";
    expect(decodeFailReason(encoded)).toBe("Input should be 20 bytes");
  });

  it("returns the bare selector for a custom error (EmptyAdapterSet)", () => {
    expect(decodeFailReason("0x989a390f")).toBe("0x989a390f");
  });

  it("returns null when there is no failure", () => {
    expect(decodeFailReason(null)).toBeNull();
    expect(decodeFailReason(undefined)).toBeNull();
    expect(decodeFailReason("0x")).toBeNull();
  });

  it("falls back to the selector on a truncated Error(string) body", () => {
    expect(decodeFailReason("0x08c379a00000")).toBe("0x08c379a0");
  });
});

describe("bridgeStatusForPayload", () => {
  it("reports PartiallyFailed as pending, never DONE", () => {
    // A failed message is retryable: the indexer clears failedAt/failReason on a successful
    // retry and the payload then derives to Completed.
    expect(bridgeStatusForPayload("PartiallyFailed", new Date())).toEqual({
      status: "PENDING",
      substatus: "WAIT_DESTINATION_TRANSACTION",
    });
  });

  it("reports Completed as DONE", () => {
    expect(bridgeStatusForPayload("Completed", new Date())).toEqual({
      status: "DONE",
      substatus: "COMPLETED",
    });
  });

  it("distinguishes source and destination waits for in-flight payloads", () => {
    expect(bridgeStatusForPayload("InTransit", null).substatus).toBe("WAIT_SOURCE_CONFIRMATIONS");
    expect(bridgeStatusForPayload("InTransit", new Date()).substatus).toBe(
      "WAIT_DESTINATION_TRANSACTION"
    );
    expect(bridgeStatusForPayload("Underpaid", null).substatus).toBe("WAIT_SOURCE_CONFIRMATIONS");
    expect(bridgeStatusForPayload("Delivered", new Date()).substatus).toBe(
      "WAIT_DESTINATION_TRANSACTION"
    );
  });

  it("never returns a terminal status for an unknown payload state", () => {
    expect(bridgeStatusForPayload("SomethingNew", null)).toEqual({
      status: "PENDING",
      substatus: "UNKNOWN_ERROR",
    });
  });
});
