import { Pool } from "ponder:schema";
import { ShareClassManagerAbi } from "../../abis/ShareClassManagerAbi";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing pool-related operations and interactions with the blockchain.
 * Extends the base Service class with pool-specific functionality including share class management
 * and epoch tracking.
 */
export class PoolService extends mixinCommonStatics(Service<typeof Pool>, Pool, "Pool") {
  /**
   * Retrieves the total count of share classes associated with this pool.
   * 
   * @returns A promise that resolves to the number of share classes for this pool.
   * @throws {Error} If the pool has no associated share class manager.
   */
  public getShareClassCount() {
    if (!this.data.shareClassManager) {
      throw new Error(`Pool with id ${this.data.id} has no shareClassManager`);
    }
    return this.client.readContract({
      address: this.data.shareClassManager as `0x${string}`,
      abi: ShareClassManagerAbi,
      functionName: "shareClassCount",

      args: [this.data.id],
    });
  }

  /**
   * Retrieves all share class IDs associated with this pool using multicall for efficiency.
   * 
   * This method fetches the share class count first, then uses a multicall to retrieve
   * all share class IDs in parallel, handling any failed calls gracefully.
   * 
   * @returns A promise that resolves to an array of tuples containing [index, shareClassId].
   *          Each tuple contains the index (number) and the corresponding share class ID (0x-prefixed string).
   * @throws {Error} If the pool has no associated share class manager.
   */
  public async getShareClassIds() {
    const shareClassCount = await this.getShareClassCount();
    if (!this.data.shareClassManager)
      throw new Error(`Pool with id ${this.data.id} has no shareClassManager`);

    const contractInfo = {
      address: this.data.shareClassManager as `0x${string}`,
      abi: ShareClassManagerAbi,
      functionName: "previewShareClassId",
      allowFailure: false,
    } as const;

    const shareClassIndexes = [...Array(shareClassCount).keys()];
    const multicallContracts = shareClassIndexes.map((index) => ({
      ...contractInfo,
      args: [this.data.id, index],
    }));

    const shareClassesIds: [index: number, id: `0x${string}`][] = [];
    const shareClassesResponses = await this.client.multicall({
      contracts: multicallContracts,
    });
    for (const [index, response] of shareClassesResponses.entries()) {
      if (response.status !== "success") {
        console.error(
          `Error fetching shareClassId with index ${index}: ${response.error.message}`
        );
        continue;
      }
      shareClassesIds.push([index, response.result as `0x${string}`]);
    }
    return shareClassesIds;
  }

  /**
   * Sets the current epoch index for this pool.
   * 
   * This method updates the pool's current epoch index and logs the change for debugging purposes.
   * 
   * @param index - The new epoch index to set for the pool.
   */
  public setCurrentEpochIndex(index: number) {
    console.info(`Setting current epoch index to ${index} for pool ${this.data.id}`);
    this.data.currentEpochIndex = index;
  }
}
