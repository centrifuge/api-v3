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
    const { assetAmount, assetValue } = this.data;
    if (assetAmount === null || assetValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.assetAmount! += amount;
    this.data.assetValue! += increaseValue;
    return this;
  }

  public decrease(
    amount: bigint,
    decreaseValue: bigint,
    pricePoolPerAsset: bigint
  ) {
    const { assetAmount, assetValue } = this.data;
    if (assetAmount === null || assetValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.assetAmount! -= amount;
    this.data.assetValue! -= decreaseValue;
    return this;
  }

  public update(isPositive: boolean, diffValue: bigint) {
    const { assetAmount, assetValue } = this.data;
    if (assetAmount === null || assetValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.assetValue! += isPositive ? diffValue : -diffValue;
    return this;
  }
}
