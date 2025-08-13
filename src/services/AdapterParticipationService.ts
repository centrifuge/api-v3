import { Service, mixinCommonStatics } from "./Service";
import { AdapterParticipation } from "ponder:schema";

/**
 * Service for managing on-ramp assets.
 *
 */
export class AdapterParticipationService extends mixinCommonStatics(Service<typeof AdapterParticipation>, AdapterParticipation, "AdapterParticipation") {}