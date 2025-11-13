// Max uint64 value would overflow JavaScript Date, so we use a far future date instead (year 9999)
export const MAX_UINT64_DATE = new Date("9999-12-31T23:59:59Z");

export const V2_MIGRATION_BLOCK = 23173782;
export const V2_MIGRATION_TIMESTAMP = 1755554400; // Unix timestamp in seconds

export const V2_POOLS = {
  JTRSY: {
    poolId: 281474976710662n,
    tokenId: "0x00010000000000060000000000000001" as `0x${string}`,
    centrifugeId: "1",
    whitelistedInvestors: [
      "0x491edfb0b8b608044e227225c715981a30f3a44e",
    ],
  },
  JAAA: {
    poolId: 281474976710663n,
    tokenId: "0x00010000000000070000000000000001" as `0x${string}`,
    centrifugeId: "1",
    whitelistedInvestors: [
      "0x491edfb0b8b608044e227225c715981a30f3a44e",
      "0x227942bd9c3e4eca1b76e8199e407e6c52fdacd6",
      "0xcf5c83a12e0bd55a8c02fc7802203bc23e3efb30",
    ],
  },
} as const;
