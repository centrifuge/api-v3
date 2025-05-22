import { Holding } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class HoldingService extends mixinCommonStatics(Service<typeof Holding>, Holding, "Holding") {
}