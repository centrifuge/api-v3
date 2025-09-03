import { MerkleProofManager } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing MerkleProofManager entities.
 * 
 * Extends the base Service class with MerkleProofManager-specific functionality
 * and inherits common static methods through mixinCommonStatics.
 */
export class MerkleProofManagerService extends mixinCommonStatics(Service<typeof MerkleProofManager>, MerkleProofManager, "MerkleProofManager") {}