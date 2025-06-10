import { TokenInstance } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class TokenInstanceService extends mixinCommonStatics(Service<typeof TokenInstance>, TokenInstance, "TokenInstance") {
  public setVaultId(vaultId: string) {
    console.log(`Setting vaultId for token ${this.data.centrifugeId}-${this.data.tokenId}`, vaultId);
    this.data.vaultId = vaultId;
    return this;
  }

  public setTokenId(tokenId: string) {
    console.log(`Setting tokenId for token ${this.data.centrifugeId}-${this.data.tokenId}`, tokenId);
    //this.data.tokenId = tokenId; TODO: update for other type tokens
    return this;
  }

  public setTokenPrice(price: bigint) {
    console.log(`Setting token price for token ${this.data.centrifugeId}-${this.data.tokenId}`, price);
    this.data.tokenPrice = price;
    return this;
  }

  public increaseTotalIssuance(tokenAmount: bigint) {
    console.log(`Increasing token total issuance for token ${this.data.centrifugeId}-${this.data.tokenId}`, tokenAmount);
    if(this.data.totalIssuance === null) throw new Error(`Total issuance for token ${this.data.centrifugeId}-${this.data.tokenId} is not set`);
    this.data.totalIssuance += tokenAmount;
    return this;
  }

  public decreaseTotalIssuance(tokenAmount: bigint) {
    console.log(`Decreasing token total issuance for token ${this.data.centrifugeId}-${this.data.tokenId}`, tokenAmount);
    if(this.data.totalIssuance === null) throw new Error(`Total issuance for token ${this.data.centrifugeId}-${this.data.tokenId} is not set`);
    this.data.totalIssuance -= tokenAmount;
    return this;
  }

  public setComputedAt(computedAt: Date) {
    console.log(`Setting computed at for token ${this.data.centrifugeId}-${this.data.tokenId}`, computedAt);
    this.data.computedAt = computedAt;
    return this;
  }
}