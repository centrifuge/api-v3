import { SmartContractWard } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class SmartContractWardService extends mixinCommonStatics(
  Service<typeof SmartContractWard>,
  SmartContractWard,
  "SmartContractWard"
) {}
