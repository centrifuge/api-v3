#!/usr/bin/env node

/**
 * Fetch registry data at build time and save it as a TypeScript file.
 * This ensures the indexer has typed registry data without runtime network dependencies.
 *
 * Local overrides (after fetch, before writing generated files): set env vars whose names are
 * REGISTRY_<versionSlug>_<pathSegmentsJoinedByUnderscore>, where versionSlug matches the generated
 * file key (e.g. v3.1 → 3_1). An optional leading "v" on the slug is accepted.
 * Example: REGISTRY_v3_1_chains_42161_deployment_startBlock=1234
 * Path segments are split on "_"; values are coerced (numbers, booleans, null). Unrecognized keys
 * (e.g. REGISTRY_URL) are ignored because they do not start with a known version slug.
 */

import { promises as fs } from "fs";
import { join } from "path";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config({ path: [".env.local", ".env"] });

const envNetwork = process.env["ENVIRONMENT"]
const argNetwork = process.argv.length > 2 ? process.argv.at(-1) : undefined;
const network = argNetwork ?? envNetwork ?? "mainnet";

const {
  REGISTRY_URL = network === "mainnet" ? "https://registry.centrifuge.io/" : "https://registry.testnet.centrifuge.io/",
  IPFS_GATEWAY = "https://ipfs.centrifuge.io/ipfs",
  IPFS_HASH
} = process.env;



const outputDir = join(process.cwd(), "generated");

/**
 * Stable filename / index key from registry.version (e.g. v3.1.0 → 3_1, v3.1.2 → 3_1_2).
 * Prerelease is ignored. A semver patch of 0 is omitted so v3_1_0 maps to v3_1.
 */
function registryVersionToFileSlug(rawVersion) {
  const core = rawVersion.split("-")[0].replace(/^v/i, "");
  const parts = core.split(".").filter((p) => p.length > 0);
  if (parts.length >= 3) {
    const patch = parts[parts.length - 1];
    if (Number(patch) === 0) {
      parts.pop();
    }
  }
  return parts.join("_");
}

/**
 * Fetches a single registry the registry from the configured URL
 */
async function fetchRegistry(ipfsHash) {
  // Validate ipfsHash using a regex that matches base58 (CIDv0) or base32 (CIDv1)
  if (!!ipfsHash) {
    const ipfsHashRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/i;
    if (!ipfsHashRegex.test(ipfsHash)) {
      throw new Error(`Invalid ipfsHash: ${ipfsHash}`);
    }
  }
  const url = ipfsHash ? join(IPFS_GATEWAY, ipfsHash) : REGISTRY_URL;

  console.log(`Fetching registry from: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch registry: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Deep-merge two registry-shaped JSON values. When both sides have a nested plain object,
 * merge recursively; otherwise the newer value wins (including arrays and primitives).
 * Used so a null-version patch layer overrules the previous blob on collisions.
 */
function mergeRegistriesOlderNewer(older, newer) {
  const merged = mergeRegistryValues(older, newer);
  if (merged && typeof merged === "object" && merged.version == null && older?.version != null) {
    merged.version = older.version;
  }
  return merged;
}

function mergeRegistryValues(older, newer) {
  if (newer === null || newer === undefined) {
    return structuredClone(older);
  }
  if (older === null || older === undefined) {
    return structuredClone(newer);
  }
  if (Array.isArray(newer)) {
    return structuredClone(newer);
  }
  if (Array.isArray(older)) {
    return structuredClone(newer);
  }
  if (typeof newer !== "object" || typeof older !== "object") {
    return newer;
  }
  const out = { ...structuredClone(older) };
  for (const k of Object.keys(newer)) {
    const nv = newer[k];
    const ov = out[k];
    if (
      nv !== null &&
      typeof nv === "object" &&
      !Array.isArray(nv) &&
      ov !== null &&
      typeof ov === "object" &&
      !Array.isArray(ov)
    ) {
      out[k] = mergeRegistryValues(ov, nv);
    } else {
      out[k] = nv;
    }
  }
  return out;
}

/**
 * Chain order from fetchRegistryChain is oldest-first … newest-last.
 * Entries with version === null are merged into the preceding entry (patch over base);
 * the patch wins on key collisions.
 */
function normalizeRegistryChain(chain) {
  if (chain.length === 0) {
    return chain;
  }
  const result = [structuredClone(chain[0])];
  for (let i = 1; i < chain.length; i++) {
    const curr = chain[i];
    if (curr.version == null) {
      const base = result[result.length - 1];
      result[result.length - 1] = mergeRegistriesOlderNewer(base, curr);
    } else {
      result.push(structuredClone(curr));
    }
  }
  return result;
}

async function fetchRegistryChain(registryChain = []) {
  if (registryChain.length === 0) registryChain.unshift(await fetchRegistry());
  const registry = registryChain[0]
  const previousHash = registry.previousRegistry ? registry.previousRegistry.ipfsHash : null;
  if (!previousHash) return registryChain;
  const previousRegistry = await fetchRegistry(previousHash)
  registryChain.unshift(previousRegistry)
  if (previousRegistry.previousRegistry) await fetchRegistryChain(registryChain)
  return registryChain
}

/**
 * Path remainder after the version slug, or null if `rest` does not start with that slug + "_".
 * Accepts either "3_1_chains_..." or "v3_1_chains_..." (case-insensitive "v").
 */
function stripVersionPrefixFromPatchKey(rest, versionSlug) {
  const withV = `v${versionSlug}_`;
  const plain = `${versionSlug}_`;
  if (rest.length >= withV.length && rest.slice(0, withV.length).toLowerCase() === withV.toLowerCase()) {
    return rest.slice(withV.length);
  }
  if (rest.length >= plain.length && rest.slice(0, plain.length).toLowerCase() === plain.toLowerCase()) {
    return rest.slice(plain.length);
  }
  return null;
}

/**
 * Parse env value for registry leaf: numbers, booleans, null; otherwise string.
 */
function parseRegistryPatchEnvValue(raw) {
  if (raw === "") return raw;
  const t = raw.trim();
  if (t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t) || /^-?\d*\.\d+$/.test(t)) return Number(t);
  return raw;
}

/**
 * Collect REGISTRY_<versionSlug>_<path> entries for known version slugs (longest slug wins first).
 * @param {string[]} versionSlugs
 * @returns {Map<string, Array<{ segments: string[], value: unknown }>>}
 */
function collectRegistryPatchesFromEnv(versionSlugs) {
  /** @type {Map<string, Array<{ segments: string[], value: unknown }>>} */
  const byVersion = new Map();
  const sorted = [...new Set(versionSlugs)].sort((a, b) => b.length - a.length);
  const prefix = "REGISTRY_";

  for (const key of Object.keys(process.env)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    let matchedSlug = null;
    let pathRest = null;
    for (const slug of sorted) {
      const stripped = stripVersionPrefixFromPatchKey(rest, slug);
      if (stripped !== null) {
        matchedSlug = slug;
        pathRest = stripped;
        break;
      }
    }
    if (matchedSlug == null || pathRest == null) continue;
    const segments = pathRest.split("_").filter((s) => s.length > 0);
    if (segments.length === 0) continue;
    const raw = process.env[key];
    if (raw === undefined) continue;
    const value = parseRegistryPatchEnvValue(raw);
    const list = byVersion.get(matchedSlug) ?? [];
    list.push({ segments, value });
    byVersion.set(matchedSlug, list);
  }
  return byVersion;
}

/**
 * Set a nested property, creating plain object parents as needed.
 */
function setRegistryPathSegments(target, segments, value) {
  let cur = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const k = segments[i];
    const next = cur[k];
    if (next === null || next === undefined || typeof next !== "object" || Array.isArray(next)) {
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[segments[segments.length - 1]] = value;
}

/**
 * @param {object} registry
 * @param {Array<{ segments: string[], value: unknown }>} patches
 */
function applyLocalRegistryPatches(registry, patches) {
  const out = structuredClone(registry);
  for (const { segments, value } of patches) {
    setRegistryPathSegments(out, segments, value);
    console.log(`  env patch: .${segments.join(".")} = ${JSON.stringify(value)}`);
  }
  return out;
}

/**
 * Generates TypeScript code with the registry data
 */
async function generateTypeScriptRegistry(registry, version) {
  if (version.includes("..")) throw new Error("Invalid version");
  const fileContent = `import type { Registry } from './types';
/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Generated by: pnpm run update-registry
 * Generated at: ${new Date().toISOString()}
 */

export default ${JSON.stringify(registry, null, 2)} as const satisfies Registry
`;
  const filePath = join(outputDir, `registry.v${version}.generated.ts`);
  console.log(`Creating registry.v${version}.generated.ts file...`);
  return fs.writeFile(filePath, fileContent, "utf-8");
}

function generateTypescriptIndex(registryChain, versions) {
  const fileContent = `//
/**
* AUTO-GENERATED FILE - DO NOT EDIT
* Generated by: pnpm run update-registry
* Generated at: ${new Date().toISOString()}
*/

${versions.map((version, index) => `import registry${index} from './registry.v${version}.generated';`).join("\n")}

export default {
${versions.map((version, index) => `  v${version}: registry${index}`).join(",\n")}
} as const
`;
  const filePath = join(outputDir, `index.ts`);
  console.log(`Creating index.ts file...`);
  return fs.writeFile(filePath, fileContent, "utf-8");
}

/**
 * Main execution
 */
async function main() {
  // Remove old generated files before starting new generation
  console.log("Removing old generated files...");
  const files = await fs.readdir(outputDir);
  const genFilePattern = /^registry\.v.*\.generated\.ts$/;
  for (const file of files) {
    if (genFilePattern.test(file) || file === 'index.ts') {
      await fs.unlink(join(outputDir, file));
      console.log(`Removed ${file}`);
    }
  }
  try {
    const rawChain = await fetchRegistryChain(IPFS_HASH);
    const registryChain = normalizeRegistryChain(rawChain);
    for (const registry of registryChain) {
      if (registry.version == null) {
        throw new Error(
          "Oldest registry in chain has null version (nothing to merge into). Check previousRegistry linkage."
        );
      }
    }
    const versions = registryChain.map((registry) => registryVersionToFileSlug(registry.version));
    const patchesByVersion = collectRegistryPatchesFromEnv(versions);
    const patchedChain = registryChain.map((registry, index) => {
      const slug = versions[index];
      const patches = patchesByVersion.get(slug);
      if (!patches?.length) return registry;
      console.log(`Applying ${patches.length} local env patch(es) for registry ${slug}:`);
      return applyLocalRegistryPatches(registry, patches);
    });
    await Promise.all(
      patchedChain.map((registry, index) => generateTypeScriptRegistry(registry, versions[index]))
    );
    await generateTypescriptIndex(patchedChain, versions);
  } catch (error) {
    console.error("Error fetching registry:", error);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log("Success");
  })
  .catch((error) => {
    console.error("Error fetching registry:", error);
    process.exit(1);
  });

