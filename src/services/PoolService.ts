import type { Context } from "ponder:registry";
import { pools } from "ponder:schema";
import { MultiShareClassAbi } from "../../abis/MultiShareClassAbi";

export class PoolService {
  private readonly db: Context["db"];
  private readonly client: Context["client"];

  public data: typeof pools.$inferSelect;

  constructor(context: Context, data: typeof pools.$inferSelect) {
    this.db = context.db;
    this.client = context.client;
    this.data = data;
  }

  static async create(context: Context, data: typeof pools.$inferInsert) {
    console.info("Creating pool: ", data);
    return new this(context, await context.db.insert(pools).values(data));
  }

  static async get(context: Context, query: typeof pools.$inferSelect) {
    const data = await context.db.find(pools, query);
    if (!data) return undefined;
    return new PoolService(context, data);
  }

  public getShareClassCount() {
    return this.client.readContract({
      address: this.data.shareClassManager,
      abi: MultiShareClassAbi,
      functionName: "shareClassCount",

      args: [this.data.id],
    });
  }

  public async getShareClassIds() {
    const shareClassCount = await this.getShareClassCount();

    const contractInfo = {
      address: this.data.shareClassManager,
      abi: MultiShareClassAbi,
      functionName: "previewShareClassId",
      allowFailure: true,
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
}
