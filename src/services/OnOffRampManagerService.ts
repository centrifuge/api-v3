import { OnOffRampManager } from "../../ponder.schema";
import { Service } from "./Service";

/**
 * Service class for managing OnOffRampManager entities.
 *
 * Extends the base Service class with OnOffRampManager-specific functionality
 * extending [`Service`](./Service.ts) with the usual entity static methods.
 */
export class OnOffRampManagerService extends Service<typeof OnOffRampManager> {
  static readonly entityTable = OnOffRampManager;
  static readonly entityName = "OnOffRampManager";}
