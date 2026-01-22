import { OnOffRampManager } from "../../ponder.schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing OnOffRampManager entities.
 *
 * Extends the base Service class with OnOffRampManager-specific functionality
 * and inherits common static methods through mixinCommonStatics.
 */
export class OnOffRampManagerService extends mixinCommonStatics(
  Service<typeof OnOffRampManager>,
  OnOffRampManager,
  "OnOffRampManager"
) {}
