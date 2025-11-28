import { Blockchain } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { Context } from "ponder:registry";
import { RegistryChains } from "../chains";


type Network = typeof RegistryChains[number]["network"];
type InMemoryChainId = { [K in Network["chainId"]]: Extract<Network, { chainId: K }>['centrifugeId']}
const inMemoryChainId = Object.fromEntries(RegistryChains.map((chain) => [chain.network.chainId, chain.network.centrifugeId])) as InMemoryChainId

/**
 * Service class for managing blockchain-related operations and data.
 *
 * This service extends the base Service class with blockchain-specific functionality,
 * providing methods to interact with and manipulate blockchain data entities.
 *
 * @extends {ReturnType<typeof mixinCommonStatics>}
 */
export class BlockchainService extends mixinCommonStatics(
  Service<typeof Blockchain>,
  Blockchain,
  "Blockchain"
) {
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
    return String(inMemoryChainId[chainId as keyof InMemoryChainId])
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
