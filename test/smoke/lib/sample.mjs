/**
 * Seeded PRNG (mulberry32).
 * @param {number} seed
 */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {unknown[]} arr
 * @param {() => number} random
 */
function shuffle(arr, random) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Diverse stratified sample — round-robin across groups.
 * @param {T[]} candidates
 * @param {number} n 0 = all
 * @param {(item: T) => string} groupKey
 * @param {number | undefined} seed
 * @template T
 */
export function diverseSample(candidates, n, groupKey, seed) {
  if (n === 0 || candidates.length <= n) return candidates;

  const random =
    seed != null && !Number.isNaN(seed) ? mulberry32(seed) : () => Math.random();

  /** @type {Map<string, T[]>} */
  const groups = new Map();
  for (const item of candidates) {
    const key = groupKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const groupKeys = shuffle([...groups.keys()], random);
  for (const key of groupKeys) {
    groups.set(key, shuffle(groups.get(key), random));
  }

  /** @type {T[]} */
  const picked = [];
  /** @type {Set<string>} */
  const pickedIds = new Set();

  while (picked.length < n) {
    let added = false;
    for (const key of groupKeys) {
      const bucket = groups.get(key);
      while (bucket.length > 0 && picked.length < n) {
        const item = bucket.shift();
        const id = JSON.stringify(item);
        if (pickedIds.has(id)) continue;
        pickedIds.add(id);
        picked.push(item);
        added = true;
        break;
      }
    }
    if (!added) break;
  }

  return picked;
}
