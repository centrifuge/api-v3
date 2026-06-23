import { describe, expect, it } from "vitest";
import { IGNORED_TRANSFER_ADDRESSES_BY_CHAIN } from "../../src/config/ignoredTransferAddresses";
import { isProtocolAddress } from "../../src/helpers/protocolAddresses";
import { isUserAccount } from "../../src/helpers/userAccount";

const USER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as `0x${string}`;

describe("isProtocolAddress (seeded DeFi)", () => {
  it("true for configured Uniswap router on mainnet", () => {
    const router = IGNORED_TRANSFER_ADDRESSES_BY_CHAIN[1]![1]!;
    expect(isProtocolAddress(1, router)).toBe(true);
  });

  it("false for random EOA", () => {
    expect(isProtocolAddress(1, USER)).toBe(false);
  });
});

describe("isUserAccount", () => {
  it("false for ignored DeFi contract", () => {
    const router = IGNORED_TRANSFER_ADDRESSES_BY_CHAIN[1]![1]!;
    expect(isUserAccount(1, router)).toBe(false);
  });

  it("true for ordinary EOA", () => {
    expect(isUserAccount(1, USER)).toBe(true);
  });
});
