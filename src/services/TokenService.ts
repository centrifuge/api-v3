import { Token } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class TokenService extends mixinCommonStatics(Service<typeof Token>, Token, "Token") {
  public activate() {
    console.info(`Activating shareClass ${this.data.id}`);
    this.data.isActive = true;
    return this;
  }
  public deactivate() { 
    console.info(`Deactivating shareClass ${this.data.id}`);
    this.data.isActive = false;
    return this;
  }
  public setIndex(index: number) {
    console.info(`Setting index for shareClass ${this.data.id} to ${index}`);
    this.data.index = index;
    return this;
  }
  public setMetadata(name: string, symbol: string, salt?: `0x${string}`) {
    console.info(`Setting metadata for shareClass ${this.data.id} to ${name}, ${symbol}`);
    this.data.name = name;
    this.data.symbol = symbol;
    this.data.salt = salt ?? null;
    return this;
  }
  public setTokenPrice(price: bigint) {
    console.info(`Setting price for shareClass ${this.data.id} to ${price}`);
    this.data.tokenPrice = price;
    return this;
  }

  public increaseTotalSupply(tokenAmount: bigint) {
    console.info(`Increasing total supply for shareClass ${this.data.id} by ${tokenAmount}`);
    if(this.data.totalIssuance === null) throw new Error(`Total supply for shareClass ${this.data.id} is not set`);
    this.data.totalIssuance += tokenAmount;
    return this;
  }

  public decreaseTotalSupply(tokenAmount: bigint) {
    console.info(`Decreasing total supply for shareClass ${this.data.id} by ${tokenAmount}`);
    if(this.data.totalIssuance === null) throw new Error(`Total supply for shareClass ${this.data.id} is not set`);
    this.data.totalIssuance -= tokenAmount;
    return this;
  }
}