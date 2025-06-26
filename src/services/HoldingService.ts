import { Holding } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class HoldingService extends mixinCommonStatics(
  Service<typeof Holding>,
  Holding,
  "Holding"
) {

  public setValuation(valuation: string) {
    this.data.valuation = valuation;
    return this;
  }

  public setIsLiability(isLiability: boolean) {
    this.data.isLiability = isLiability;
    return this;
  }

  public increase(
    amount: bigint,
    increaseValue: bigint,
    pricePoolPerAsset: bigint
  ) {
    const { assetQuantity, totalValue } = this.data;
    if (assetQuantity === null || totalValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.assetQuantity! += amount;
    this.data.totalValue! += increaseValue;
    return this;
  }

  public decrease(
    amount: bigint,
    decreaseValue: bigint,
    pricePoolPerAsset: bigint
  ) {
    const { assetQuantity, totalValue } = this.data;
    if (assetQuantity === null || totalValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.assetQuantity! -= amount;
    this.data.totalValue! -= decreaseValue;
    return this;
  }

  public update(isPositive: boolean, diffValue: bigint) {
    const { totalValue } = this.data;
    if (totalValue === null) {
      throw new Error("Hub total value is null");
    }
    this.data.totalValue! += isPositive ? diffValue : -diffValue;
    return this;
  }

  public initialize() {
    this.data.isInitialized = true;
    return this;
  }
}
