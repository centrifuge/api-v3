import { Token } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class TokenService extends mixinCommonStatics(Service<typeof Token>, Token, "Token") {
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
}