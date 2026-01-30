// Max uint64 value would overflow JavaScript Date, so we use a far future date instead (year 9999)
export const MAX_UINT64_DATE = new Date("9999-12-31T23:59:59Z");

export const V2_MIGRATION_BLOCK = 23173782;
export const V2_MIGRATION_TIMESTAMP = 1755554400; // Unix timestamp in seconds

export const V2_POOLS = {
  JTRSY: {
    poolId: 281474976710662n,
    tokenId: "0x00010000000000060000000000000001" as `0x${string}`,
    centrifugeId: "1",
    whitelistedInvestors: ["0x491edfb0b8b608044e227225c715981a30f3a44e"],
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

export const INITIAL_HOLDERS: Record<string, string[]> = {
  "281474976710662-0x00010000000000060000000000000001-1": [
    "0x491EDFB0B8b608044e227225C715981a30F3A44E",
    "0x2923c1B5313F7375fdaeE80b7745106deBC1b53E",
    "0x523DC886302932a469Cd804Cb18292d7D5C30512",
    "0x2033B1D0714b5DDd66f78d8B75317F1a0d4440De",
    "0xb3DacC732509Ba6B7F25Ad149e56cA44fE901AB9",
    "0xB19Cdd566E5ee580E068ED099136d52906e2ca09",
     "0x0000000005F458Fd6ba9EEb5f365D83b7dA913dD"
    ],
  "281474976710663-0x00010000000000070000000000000001-1": [
    "0x491EDFB0B8b608044e227225C715981a30F3A44E",
    "0x227942bD9C3e4ECA1b76E8199e407e6c52fdacd6",
    "0xB0EC6c4482Ac1Ef77bE239C0AC833CF37A27c876",
    "0xb3DacC732509Ba6B7F25Ad149e56cA44fE901AB9",
    "0xcf5C83A12E0bd55a8c02fc7802203BC23e3efB30",
    "0xb5E93B4434e63B86A2e16e3C37732E24a6af68D6",
    "0x0000000005F458Fd6ba9EEb5f365D83b7dA913dD"
  ],
};

export const getInitialHolders = (
    poolId: bigint,
    tokenId: string,
    centrifugeId: string
): string[] => {
    const key = `${poolId}-${tokenId.toLowerCase()}-${centrifugeId.toLowerCase()}`;
    return INITIAL_HOLDERS[key] || [];
};