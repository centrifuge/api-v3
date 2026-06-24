import { describe, expect, it } from "vitest";
import { IGNORED_TRANSFER_ADDRESSES_BY_CHAIN } from "../../src/config/ignoredTransferAddresses";
import { registerProtocolAddress } from "../../src/helpers/protocolAddresses";
import { TokenInstanceService } from "../../src/services/TokenInstanceService";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const USER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as `0x${string}`;
const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

const CHAIN_ID = 8453;

describe("TokenInstanceService.transferNeedsWork", () => {
  it("false for protocol to protocol only", () => {
    const p1 = "0x0101010101010101010101010101010101010101" as `0x${string}`;
    const p2 = "0x0202020202020202020202020202020202020202" as `0x${string}`;
    registerProtocolAddress(CHAIN_ID, p1);
    registerProtocolAddress(CHAIN_ID, p2);
    expect(TokenInstanceService.transferNeedsWork(CHAIN_ID, p1, p2)).toBe(false);
  });

  it("false for ignored DeFi to ignored DeFi only", () => {
    const u1 = IGNORED_TRANSFER_ADDRESSES_BY_CHAIN[1]![1]!;
    const u2 = IGNORED_TRANSFER_ADDRESSES_BY_CHAIN[1]![2]!;
    expect(TokenInstanceService.transferNeedsWork(1, u1, u2)).toBe(false);
  });

  it("false for Kyber executor to Aerodrome pool on Base", () => {
    const kyberExecutor = "0x63242a4ea82847b20e506b63b0e2e2eff0cc6cb0" as `0x${string}`;
    const aerodromePool = "0xf840346fafedc1c0466216f3a899a599e6d03e75" as `0x${string}`;
    expect(TokenInstanceService.transferNeedsWork(CHAIN_ID, kyberExecutor, aerodromePool)).toBe(
      false
    );
  });

  it("true when user sends to ignored DeFi contract", () => {
    const router = IGNORED_TRANSFER_ADDRESSES_BY_CHAIN[1]![1]!;
    expect(TokenInstanceService.transferNeedsWork(1, USER, router)).toBe(true);
  });

  it("true when mint leg present", () => {
    expect(TokenInstanceService.transferNeedsWork(CHAIN_ID, ZERO, USER)).toBe(true);
  });

  it("true when a random EOA is involved", () => {
    expect(TokenInstanceService.transferNeedsWork(CHAIN_ID, USER, A)).toBe(true);
  });
});
