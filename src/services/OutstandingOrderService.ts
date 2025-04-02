import { Context } from "ponder:registry";
import { Service } from "./Service";
import { OutstandingOrder } from "ponder:schema";
import { eq, and } from "drizzle-orm";
import { BN } from "bn.js";

export class OutstandingOrderService extends Service<typeof OutstandingOrder> {
  protected readonly table = OutstandingOrder;

  static async init(
    context: Context,
    data: typeof OutstandingOrder.$inferInsert
  ) {
    console.info("Initialising OutstandingOrder", data);
    const insert = (
      await context.db.sql.insert(OutstandingOrder).values(data).returning()
    ).pop();
    if (!insert) throw new Error(`OutstandingOrder with ${data} not inserted`);
    return new this(context, insert);
  }

  static async get(
    context: Context,
    query: typeof OutstandingOrder.$inferInsert
  ) {
    const outstandingOrder = await context.db.find(OutstandingOrder, query);
    if (!outstandingOrder)
      throw new Error(`OutstandingOrder with ${query} not found`);
    return new this(context, outstandingOrder);
  }

  static async getOrInit(
    context: Context,
    query: typeof OutstandingOrder.$inferInsert
  ) {
    let outstandingOrder = await context.db.find(OutstandingOrder, query);
    if (!outstandingOrder) {
      console.info("Initialising OutstandingOrder: ", query);
      outstandingOrder =
        (
          await context.db.sql
            .insert(OutstandingOrder)
            .values(query)
            .returning()
        ).pop() ?? null;
      if (!outstandingOrder)
        throw new Error(`Failed to initialise OutstandingOrder: ${query}`);
    }

    return new this(context, outstandingOrder);
  }

  static async query(
    context: Context,
    query: Partial<typeof OutstandingOrder.$inferInsert>
  ) {
    const results = await context.db.sql.query.OutstandingOrder.findMany({
      where: (OutstandingOrder, { eq, and }) => {
        const queryEntries = Object.entries(query);
        if (queryEntries.length === 0) return undefined;
        return and(
          ...queryEntries.map(([key, value]) =>
            eq(OutstandingOrder[key as keyof typeof OutstandingOrder], value!)
          )
        );
      },
    });
    return results.map((result) => new this(context, result));
  }

  async save() {
    const update =
      (
        await this.db.sql
          .update(this.table)
          .set({
            ...this.data,
            poolId: undefined,
            shareClassId: undefined,
            account: undefined,
          })
          .where(
            and(
              eq(this.table.poolId, this.data.poolId),
              eq(this.table.shareClassId, this.data.shareClassId),
              eq(this.table.account, this.data.account)
            )
          )
          .returning()
      ).pop() ?? null;
    if (!update) throw new Error(`Failed to update ${this.table}`);
    this.data = update;
    return this;
  }

  public decorateOutstandingOrder(
    updatedAt: Date,
    updatedAtBlock: number,
  ) {
    this.data.updatedAt = updatedAt;
    this.data.updatedAtBlock = updatedAtBlock;
    return this;
  }

  public updateRequestedDepositAmount(amount: bigint) {
    console.info(
      `Updating deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} to ${amount}`
    );
    this.data.requestedDepositAmount = amount;
    return this;
  }

  public updateRequestedRedeemAmount(amount: bigint) {
    console.info(
      `Updating redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} to ${amount}`
    );
    this.data.requestedRedeemAmount = amount;
    return this;
  }

  public computeApprovedDepositAmount(
    approvedAssetAmount: bigint,
    pendingAssetAmount: bigint
  ) {
    if (this.data.requestedDepositAmount === null)
      throw new Error(
        `Requested deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} is not set`
      );
    const _requestedDepositAmount = new BN(
      this.data.requestedDepositAmount.toString()
    );
    const _approvedAssetAmount = new BN(approvedAssetAmount.toString());
    const _pendingAssetAmount = new BN(pendingAssetAmount.toString());
    //approvedAssetAmount / (approvedAssetAmount + _pendingDeposit)
    const _approvedDepositAmount = _requestedDepositAmount
      .mul(_approvedAssetAmount)
      .div(_approvedAssetAmount.add(_pendingAssetAmount));
    this.data.approvedDepositAmount = BigInt(_approvedDepositAmount.toString());
    console.info(
      `Computed approved deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} to ${this.data.approvedDepositAmount}`
    );
    return this;
  }

  public computeApprovedRedeemAmount(
    approvedShareClassAmount: bigint,
    pendingShareClassAmount: bigint
  ) {
    if (this.data.requestedRedeemAmount === null)
      throw new Error(
        `Requested redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} is not set`
      );
    const _requestedRedeemAmount = new BN(
      this.data.requestedRedeemAmount.toString()
    );
    const _approvedShareClassAmount = new BN(
      approvedShareClassAmount.toString()
    );
    const _pendingShareClassAmount = new BN(pendingShareClassAmount.toString());
    const _approvedRedeemAmount = _requestedRedeemAmount
      .mul(_approvedShareClassAmount)
      .div(_approvedShareClassAmount.add(_pendingShareClassAmount));
    this.data.approvedRedeemAmount = BigInt(_approvedRedeemAmount.toString());
    console.info(
      `Computed approved redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} to ${this.data.approvedRedeemAmount}`
    );
    return this;
  }

  public executeRequests() {
    if (this.data.requestedDepositAmount === null)
      throw new Error(
        `Requested deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} is not set`
      );
    if (this.data.approvedDepositAmount === null)
      throw new Error(
        `Approved deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} is not set`
      );
    this.data.requestedDepositAmount -= this.data.approvedDepositAmount;
    this.data.approvedDepositAmount = 0n;

    if (this.data.requestedRedeemAmount === null)
      throw new Error(
        `Requested redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} is not set`
      );
    if (this.data.approvedRedeemAmount === null)
      throw new Error(
        `Approved redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account} is not set`
      );
    this.data.requestedRedeemAmount -= this.data.approvedRedeemAmount;
    this.data.approvedRedeemAmount = 0n;
    return this;
  }

  public async clear() {
    console.info(
      `Clearing OutstandingOrder ${this.data.poolId}-${this.data.shareClassId}-${this.data.account}`
    );
    await this.db.sql
      .delete(OutstandingOrder)
      .where(
        and(
          eq(this.table.poolId, this.data.poolId),
          eq(this.table.shareClassId, this.data.shareClassId),
          eq(this.table.account, this.data.account)
        )
      );
  }
}
