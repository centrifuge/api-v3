import { XChainPayload } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing XChainPayload entities.
 *
 * This service handles operations related to XChainPayload entities,
 * including creation, updating, and querying.
 *
 * @extends {Service<typeof XChainPayload>}
 */
export class XChainPayloadService extends mixinCommonStatics(
  Service<typeof XChainPayload>,
  XChainPayload,
  "XChainPayload"
) {}
