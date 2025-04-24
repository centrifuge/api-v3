import type { Context } from "ponder:registry";
import { Pool } from "ponder:schema";
import { MultiShareClassAbi } from "../../abis/MultiShareClassAbi";
import { Service, mixinCommonStatics } from "./Service";

export class PoolService extends mixinCommonStatics(Service<typeof Pool>, Pool, "Pool") {
  public getShareClassCount() {
    if (!this.data.shareClassManager) {
      throw new Error(`Pool with id ${this.data.id} has no shareClassManager`);
    }
    return this.client.readContract({
      address: this.data.shareClassManager,
      abi: MultiShareClassAbi,
      functionName: "shareClassCount",

      args: [this.data.id],
    });
  }

  public async getShareClassIds() {
    const shareClassCount = await this.getShareClassCount();
    if (!this.data.shareClassManager)
      throw new Error(`Pool with id ${this.data.id} has no shareClassManager`);

    const contractInfo = {
      address: this.data.shareClassManager,
      abi: MultiShareClassAbi,
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
      shareClassesIds.push([index, response.result]);
    }
    return shareClassesIds;
  }

  public setCurrentEpochIndex(index: number) {
    console.info(`Setting current epoch index to ${index} for pool ${this.data.id}`);
    this.data.currentEpochIndex = index;
  }
}
