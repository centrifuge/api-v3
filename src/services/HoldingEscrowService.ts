import { HoldingEscrow } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class HoldingEscrowService extends mixinCommonStatics(
  Service<typeof HoldingEscrow>,
  HoldingEscrow,
  "HoldingEscrow"
) {
  public increaseAssetAmount(amount: bigint) {
    console.log("Increasing asset amount by: ", amount);
    if (this.data.assetAmount === null) throw new Error("HoldingEscrow not initialized");
    this.data.assetAmount += amount;
    return this;
  }

  public decreaseAssetAmount(amount: bigint) {
    console.log("Decreasing asset amount by: ", amount);
    if (this.data.assetAmount === null) throw new Error("HoldingEscrow not initialized");
    this.data.assetAmount -= amount;
    return this;
  }

  public setAssetPrice(price: bigint) {
    console.log("Setting asset price to: ", price);
    this.data.assetPrice = price;
    return this;
  }
}
