import { XChainMessage } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing XChainMessage entities.
 * 
 * This service handles operations related to XChainMessage entities,
 * including creation, updating, and querying.
 * 
 * @extends {Service<typeof XChainMessage>}
 */
export class XChainMessageService extends mixinCommonStatics(
  Service<typeof XChainMessage>,
  XChainMessage,
  "XChainMessage"
) {}