import { Token } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class TokenService extends mixinCommonStatics(Service<typeof Token>, Token, "Token") {
  public setVaultId(vaultId: string) {
    console.log(`Setting vaultId for token ${this.data.centrifugeId}-${this.data.shareClassId}`, vaultId);
    this.data.vaultId = vaultId;
  }

  public setTokenId(tokenId: string) {
    console.log(`Setting tokenId for token ${this.data.centrifugeId}-${this.data.shareClassId}`, tokenId);
    this.data.tokenId = tokenId;
  }
}