import { Deployment } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing blockchain deployment information.
 *
 * The DeploymentService handles CRUD operations for deployment records that store
 * contract addresses and configuration for different blockchain networks. Each
 * deployment record contains:
 * - Network identification (chainId, centrifugeId)
 * - Contract addresses for various protocol components (guardian, gateway, etc.)
 * - Cross-chain infrastructure addresses (wormholeAdapter, axelarAdapter)
 *
 * This service extends the base Service class with common static methods for
 * creating, finding, and querying deployment records.
 *
 * @example
 * ```typescript
 * // Create a new deployment record
 * const deployment = await DeploymentService.init(context, {
 *   chainId: "1",
 *   centrifugeId: "mainnet",
 *   guardian: "0x...",
 *   gateway: "0x...",
 *   // ... other contract addresses
 * });
 *
 * // Find existing deployment by chain ID
 * const deployment = await DeploymentService.get(context, { chainId: "1" });
 *
 * // Query deployments by centrifuge ID
 * const deployments = await DeploymentService.query(context, { centrifugeId: "mainnet" });
 * ```
 */
export class DeploymentService extends mixinCommonStatics(
  Service<typeof Deployment>,
  Deployment,
  "Deployment"
) {}
