import { HoldingAccount } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class HoldingAccountService extends mixinCommonStatics(Service<typeof HoldingAccount>, HoldingAccount, "HoldingAccount") {
}