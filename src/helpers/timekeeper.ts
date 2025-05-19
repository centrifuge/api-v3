import type { Context, Event } from 'ponder:registry'
import { BlockchainService } from '../services/BlockchainService'
import { MessageDispatcherAbi } from '../../abis/MessageDispatcherAbi'
import { currentNetwork } from '../../ponder.config'

const SNAPSHOT_INTERVAL_SECONDS = 60 * 60 * 24 // 1 day
/**
 * Manages the in memory tracking of time and indexing of periods
 */
type Blockchains = Record<number, BlockchainService>
export class Timekeeper {
  private blockchains: Blockchains

  constructor(blockchains: Blockchains) {
    this.blockchains = blockchains
  }

  static start(): Timekeeper {
    return new this({})
  }

  public async init(context: Context): Promise<Timekeeper> {
    const chainId = context.network.chainId
    const centrifugeId = await context.client.readContract({
      address: currentNetwork.contracts.messageDispatcher,
      abi: MessageDispatcherAbi,
      functionName: 'localCentrifugeId'
    })
    const blockchain = await BlockchainService.getOrInit(context, { id: chainId.toString(), centrifugeId: centrifugeId.toString() }) as BlockchainService
    const lastPeriodStart = blockchain.read().lastPeriodStart
    if (!lastPeriodStart) blockchain.setLastPeriodStart(new Date(0))
    this.blockchains[chainId] = blockchain
    return this
  }

  public isInitialized(chainId: number): boolean {
    return chainId in this.blockchains
  }

  public getCurrentPeriod(chainId: number): Date {
    if (!this.isInitialized(chainId)) throw new Error(`Timekeeper not initialized for chain ${chainId}`)
    return this.blockchains[chainId]!.read().lastPeriodStart ?? new Date(0)
  }

  public setLastPeriodStart(chainId: number, timestamp: Date) {
    if (!this.isInitialized(chainId)) throw new Error(`Timekeeper not initialized for chain ${chainId}`)
    this.blockchains[chainId]!.setLastPeriodStart(timestamp)
    return this
  }

  public async processBlock(context: Context, blockEvent: Event): Promise<boolean> {
    const chainId = context.network.chainId
    const timestamp = new Date(Number(blockEvent.block.timestamp) * 1000)
    if (!this.isInitialized(chainId)) await this.init(context)
    const blockPeriodStart = getPeriodStart(timestamp)
    const isNewPeriod = blockPeriodStart.valueOf() > this.getCurrentPeriod(chainId).valueOf()
    if (isNewPeriod) this.setLastPeriodStart(chainId, blockPeriodStart)
    return isNewPeriod
  }

  public async update(context: Context) {
    const chainId = context.network.chainId
    if (!this.isInitialized(chainId)) throw new Error(`Timekeeper not initialized for chain ${chainId}`)
    await this.blockchains[chainId]!.save()
    return this
  }
}

/**
 * Computes the start timestamp given an arbitrary block timestamb
 * @param timestamp Arbitrary timestamp, usually from a block
 * @returns Corresponding timestamp at the start of the period
 */
export function getPeriodStart(timestamp: Date): Date {
  const timestampSec = timestamp.valueOf() / 1000
  const periodStartTimestampSec = timestampSec - (timestampSec % SNAPSHOT_INTERVAL_SECONDS)
  return new Date(periodStartTimestampSec * 1000)
}