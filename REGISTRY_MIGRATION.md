# Registry Migration

This document describes the migration from hardcoded chain configurations and ABI files to a dynamic IPFS-based registry system.

## Overview

The indexer now loads both chain configurations and ABIs dynamically from an IPFS-hosted registry instead of hardcoded values. This allows for easier updates and centralized configuration management.

## Key Changes

### 1. New Environment Variable

**REGISTRY_HASH** (required): The IPFS hash of the registry JSON file.

Example:
```bash
REGISTRY_HASH=QmNd7PFJbKbDSfQnnjiY5duHGzrGkyM2WJ3ATx1fmj1gPk
```

### 2. New Files

- **src/registry.ts**: Core registry loader that fetches configuration from IPFS
- **src/chains.ts**: Dynamically generates chain configurations from registry
- **src/abis.ts**: Dynamically exports ABIs from registry with "Abi" suffix

### 3. Removed Files

- **abis/** folder: All static ABI TypeScript files have been removed. ABIs are now loaded from the registry at runtime.

### 4. Registry Structure

The registry JSON has two top-level keys:

#### `chains`
An object keyed by centrifugeId, where each chain contains:
- `network`: Chain metadata including `chainId`, `alchemyName`, `quicknodeName`, etc.
- `adapters`: Wormhole, Axelar, LayerZero adapter configurations
- `contracts`: Object mapping contract names to addresses
- `deploymentInfo`: Optional deployment metadata

Example:
```json
{
  "chains": {
    "1": {
      "network": {
        "centrifugeId": 1,
        "chainId": 11155111,
        "name": "Sepolia",
        "alchemyName": "eth-sepolia",
        "quicknodeName": "ethereum-sepolia.quiknode.pro",
        "connectsTo": ["arbitrum-sepolia", "base-sepolia"]
      },
      "contracts": {
        "hubRegistry": "0xE4066895dEC891ff25080887626dC080D8Cb5e94",
        "spoke": "0xe564Ad088f78614F50011B367988de33E7835C4a",
        ...
      }
    }
  }
}
```

#### `abis`
An object mapping contract names (without "Abi" suffix) to their ABI arrays:

```json
{
  "abis": {
    "HubRegistry": [...],
    "Spoke": [...],
    "ERC20": [...],
    ...
  }
}
```

### 5. RPC Endpoint Configuration

The system now uses `alchemyName` and `quicknodeName` from the registry to construct RPC URLs:

```typescript
// From registry:
// alchemyName: "eth-sepolia"
// quicknodeName: "ethereum-sepolia.quiknode.pro"

// Generates:
// https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}
// https://${QUICKNODE_API_NAME}.ethereum-sepolia.quiknode.pro/${QUICKNODE_API_KEY}
```

Fallback logic exists for chains without these fields in the registry.

### 6. ABI Exports

ABIs are exported with the "Abi" suffix for backwards compatibility:

```typescript
// Registry stores: "HubRegistry"
// We export: HubRegistryAbi

// Registry stores: "ERC20"
// We export: ERC20Abi
```

This maintains compatibility with existing code without requiring refactoring.

## Migration Benefits

1. **Centralized Configuration**: All chain and ABI configurations in one place
2. **Easy Updates**: Update registry IPFS hash to deploy new configurations
3. **Version Control**: Registry files can be versioned via IPFS hashes
4. **Reduced Bundle Size**: ABIs loaded at runtime instead of bundled
5. **Consistency**: Same source of truth for all deployments

## Backwards Compatibility

- ABI export names remain unchanged (with "Abi" suffix)
- Environment variables remain the same (except new REGISTRY_HASH)
- ponder.config.ts import structure unchanged
- All handler code continues to work without modification

## Top-Level Await

The system uses top-level await (ES2022 feature) which is supported by:
- Node.js 14.8+ with ES modules (`"type": "module"` in package.json)
- Modern bundlers (esbuild, webpack 5+, vite)

This project already has `"type": "module"` and `"module": "ES2022"` configured.

## Testing

To verify the migration:

```bash
# Load registry and generate types
npm run codegen

# Verify TypeScript compilation
npm run typecheck

# Start the indexer
npm run dev
```

## Troubleshooting

### "REGISTRY_HASH environment variable is not set"
Add `REGISTRY_HASH` to your `.env.local` file.

### "ABI not found in registry: {name}"
The registry doesn't contain the expected ABI. Check the registry JSON structure and verify the ABI names match.

### "No RPC endpoints configured for chain {chainId}"
The chain is selected in `SELECTED_NETWORKS` but not present in the registry.

## Future Improvements

- Cache registry locally to reduce IPFS fetches
- Add registry schema validation
- Support multiple registry sources with fallbacks
- Add CLI tool to inspect registry contents
