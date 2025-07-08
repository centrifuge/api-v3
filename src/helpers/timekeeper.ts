import type { Context, Event } from 'ponder:registry'
import { BlockchainService } from '../services/BlockchainService'
import { currentChains } from '../../ponder.config'

/** Interval in seconds for snapshot periods (24 hours) */
const SNAPSHOT_INTERVAL_SECONDS = 60 * 60 * 24 // 1 day

/** Type definition for mapping chain IDs to their respective blockchain services */
type Blockchains = Record<number, BlockchainService>

/**
 * Manages the in-memory tracking of time and indexing of periods across multiple blockchain networks.
 * 
 * The Timekeeper class is responsible for:
 * - Tracking the start of periods for different blockchain networks
 * - Managing blockchain service instances for each chain
 * - Processing block events to determine if a new period has started
 * - Providing period-based time calculations
 * 
 * @example
 * ```typescript
 * const timekeeper = Timekeeper.start()
 * await timekeeper.init(context)
 * const isNewPeriod = await timekeeper.processBlock(context, blockEvent)
 * ```
 */
export class Timekeeper {
  /** Mapping of chain IDs to their respective blockchain services */
  private blockchains: Blockchains

  /**
   * Creates a new Timekeeper instance.
   * 
   * @param blockchains - Initial mapping of chain IDs to blockchain services
   */
  constructor(blockchains: Blockchains) {
    this.blockchains = blockchains
  }

  /**
   * Creates a new Timekeeper instance with an empty blockchain mapping.
   * 
   * @returns A new Timekeeper instance ready for initialization
   */
  static start(): Timekeeper {
    return new this({})
  }

  /**
   * Initializes the timekeeper for a specific blockchain network.
   * 
   * This method:
   * - Retrieves the chain ID from the context
   * - Finds the corresponding Centrifuge network configuration
   * - Initializes or retrieves the blockchain service for the chain
   * - Sets the initial period start to epoch (Jan 1, 1970) if not already set
   * 
   * @param context - The Ponder context containing chain information
   * @returns Promise that resolves to the current Timekeeper instance for chaining
   * @throws {Error} When chain ID is not a number
   */
  public async init(context: Context): Promise<Timekeeper> {
    const chainId = context.chain.id
    console.log('Initializing timekeeper for chainId', chainId)
    if (typeof chainId !== 'number') throw new Error('Chain ID is required')
    const centrifugeId = currentChains.find(network => network.network.chainId === chainId)!.network.centrifugeId
    const blockchain = await BlockchainService.getOrInit(context, { id: chainId.toString(), centrifugeId: centrifugeId.toString() }) as BlockchainService
    const lastPeriodStart = blockchain.read().lastPeriodStart
    if (!lastPeriodStart) blockchain.setLastPeriodStart(new Date(0))
    this.blockchains[chainId] = blockchain
    return this
  }

  /**
   * Checks if the timekeeper has been initialized for a specific chain.
   * 
   * @param chainId - The blockchain network ID to check
   * @returns `true` if the timekeeper is initialized for the given chain, `false` otherwise
   */
  public isInitialized(chainId: number): boolean {
    return chainId in this.blockchains
  }

  /**
   * Gets the current period start timestamp for a specific chain.
   * 
   * @param chainId - The blockchain network ID
   * @returns The timestamp representing the start of the current period
   * @throws {Error} When the timekeeper is not initialized for the specified chain
   */
  public getCurrentPeriod(chainId: number): Date {
    if (!this.isInitialized(chainId)) throw new Error(`Timekeeper not initialized for chain ${chainId}`)
    return this.blockchains[chainId]!.read().lastPeriodStart ?? new Date(0)
  }

  /**
   * Sets the last period start timestamp for a specific chain.
   * 
   * @param chainId - The blockchain network ID
   * @param timestamp - The timestamp to set as the period start
   * @returns The current Timekeeper instance for method chaining
   * @throws {Error} When the timekeeper is not initialized for the specified chain
   */
  public setLastPeriodStart(chainId: number, timestamp: Date) {
    if (!this.isInitialized(chainId)) throw new Error(`Timekeeper not initialized for chain ${chainId}`)
    this.blockchains[chainId]!.setLastPeriodStart(timestamp)
    return this
  }

  /**
   * Processes a block event to determine if it represents a new period.
   * 
   * This method:
   * - Extracts the block timestamp and converts it to a Date object
   * - Initializes the timekeeper for the chain if not already done
   * - Calculates the period start for the block's timestamp
   * - Compares it with the current period to determine if it's a new period
   * - Updates the period start if a new period is detected
   * 
   * @param context - The Ponder context containing chain information
   * @param blockEvent - The block event to process
   * @returns Promise that resolves to `true` if the block represents a new period, `false` otherwise
   */
  public async processBlock(context: Context, blockEvent: Event): Promise<boolean> {
    const chainId = context.chain.id as number
    const timestamp = new Date(Number(blockEvent.block.timestamp) * 1000)
    if (!this.isInitialized(chainId)) await this.init(context)
    const blockPeriodStart = getPeriodStart(timestamp)
    const isNewPeriod = blockPeriodStart.valueOf() > this.getCurrentPeriod(chainId).valueOf()
    if (isNewPeriod) this.setLastPeriodStart(chainId, blockPeriodStart)
    return isNewPeriod
  }

  /**
   * Persists the current state of the blockchain service for the specified chain.
   * 
   * @param context - The Ponder context containing chain information
   * @returns Promise that resolves to the current Timekeeper instance for chaining
   * @throws {Error} When the timekeeper is not initialized for the specified chain
   */
  public async update(context: Context) {
    const chainId = context.chain.id as number
    if (!this.isInitialized(chainId)) throw new Error(`Timekeeper not initialized for chain ${chainId}`)
    await this.blockchains[chainId]!.save()
    return this
  }
}

/**
 * Computes the start timestamp of the period containing the given timestamp.
 * 
 * This function calculates the beginning of the 24-hour period that contains
 * the provided timestamp. It rounds down to the nearest period boundary.
 * 
 * @param timestamp - Arbitrary timestamp, usually from a block
 * @returns The timestamp representing the start of the period containing the input timestamp
 * 
 * @example
 * ```typescript
 * const blockTime = new Date('2024-01-15T14:30:00Z')
 * const periodStart = getPeriodStart(blockTime)
 * // Returns: 2024-01-15T00:00:00Z
 * ```
 */
export function getPeriodStart(timestamp: Date): Date {
  const timestampSec = timestamp.valueOf() / 1000
  const periodStartTimestampSec = timestampSec - (timestampSec % SNAPSHOT_INTERVAL_SECONDS)
  return new Date(periodStartTimestampSec * 1000)
}