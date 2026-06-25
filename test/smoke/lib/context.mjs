import path from "node:path";
import { gql, paginateGql } from "./gql.mjs";
import { getClient } from "./rpc.mjs";
import { diffBigInt } from "./diff.mjs";
import { diverseSample } from "./sample.mjs";
import { DEFAULT_GRAPHQL, HUB_CENTRIFUGE_ID } from "./env.mjs";

/** Smokes that ignore --sample (full enumeration). */
export const FULL_SAMPLE_EXEMPT = new Set([
  "onramp",
  "deployment",
  "token-count",
  "pool-spoke-presence",
]);

const BLOCKCHAINS_QUERY = `
  query Blockchains {
    blockchains(limit: 50) {
      items { centrifugeId id name }
    }
  }
`;

const DEPLOYMENT_QUERY = `
  query Deployment($chainId: String!) {
    deployment(chainId: $chainId) {
      chainId
      centrifugeId
      gateway
      hubRegistry
      shareClassManager
      spoke
      balanceSheet
      vaultRegistry
      batchRequestManager
    }
  }
`;

/**
 * @typedef {object} SmokeContext
 * @property {string} graphqlUrl
 * @property {number} sample
 * @property {number | undefined} sampleSeed
 * @property {boolean} mismatchesOnly
 * @property {number} concurrency
 * @property {number} rpcBatch
 * @property {number} pageSize
 * @property {bigint} tolerance
 * @property {boolean} skipCrosschain
 * @property {bigint | undefined} atBlock
 * @property {{ chain?: string; centrifugeId?: string; poolId?: string; tokenId?: string }} filters
 * @property {Record<string, unknown>} smokeOptions
 * @property {(query: string, variables?: Record<string, unknown>) => Promise<unknown>} gql
 * @property {(query: string, listField: string, variables?: Record<string, unknown>) => Promise<unknown[]>} paginate
 * @property {(chainId: number) => import('viem').PublicClient} client
 * @property {() => Promise<Map<string, { chainId: number; name: string }>>} getBlockchainMap
 * @property {() => Promise<number>} getHubChainId
 * @property {(chainId: string) => Promise<Record<string, string | null>>} getDeployment
 * @property {<T>(candidates: T[], groupKey: (item: T) => string) => T[]} sampleCandidates
 * @property {(m: object) => object} mismatch
 */

/**
 * @param {object} opts
 * @param {string} [opts.graphqlUrl]
 * @param {number} [opts.sample]
 * @param {number} [opts.sampleSeed]
 * @param {boolean} [opts.mismatchesOnly]
 * @param {number} [opts.concurrency]
 * @param {number} [opts.rpcBatch]
 * @param {number} [opts.pageSize]
 * @param {bigint} [opts.tolerance]
 * @param {boolean} [opts.skipCrosschain]
 * @param {bigint} [opts.atBlock]
 * @param {object} [opts.filters]
 * @param {Record<string, unknown>} [opts.smokeOptions]
 * @param {string} [opts.smokeId]
 */
export async function buildSmokeContext(opts) {
  const graphqlUrl = opts.graphqlUrl ?? DEFAULT_GRAPHQL;
  /** @type {Map<string, { chainId: number; name: string }> | null} */
  let blockchainMap = null;
  /** @type {Map<string, Record<string, string | null>>} */
  const deploymentCache = new Map();

  const ctx = {
    graphqlUrl,
    sample: opts.sample ?? 100,
    sampleSeed: opts.sampleSeed,
    mismatchesOnly: opts.mismatchesOnly ?? false,
    concurrency: opts.concurrency ?? 5,
    rpcBatch: opts.rpcBatch ?? 20,
    pageSize: opts.pageSize ?? 100,
    tolerance: opts.tolerance ?? 1n,
    skipCrosschain: opts.skipCrosschain !== false,
    atBlock: opts.atBlock,
    filters: opts.filters ?? {},
    smokeOptions: opts.smokeOptions ?? {},
    smokeId: opts.smokeId ?? "",

    gql: (query, variables) => gql(graphqlUrl, query, variables),
    paginate: (query, listField, variables) =>
      paginateGql(graphqlUrl, query, listField, variables ?? {}, opts.pageSize ?? 100),
    client: (chainId) => getClient(chainId),

    async getBlockchainMap() {
      if (blockchainMap) return blockchainMap;
      const data = await gql(graphqlUrl, BLOCKCHAINS_QUERY);
      blockchainMap = new Map();
      for (const row of data.blockchains?.items ?? []) {
        blockchainMap.set(String(row.centrifugeId), {
          chainId: Number(row.id),
          name: row.name,
        });
      }
      return blockchainMap;
    },

    async getHubChainId() {
      const map = await ctx.getBlockchainMap();
      const hub = map.get(HUB_CENTRIFUGE_ID);
      if (!hub) throw new Error(`Hub blockchain not found (centrifugeId ${HUB_CENTRIFUGE_ID})`);
      return hub.chainId;
    },

    async getDeployment(chainId) {
      const key = String(chainId);
      if (deploymentCache.has(key)) return deploymentCache.get(key);
      const data = await gql(graphqlUrl, DEPLOYMENT_QUERY, { chainId: key });
      const row = data.deployment ?? {};
      deploymentCache.set(key, row);
      return row;
    },

    sampleCandidates(candidates, groupKey) {
      if (opts.smokeId && FULL_SAMPLE_EXEMPT.has(opts.smokeId)) return candidates;
      const cap = opts.sample ?? 100;
      if (cap === 0) return candidates;
      return diverseSample(candidates, cap, groupKey, opts.sampleSeed);
    },

    mismatch(m) {
      return { smokeId: opts.smokeId ?? "", ...m };
    },
  };

  return ctx;
}

/**
 * @param {SmokeContext} ctx
 * @param {{ centrifugeId?: string; blockchain?: { name?: string } }} row
 */
export function passesChainFilter(ctx, row) {
  if (ctx.filters.centrifugeId && String(row.centrifugeId) !== ctx.filters.centrifugeId) {
    return false;
  }
  if (ctx.filters.chain && row.blockchain?.name !== ctx.filters.chain) {
    return false;
  }
  return true;
}

/**
 * @param {SmokeContext} ctx
 * @param {{ poolId?: string | bigint }} row
 */
export function passesPoolFilter(ctx, row) {
  if (ctx.filters.poolId && String(row.poolId) !== String(ctx.filters.poolId)) return false;
  return true;
}

/**
 * @param {SmokeContext} ctx
 * @param {{ tokenId?: string }} row
 */
export function passesTokenFilter(ctx, row) {
  if (ctx.filters.tokenId && row.tokenId !== ctx.filters.tokenId) return false;
  return true;
}

/**
 * Resolve RPC client + deployment for a logical centrifugeId (local hub on that chain).
 * @param {SmokeContext} ctx
 * @param {string | number | bigint} centrifugeId
 */
export async function resolveCentrifugeChain(ctx, centrifugeId) {
  const map = await ctx.getBlockchainMap();
  const chain = map.get(String(centrifugeId));
  if (!chain) return null;
  let deployment;
  try {
    deployment = await ctx.getDeployment(String(chain.chainId));
  } catch {
    return null;
  }
  let client;
  try {
    client = ctx.client(chain.chainId);
  } catch {
    return null;
  }
  return {
    chainId: chain.chainId,
    chainName: chain.name,
    centrifugeId: String(centrifugeId),
    deployment,
    client,
  };
}

/**
 * Resolve RPC + deployment for an indexed row.
 * Priority: `triggerChainId` (snapshot block chain) → `centrifugeId` → `blockchain.id`.
 * @param {SmokeContext} ctx
 * @param {{ centrifugeId?: string | null; triggerChainId?: string | null; blockchain?: { id?: string; name?: string } | null }} row
 */
export async function resolveEntityChain(ctx, row) {
  const map = await ctx.getBlockchainMap();

  /**
   * @param {number} chainId
   */
  const fromEvmChainId = async (chainId) => {
    let deployment;
    try {
      deployment = await ctx.getDeployment(String(chainId));
    } catch {
      return null;
    }
    let client;
    try {
      client = ctx.client(chainId);
    } catch {
      return null;
    }
    const cent = [...map.entries()].find(([, v]) => v.chainId === chainId)?.[0];
    const name = [...map.values()].find((v) => v.chainId === chainId)?.name;
    return {
      chainId,
      chainName: row.blockchain?.name ?? name ?? String(chainId),
      centrifugeId: row.centrifugeId ?? cent ?? "",
      deployment,
      client,
    };
  };

  if (row.triggerChainId != null && row.triggerChainId !== "") {
    const resolved = await fromEvmChainId(Number(row.triggerChainId));
    if (resolved) return resolved;
  }

  if (row.centrifugeId != null && row.centrifugeId !== "") {
    const resolved = await resolveCentrifugeChain(ctx, row.centrifugeId);
    if (resolved) return resolved;
  }

  if (row.blockchain?.id != null) {
    return fromEvmChainId(Number(row.blockchain.id));
  }

  return null;
}

export { diffBigInt };
