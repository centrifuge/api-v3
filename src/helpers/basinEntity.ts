import type { Event } from "ponder:registry";
import type { BasinConfig } from "../config/basin";

type TxEvent = Extract<Event, { transaction: { hash: `0x${string}` }; log: { logIndex: number } }>;

/**
 * Primary key of the per-basin singleton rows (`basin_debt`, `basin_fee`).
 *
 * @param cfg - Loaded basin config
 * @returns PK object
 */
export function basinEntityKey(cfg: BasinConfig) {
  return {
    chainId: cfg.chainId,
    basinAddress: cfg.basinAddress,
    tokenId: cfg.tokenId,
  } as const;
}

/**
 * Shared first-touch fields of the per-basin singleton rows: PK, pool join key, and the
 * `lastUpdatedAt` stamps anchored to the initializing event.
 *
 * @param cfg - Loaded basin config
 * @param event - Initializing log
 * @returns Common insert fields
 */
export function basinEntityInit(cfg: BasinConfig, event: TxEvent) {
  return {
    ...basinEntityKey(cfg),
    poolId: cfg.poolId,
    lastUpdatedAt: new Date(Number(event.block.timestamp) * 1000),
    lastUpdatedAtBlock: Number(event.block.number),
  } as const;
}
