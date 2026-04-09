import { Blockchain } from "ponder:schema";
import { Service } from "./Service";
import { Context } from "ponder:registry";
import { networkNames, RegistryChains } from "../chains";

type Network = (typeof RegistryChains)[number]["network"];
type InMemoryChainId = {
  [K in Network["chainId"]]: Extract<Network, { chainId: K }>["centrifugeId"];
};
const inMemoryChainId = Object.fromEntries(
  RegistryChains.map((chain) => [chain.network.chainId, chain.network.centrifugeId])
) as InMemoryChainId;

/** centrifugeId -> chainId for the chain that has that centrifugeId (e.g. spoke chain). */
const centrifugeIdToChainId = Object.fromEntries(
  RegistryChains.map((chain) => [String(chain.network.centrifugeId), chain.network.chainId])
) as Record<string, number>;

/**
 * Service class for managing blockchain-related operations and data.
 *
 * This service extends the base Service class with blockchain-specific functionality,
 * providing methods to interact with and manipulate blockchain data entities.
 *
 * @extends {Service<typeof Blockchain>}
 */
export class BlockchainService extends Service<typeof Blockchain> {
  static readonly entityTable = Blockchain;
  static readonly entityName = "Blockchain";
  /**
   * Gets the Centrifuge ID for a given chain ID.
   *
   * @param context - The database and client context
   * @returns The Centrifuge ID as a string
   * @throws {Error} When chain ID is not a number or blockchain is not found
   */
  static async getCentrifugeId(context: Context) {
    const chainId = context.chain.id;
    if (typeof chainId !== "number") throw new Error("Chain ID is not a number");
    if (!(chainId in inMemoryChainId)) throw new Error("Chain ID not found in inMemoryChainId");
    return String(inMemoryChainId[chainId as keyof InMemoryChainId]);
  }

  /**
   * Gets the chain ID for a given centrifuge ID (e.g. spoke chain).
   * Use when the event is on the hub but the vault is deployed on the spoke.
   */
  static getChainIdFromCentrifugeId(centrifugeId: string): number | null {
    const chainId = centrifugeIdToChainId[centrifugeId];
    return chainId != null ? chainId : null;
  }

  /**
   * Centrifuge id for a chain from registry config (`RegistryChains`), if that chain is indexed.
   *
   * @param chainId - EVM chain id
   * @returns Centrifuge network id as string, or null if unknown
   */
  static getCentrifugeIdFromChainId(chainId: number): string | null {
    if (!(chainId in inMemoryChainId)) return null;
    return String(inMemoryChainId[chainId as keyof InMemoryChainId]);
  }

  /**
   * Short display label for a chain id from `networkNames` in `chains.ts`.
   *
   * @param chainId - EVM chain id
   */
  static networkNameFromChainId(chainId: number): string {
    const netKey = networkNames[String(chainId) as keyof typeof networkNames];
    return netKey ? `${netKey.charAt(0).toUpperCase()}${netKey.slice(1)}` : `Chain ${chainId}`;
  }

  /**
   * Sets the last period start date for the blockchain.
   *
   * This method updates the blockchain's last period start timestamp, which is typically
   * used to track the beginning of the most recent operational period or epoch.
   *
   * @param {Date} lastPeriodStart - The date representing the start of the last period
   * @returns {this} Returns the current BlockchainService instance for method chaining
   *
   * @example
   * ```typescript
   * const blockchainService = new BlockchainService();
   * blockchainService.setLastPeriodStart(new Date('2024-01-01'));
   * ```
   */
  public setLastPeriodStart(lastPeriodStart: Date) {
    this.data.lastPeriodStart = lastPeriodStart;
    return this;
  }
}
