import { TokenInstance } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class TokenInstanceService extends mixinCommonStatics(Service<typeof TokenInstance>, TokenInstance, "TokenInstance") {
  public setVaultId(vaultId: string) {
    console.log(`Setting vaultId for token ${this.data.centrifugeId}-${this.data.tokenId}`, vaultId);
    this.data.vaultId = vaultId;
  }

  public setTokenId(tokenId: string) {
    console.log(`Setting tokenId for token ${this.data.centrifugeId}-${this.data.tokenId}`, tokenId);
    //this.data.tokenId = tokenId; TODO: update for other type tokens
  }
}