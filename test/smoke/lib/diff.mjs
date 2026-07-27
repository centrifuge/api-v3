/**
 * @param {bigint} value
 * @param {number} decimals
 */
export function formatAmount(value, decimals) {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "") || "0";
  return `${neg ? "-" : ""}${whole.toString()}${fracStr === "0" ? "" : `.${fracStr}`}`;
}

/**
 * @param {bigint} indexed
 * @param {bigint} onchain
 * @param {bigint} toleranceWei
 */
export function diffBigInt(indexed, onchain, toleranceWei = 1n) {
  const delta = indexed - onchain;
  const absDelta = delta < 0n ? -delta : delta;
  return {
    delta,
    absDelta,
    match: absDelta <= toleranceWei,
    material: absDelta > 10n ** 12n,
  };
}

/**
 * @param {string} addr
 */
export function normAddr(addr) {
  return addr.toLowerCase();
}
