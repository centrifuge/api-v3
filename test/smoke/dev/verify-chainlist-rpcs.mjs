#!/usr/bin/env node
/**
 * Assert every URL in `public-rpc.mjs` is listed on Chainlist for its chainId.
 * Run: node test/smoke/dev/verify-chainlist-rpcs.mjs
 */
import { PUBLIC_RPC_URLS } from "../lib/public-rpc.mjs";

const CHAINLIST_RPCS_URL = "https://chainlist.org/rpcs.json";

/**
 * @param {unknown} rpc
 * @returns {string | null}
 */
function rpcUrl(rpc) {
  if (typeof rpc === "string") return rpc;
  if (rpc && typeof rpc === "object" && "url" in rpc && typeof rpc.url === "string") {
    return rpc.url;
  }
  return null;
}

const res = await fetch(CHAINLIST_RPCS_URL);
if (!res.ok) {
  console.error(`Failed to fetch Chainlist: ${res.status}`);
  process.exit(1);
}

/** @type {Array<{ chainId: number; rpc: unknown[] }>} */
const chains = await res.json();

/** @type {Map<number, Set<string>>} */
const urlsByChain = new Map();
for (const chain of chains) {
  const id = chain.chainId;
  if (typeof id !== "number") continue;
  const set = new Set();
  for (const entry of chain.rpc ?? []) {
    const url = rpcUrl(entry);
    if (url && url.startsWith("http")) set.add(url.replace(/\/$/, ""));
  }
  urlsByChain.set(id, set);
}

let failed = false;
for (const [chainId, urls] of Object.entries(PUBLIC_RPC_URLS)) {
  const id = Number(chainId);
  const listed = urlsByChain.get(id);
  if (!listed) {
    console.error(`chain ${id}: not found on Chainlist`);
    failed = true;
    continue;
  }
  for (const url of urls) {
    const norm = url.replace(/\/$/, "");
    if (!listed.has(norm)) {
      console.error(`chain ${id}: ${url} is NOT on https://chainlist.org/chain/${id}`);
      failed = true;
    } else {
      console.log(`ok chain ${id}: ${url}`);
    }
  }
}

process.exit(failed ? 1 : 0);
