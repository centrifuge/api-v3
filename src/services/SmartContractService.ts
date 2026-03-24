import { SmartContract } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class SmartContractService extends mixinCommonStatics(
  Service<typeof SmartContract>,
  SmartContract,
  "SmartContract"
) {}
