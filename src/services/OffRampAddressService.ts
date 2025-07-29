import { Service, mixinCommonStatics } from "./Service";
import { OffRampAddress } from "ponder:schema";

/**
 * Service for managing off-ramp addresses
 *
 */
export class OffRampAddressService extends mixinCommonStatics(Service<typeof OffRampAddress>, OffRampAddress, "OffRampAddress") {}