import { Holding } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class HoldingService extends mixinCommonStatics(
  Service<typeof Holding>,
  Holding,
  "Holding"
) {
  public increase(
    amount: bigint,
    increaseValue: bigint,
    pricePoolPerAsset: bigint
  ) {
    const { hubAssetAmount, hubAssetValue } = this.data;
    if (hubAssetAmount === null || hubAssetValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.hubAssetAmount! += amount;
    this.data.hubAssetValue! += increaseValue;
    return this;
  }

  public decrease(
    amount: bigint,
    decreaseValue: bigint,
    pricePoolPerAsset: bigint
  ) {
    const { hubAssetAmount, hubAssetValue } = this.data;
    if (hubAssetAmount === null || hubAssetValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.hubAssetAmount! -= amount;
    this.data.hubAssetValue! -= decreaseValue;
    return this;
  }

  public update(isPositive: boolean, diffValue: bigint) {
    const { hubAssetAmount, hubAssetValue } = this.data;
    if (hubAssetAmount === null || hubAssetValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.hubAssetValue! += isPositive ? diffValue : -diffValue;
    return this;
  }
}
