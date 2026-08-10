#!/usr/bin/env node

/**
 * Fetch registry data at build time and save it as a TypeScript file.
 * This ensures the indexer has typed registry data without runtime network dependencies.
 *
 * REGISTRY_VERSION_MAP: optional JSON object mapping handler-version keys to one or more resolved
 * registry slugs, e.g. {"v3":"v3","v3_1":["v3_1","v3_2"]}. Keys become the generated/index.ts keys
 * (and the RegistryVersions handler versions); values are merged left-to-right with newest-wins on
 * leaf collisions. Unset → every resolved slug is emitted as its own handler version (identity).
 * Unreferenced resolved slugs are dropped (logged). A slug may not appear in two handler versions
 * or twice in one value array. Keys and values accept an optional leading "v" (3_1 and v3_1 both
 * normalize to the same slug; keys are canonicalized to v-prefixed, values to stripped).
 *
 * Local overrides (after the registry chain is fully resolved — null-version merges and same-slug
 * collapse — and after REGISTRY_VERSION_MAP grouping, before writing generated files): set env vars
 * whose names are REGISTRY_<handlerVersion>_<pathSegmentsJoinedByUnderscore>, where handlerVersion
 * matches a generated file key (e.g. v3.1 → 3_1). An optional leading "v" on the slug is accepted.
 * Example: REGISTRY_v3_1_chains_42161_deployment_startBlock=1234
 * REGISTRY_ALL_<pathSegmentsJoinedByUnderscore> applies the same path to every resolved handler
 * version (before per-version patches; version-specific keys win on collision).
 * Example: REGISTRY_ALL_chains_42161_deployment_startBlock=1234
 * Path segments are split on "_"; values are coerced (numbers, booleans, null). The value "delete"
 * removes the key at the patch path (the key is gone from the generated blob, not set to null).
 * Unrecognized keys (e.g. REGISTRY_URL, REGISTRY_VERSION_MAP) are ignored because they do not
 * start with a known handler-version slug or ALL_; a warning is logged for keys that look like
 * patches but match no emitted handler version.
 */

import { promises as fs } from "fs";
import { join as pathJoin } from "path";
import { pathToFileURL } from "url";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config({ path: [".env.local", ".env"] });

const envNetwork = process.env["ENVIRONMENT"]
const argNetwork = process.argv.length > 2 ? process.argv.at(-1) : undefined;
const network = argNetwork ?? envNetwork ?? "mainnet";

const {
  REGISTRY_URL = network === "mainnet" ? "https://registry.centrifuge.io/" : "https://registry.testnet.centrifuge.io/",
  IPFS_GATEWAY = "https://centrifuge-files.mypinata.cloud/ipfs",
  IPFS_HASH
} = process.env;



const outputDir = pathJoin(process.cwd(), "generated");

/**
 * Stable filename / index key from registry.version (e.g. v3.1.0 → 3_1, v3.1.2 → 3_1_2).
 * Prerelease is ignored. A semver patch of 0 is omitted so v3_1_0 maps to v3_1.
 */
/** True when this registry JSON layer is a versionless patch (merge into chronologically older neighbor). */
function isNullRegistryVersion(version) {
  return version == null;
}

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
 * Normalize a version slug: strip optional leading "v", trim.
 * @param {string} raw
 * @returns {string}
 */
function normalizeRegistryVersionSlug(raw) {
  return raw.trim().replace(/^v/i, "");
}

/**
 * Canonical handler-version key: stripped slug re-prefixed with "v" (e.g. 3_1 and v3_1 → "v3_1").
 * @param {string} raw
 * @returns {string}
 */
function canonicalHandlerVersionKey(raw) {
  const stripped = normalizeRegistryVersionSlug(raw);
  if (stripped.length === 0) {
    throw new Error("REGISTRY_VERSION_MAP: empty handler version key");
  }
  return `v${stripped}`;
}

/**
 * Parse REGISTRY_VERSION_MAP env var into an ordered map of handler-version key → stripped slug list.
 * Returns null when unset/empty. Throws on invalid JSON, non-object, empty arrays, duplicate slugs
 * within one value array, or the same slug appearing under two handler keys.
 * @returns {Map<string, string[]> | null}
 */
function parseRegistryVersionMap() {
  const raw = process.env.REGISTRY_VERSION_MAP;
  if (raw == null || raw.trim() === "") return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`REGISTRY_VERSION_MAP: invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("REGISTRY_VERSION_MAP: must be a JSON object of { handlerVersion: slug | slug[] }");
  }
  /** @type {Map<string, string[]>} */
  const map = new Map();
  /** @type {Set<string>} */
  const seenSlugs = new Set();
  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const handlerKey = canonicalHandlerVersionKey(rawKey);
    if (map.has(handlerKey)) {
      throw new Error(`REGISTRY_VERSION_MAP: duplicate handler version "${handlerKey}"`);
    }
    let slugArray;
    if (typeof rawValue === "string") {
      slugArray = [rawValue];
    } else if (Array.isArray(rawValue) && rawValue.every((v) => typeof v === "string")) {
      slugArray = rawValue;
    } else {
      throw new Error(
        `REGISTRY_VERSION_MAP: value for "${handlerKey}" must be a string or string[]; got ${Array.isArray(rawValue) ? "array with non-strings" : typeof rawValue}`
      );
    }
    const stripped = slugArray.map((s) => normalizeRegistryVersionSlug(s)).filter((s) => s.length > 0);
    if (stripped.length === 0) {
      throw new Error(`REGISTRY_VERSION_MAP: handler version "${handlerKey}" has no non-empty slugs`);
    }
    if (stripped.length !== slugArray.length) {
      throw new Error(`REGISTRY_VERSION_MAP: handler version "${handlerKey}" contains an empty slug`);
    }
    /** @type {Set<string>} */
    const within = new Set();
    for (const slug of stripped) {
      if (within.has(slug)) {
        throw new Error(`REGISTRY_VERSION_MAP: slug "${slug}" appears twice under handler version "${handlerKey}"`);
      }
      within.add(slug);
      if (seenSlugs.has(slug)) {
        throw new Error(`REGISTRY_VERSION_MAP: slug "${slug}" appears under two handler versions`);
      }
      seenSlugs.add(slug);
    }
    map.set(handlerKey, stripped);
  }
  if (map.size === 0) return null;
  return map;
}

/**
 * Group resolved registries into handler versions per REGISTRY_VERSION_MAP.
 * Newest-wins deep merge (reuse mergeRegistriesOlderNewer). Emits one blob per handler version,
 * ordered by the earliest resolved-chain index of any slug in that handler's value set.
 * Unreferenced resolved slugs are dropped with a log line. Throws when a referenced slug is not
 * in the resolved chain.
 * @param {object[]} registryChain resolved chain (oldest-first), post null-version + same-slug merge
 * @param {string[]} versionSlugs stripped slugs parallel to registryChain
 * @param {Map<string, string[]>} map parsed REGISTRY_VERSION_MAP (handler key → stripped slug list)
 * @returns {{ registryChain: object[], versionSlugs: string[] }}
 */
function groupRegistriesByVersionMap(registryChain, versionSlugs, map) {
  /** @type {Map<string, number>} */
  const slugToIndex = new Map();
  for (let i = 0; i < versionSlugs.length; i++) {
    const slug = versionSlugs[i];
    if (slug && !slugToIndex.has(slug)) slugToIndex.set(slug, i);
  }
  /** @type {Map<string, object>} */
  const slugToRegistry = new Map();
  for (let i = 0; i < registryChain.length; i++) {
    const slug = versionSlugs[i];
    if (slug) slugToRegistry.set(slug, registryChain[i]);
  }

  /** @type {Array<{ handlerKey: string, emitSlug: string, minIndex: number, blob: object }>} */
  const entries = [];
  /** @type {Set<string>} */
  const referenced = new Set();
  for (const [handlerKey, slugList] of map) {
    let minIndex = Number.POSITIVE_INFINITY;
    const missing = [];
    for (const slug of slugList) {
      const idx = slugToIndex.get(slug);
      if (idx === undefined) {
        missing.push(slug);
      } else {
        if (idx < minIndex) minIndex = idx;
        referenced.add(slug);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `REGISTRY_VERSION_MAP: unknown or unavailable version(s) under handler "${handlerKey}": ${missing.join(", ")}. ` +
          `Available in resolved chain: ${versionSlugs.join(", ")}`
      );
    }
    const merged = slugList.reduce(
      (acc, slug) => mergeRegistriesOlderNewer(acc, slugToRegistry.get(slug)),
      null
    );
    const emitSlug = handlerKey.replace(/^v/i, "");
    entries.push({ handlerKey, emitSlug, minIndex, blob: merged });
  }

  entries.sort((a, b) => a.minIndex - b.minIndex);

  const dropped = versionSlugs.filter((slug) => !referenced.has(slug));
  if (dropped.length > 0) {
    console.log(`REGISTRY_VERSION_MAP: dropping unreferenced registry version(s): ${dropped.join(", ")}`);
  }

  return {
    registryChain: entries.map((e) => e.blob),
    versionSlugs: entries.map((e) => e.emitSlug),
  };
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
  const url = ipfsHash
    ? `${IPFS_GATEWAY.replace(/\/?$/, "")}/${ipfsHash}`
    : REGISTRY_URL;

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
 * Chain order from fetchRegistryChain is oldest-first … newest-last (linked list is walked from
 * newest via previousRegistry; each step unshifts an older blob).
 *
 * Entries with null/absent `version` are patch layers: merge into the chronologically previous
 * entry (the one before in this array). E.g. [v1, v2, null, v3] → [v1, merge(v2, null), v3].
 * Patch wins on key collisions; the merged object keeps the base `version` when the patch had none.
 */
function mergeNullVersionPatchesIntoPredecessors(chain) {
  if (chain.length === 0) {
    return chain;
  }
  const result = [structuredClone(chain[0])];
  for (let i = 1; i < chain.length; i++) {
    const curr = chain[i];
    if (isNullRegistryVersion(curr.version)) {
      const base = result[result.length - 1];
      result[result.length - 1] = mergeRegistriesOlderNewer(base, curr);
    } else {
      result.push(structuredClone(curr));
    }
  }
  return result;
}

/**
 * After null-version patches are folded, consecutive registries can still share the same file slug
 * (e.g. full v3.1 under a patch and the tip v3.1). Merge each run into one row (newer wins on
 * collisions) so we emit a single generated file per slug and index.ts stays consistent.
 */
function collapseConsecutiveRegistriesWithSameFileSlug(chain) {
  if (chain.length === 0) {
    return chain;
  }
  const out = [structuredClone(chain[0])];
  for (let i = 1; i < chain.length; i++) {
    const curr = structuredClone(chain[i]);
    const prev = out[out.length - 1];
    const slugPrev = registryVersionToFileSlug(prev.version);
    const slugCurr = registryVersionToFileSlug(curr.version);
    if (slugPrev === slugCurr) {
      out[out.length - 1] = mergeRegistriesOlderNewer(prev, curr);
    } else {
      out.push(curr);
    }
  }
  return out;
}

/** Full resolution: IPFS chain → merge patches → dedupe same-slug neighbors. Env patches run after this. */
function resolveRegistryChain(chain) {
  const afterNull = mergeNullVersionPatchesIntoPredecessors(chain);
  return collapseConsecutiveRegistriesWithSameFileSlug(afterNull);
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
 * Sentinel marking a registry patch path for deletion: the key is removed from the blob, not set
 * to null. Produced by {@link parseRegistryPatchEnvValue} for the env value "delete".
 */
const REGISTRY_DELETE = Symbol("REGISTRY_DELETE");

/**
 * Parse env value for a registry patch leaf: numbers, booleans, null, and the delete sentinel
 * ("delete"); otherwise the raw string. "delete" returns the {@link REGISTRY_DELETE} sentinel so
 * {@link applyLocalRegistryPatches} removes the key at the patch path instead of setting it.
 * @param raw - The raw env var string.
 * @returns The parsed value, or the {@link REGISTRY_DELETE} sentinel for deletion.
 */
function parseRegistryPatchEnvValue(raw) {
  if (raw === "") return raw;
  const t = raw.trim();
  if (t === "delete") return REGISTRY_DELETE;
  if (t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t) || /^-?\d*\.\d+$/.test(t)) return Number(t);
  return raw;
}

const REGISTRY_ENV_PREFIX = "REGISTRY_";
const REGISTRY_ALL_ENV_PREFIX = "REGISTRY_ALL_";

/**
 * Collect REGISTRY_ALL_<path> entries applied to every registry version.
 * @returns {Array<{ segments: string[], value: unknown }>}
 */
function collectRegistryAllPatchesFromEnv() {
  /** @type {Array<{ segments: string[], value: unknown }>} */
  const patches = [];
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith(REGISTRY_ALL_ENV_PREFIX)) continue;
    const pathRest = key.slice(REGISTRY_ALL_ENV_PREFIX.length);
    const segments = pathRest.split("_").filter((s) => s.length > 0);
    if (segments.length === 0) continue;
    const raw = process.env[key];
    if (raw === undefined) continue;
    patches.push({ segments, value: parseRegistryPatchEnvValue(raw) });
  }
  return patches;
}

/**
 * Collect REGISTRY_<handlerVersion>_<path> entries for known handler-version slugs (longest slug
 * wins first). Keys that look like patches but match no known handler version are logged as
 * warnings (so a folded-away slug like v3_2 is not silently ignored).
 * @param {string[]} versionSlugs handler-version slugs (stripped, e.g. "3_1")
 * @returns {Map<string, Array<{ segments: string[], value: unknown }>>}
 */
function collectRegistryPatchesFromEnv(versionSlugs) {
  /** @type {Map<string, Array<{ segments: string[], value: unknown }>>} */
  const byVersion = new Map();
  const sorted = [...new Set(versionSlugs)].sort((a, b) => b.length - a.length);
  /** @type {string[]} */
  const unrecognized = [];

  for (const key of Object.keys(process.env)) {
    if (!key.startsWith(REGISTRY_ENV_PREFIX)) continue;
    if (key.startsWith(REGISTRY_ALL_ENV_PREFIX)) continue;
    if (key === "REGISTRY_URL" || key === "REGISTRY_VERSION_MAP") continue;
    const rest = key.slice(REGISTRY_ENV_PREFIX.length);
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
    if (matchedSlug == null || pathRest == null) {
      unrecognized.push(key);
      continue;
    }
    const segments = pathRest.split("_").filter((s) => s.length > 0);
    if (segments.length === 0) continue;
    const raw = process.env[key];
    if (raw === undefined) continue;
    const value = parseRegistryPatchEnvValue(raw);
    const list = byVersion.get(matchedSlug) ?? [];
    list.push({ segments, value });
    byVersion.set(matchedSlug, list);
  }
  if (unrecognized.length > 0) {
    console.log(
      `WARNING: unrecognized registry env patch key(s) (no matching handler version): ${unrecognized.join(", ")}`
    );
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
 * Remove a nested property. Walks the parent path; if any ancestor is missing, no-ops
 * (nothing to delete). Never creates intermediate objects.
 */
function deleteRegistryPathSegments(target, segments) {
  let cur = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const k = segments[i];
    const next = cur[k];
    if (next === null || next === undefined || typeof next !== "object" || Array.isArray(next)) {
      return;
    }
    cur = next;
  }
  delete cur[segments[segments.length - 1]];
}

/**
 * Apply local env patches to a registry blob. A patch value of {@link REGISTRY_DELETE} removes the
 * key at the patch path; any other value sets the leaf (creating parent objects as needed).
 * @param {object} registry
 * @param {Array<{ segments: string[], value: unknown }>} patches
 */
function applyLocalRegistryPatches(registry, patches) {
  const out = structuredClone(registry);
  for (const { segments, value } of patches) {
    if (value === REGISTRY_DELETE) {
      deleteRegistryPathSegments(out, segments);
      console.log(`  env patch: delete .${segments.join(".")}`);
    } else {
      setRegistryPathSegments(out, segments, value);
      console.log(`  env patch: .${segments.join(".")} = ${JSON.stringify(value)}`);
    }
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
  const filePath = pathJoin(outputDir, `registry.v${version}.generated.ts`);
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
  const filePath = pathJoin(outputDir, `index.ts`);
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
      await fs.unlink(pathJoin(outputDir, file));
      console.log(`Removed ${file}`);
    }
  }
  try {
    const rawChain = await fetchRegistryChain(IPFS_HASH);
    const registryChain = resolveRegistryChain(rawChain);
    for (const registry of registryChain) {
      if (registry.version == null) {
        throw new Error(
          "Oldest registry in chain has null version (nothing to merge into). Check previousRegistry linkage."
        );
      }
    }
    const allVersionSlugs = registryChain.map((registry) =>
      registryVersionToFileSlug(registry.version)
    );
    const versionMap = parseRegistryVersionMap();
    let selectedChain;
    let versions;
    if (versionMap != null) {
      const grouped = groupRegistriesByVersionMap(registryChain, allVersionSlugs, versionMap);
      selectedChain = grouped.registryChain;
      versions = grouped.versionSlugs;
    } else {
      selectedChain = registryChain;
      versions = allVersionSlugs;
    }
    const allPatches = collectRegistryAllPatchesFromEnv();
    const patchesByVersion = collectRegistryPatchesFromEnv(versions);
    const patchedChain = selectedChain.map((registry, index) => {
      const slug = versions[index];
      let out = registry;
      if (allPatches.length) {
        console.log(
          `Applying ${allPatches.length} cross-version env patch(es) for registry ${slug}:`
        );
        out = applyLocalRegistryPatches(out, allPatches);
      }
      const patches = patchesByVersion.get(slug);
      if (patches?.length) {
        console.log(`Applying ${patches.length} local env patch(es) for registry ${slug}:`);
        out = applyLocalRegistryPatches(out, patches);
      }
      return out;
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

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then(() => {
      console.log("Success");
    })
    .catch((error) => {
      console.error("Error fetching registry:", error);
      process.exit(1);
    });
}

export {
  parseRegistryVersionMap,
  groupRegistriesByVersionMap,
  resolveRegistryChain,
  registryVersionToFileSlug,
  normalizeRegistryVersionSlug,
  applyLocalRegistryPatches,
  parseRegistryPatchEnvValue,
  REGISTRY_DELETE,
};

