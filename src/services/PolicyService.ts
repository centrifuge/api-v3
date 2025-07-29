import { Service, mixinCommonStatics } from "./Service";
import { Policy } from "ponder:schema";

/**
 * Service for managing policies.
 *
 */
export class PolicyService extends mixinCommonStatics(Service<typeof Policy>, Policy, "Policy") {}