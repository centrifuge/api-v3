/**
 * Externally deployed DeFi contracts excluded from investor position / transfer-investor-tx
 * tracking. Share-token mint/burn legs (`from`/`to` = `0x0`) are still applied.
 *
 * Extend per chain as new DEX integrations appear. Addresses are matched
 * case-insensitively.
 */

/** CREATE2-deployed at the same address on all indexed EVM chains. */
const CROSS_CHAIN_AGGREGATOR_ADDRESSES = [
  // LI.FI
  "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae", // LiFi Diamond
  "0xc10ee9031f2a0b84766a86b55a8d90f357910fb4", // LiFi route executor
  // KyberSwap
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // MetaAggregationRouterV2
  "0x63242a4ea82847b20e506b63b0e2e2eff0cc6cb0", // Aggregator Executor V3
  // RedSnwapper
  "0xde7259893af7cdbc9fd806c6ba61d22d581d5667", // TokenChomper wrapper
] as const satisfies readonly `0x${string}`[];

export const IGNORED_TRANSFER_ADDRESSES_BY_CHAIN: Readonly<
  Record<number, readonly `0x${string}`[]>
> = {
  /** Ethereum mainnet */
  1: [
    // Uniswap V2
    "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f", // Factory
    "0x7a250d5630b4cf539739df2c5dacb4c659f2f0", // Router02
    // Uniswap V3
    "0x1f98431c8ad98523631ae4a59f267346ea31f984", // Factory
    "0xe592427a0aece92de3edee1f18e0157c05861564", // SwapRouter
    "0x68b3465833fb59a5cab7850b8c58c0e", // SwapRouter02
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af", // Universal Router
    // 0x / aggregators
    "0xdef1c0ded9bec7f1a167eff0733e3f9ee726ec15", // Exchange proxy
    // Curve (main registry)
    "0x90e00ace697ca0bfaedc6684428dd80db70a7782", // Address provider
    ...CROSS_CHAIN_AGGREGATOR_ADDRESSES,
  ],
  /** Base */
  8453: [
    // Uniswap V3
    "0x33128a8fc17869829dc68da0fc9be549299beaa8", // Factory
    "0x2626664c2603336e57b271c5c0b26f421741a481", // SwapRouter02
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af", // Universal Router
    // 0x / aggregators
    "0xdef1c0ded9bec7f1a167eff0733e3f9ee726ec15", // Exchange proxy
    ...CROSS_CHAIN_AGGREGATOR_ADDRESSES,
    // Aerodrome (Base-only pool)
    "0xf840346fafedc1c0466216f3a899a599e6d03e75", // deSPXA liquidity pool
  ],
  /** Arbitrum One */
  42161: [
    "0x1f98431c8ad98523631ae4a59f267346ea31f984", // Uniswap V3 Factory
    "0x2626664c2603336e57b271c5c0b26f421741a481", // SwapRouter02
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af", // Universal Router
    "0xdef1c0ded9bec7f1a167eff0733e3f9ee726ec15", // 0x Exchange proxy
    ...CROSS_CHAIN_AGGREGATOR_ADDRESSES,
  ],
  /** Optimism */
  10: [
    "0x1f98431c8ad98523631ae4a59f267346ea31f984", // Uniswap V3 Factory
    "0x2626664c2603336e57b271c5c0b26f421741a481", // SwapRouter02
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af", // Universal Router
    "0xdef1c0ded9bec7f1a167eff0733e3f9ee726ec15", // 0x Exchange proxy
    ...CROSS_CHAIN_AGGREGATOR_ADDRESSES,
  ],
  /** Avalanche C-Chain */
  43114: [
    "0x9e5a52f57b3038f1b8e3e5a291e7ae1e3565d4bf", // Trader Joe LB Factory
    "0x60ae616a2155ee3d9a68541badad78399f40ccb", // Trader Joe V2 Router
    "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3 SwapRouter
    "0x2626664c2603336e57b271c5c0b26f421741a481", // SwapRouter02
    ...CROSS_CHAIN_AGGREGATOR_ADDRESSES,
  ],
  /** BNB Smart Chain */
  56: [
    "0xca143ce32fe78f1f7019d7d551be04927c3be5a", // PancakeSwap V2 Factory
    "0x10ed43c718714eb63d5aa57b78b54704e256024e", // PancakeSwap V2 Router
    "0x13f4ea83d0bd40e75c8222255bc855a974568dd4", // PancakeSwap V3 SwapRouter
    "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865", // PancakeSwap V3 Factory
    ...CROSS_CHAIN_AGGREGATOR_ADDRESSES,
  ],
};
