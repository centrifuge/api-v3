import { MerkleProofManager } from "ponder:schema";
import { Service } from "./Service";

/**
 * Service class for managing MerkleProofManager entities.
 *
 * Extends the base Service class with MerkleProofManager-specific functionality
 * extending [`Service`](./Service.ts) with the usual entity static methods.
 */
export class MerkleProofManagerService extends Service<typeof MerkleProofManager> {
  static readonly entityTable = MerkleProofManager;
  static readonly entityName = "MerkleProofManager";}
