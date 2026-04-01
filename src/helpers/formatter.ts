/**
 * Formats a bigint value as a decimal string with specified number of decimals.
 *
 * @param value - The bigint value to format (fixed precision int with n decimal digits)
 * @param decimals - The number of decimal places (default: 18)
 * @returns The formatted decimal string (e.g., "1.080326888094136128")
 */
export function formatBigIntToDecimal(value: bigint, decimals: number = 18): string {
  if (decimals < 0) throw new Error("Decimals must be non-negative");
  if (value < 0) throw new Error("Value must be non-negative");

  const divisor = 10n ** BigInt(decimals);
  const integerPart = value / divisor;
  const remainder = value % divisor;

  const integerStr = integerPart.toString();
  const remainderStr = remainder.toString().padStart(decimals, "0");

  return `${integerStr}.${remainderStr}`;
}

/**
 * Lowercase EVM address: `0x` plus 40 hex digits (42 characters).
 *
 * Accepts a `0x`-prefixed hex string or a `Buffer` (e.g. 20-byte address or 32-byte ABI word).
 * For a 64-hex word, uses CastLib / left-padded conventions (zeros in trailing or leading 12 bytes).
 */
export function formatBytes32ToAddress(value: Buffer | `0x${string}`): `0x${string}` {
  let hex = Buffer.isBuffer(value) ? value.toString("hex") : value.slice(2);
  hex = hex.toLowerCase();

  if (!/^[0-9a-f]+$/.test(hex)) {
    return `0x${hex.replace(/[^0-9a-f]/g, "").slice(0, 40).padEnd(40, "0").slice(0, 40)}` as `0x${string}`;
  }
  if (hex.length % 2 === 1) hex = `0${hex}`;

  const word64ToAddress = (h64: string): `0x${string}` => {
    const h = h64.toLowerCase();
    if (h.length !== 64) return `0x${h.slice(0, 40)}` as `0x${string}`;
    const leading = h.slice(0, 24);
    const trailing = h.slice(40, 64);
    if (trailing === "0".repeat(24)) return `0x${h.slice(0, 40)}` as `0x${string}`;
    if (leading === "0".repeat(24)) return `0x${h.slice(24, 64)}` as `0x${string}`;
    return `0x${h.slice(0, 40)}` as `0x${string}`;
  };

  if (hex.length === 40) return `0x${hex}` as `0x${string}`;
  if (hex.length === 64) return word64ToAddress(hex);
  if (hex.length > 64) return word64ToAddress(hex.slice(-64));

  const byteLen = hex.length / 2;
  if (byteLen === 20) return `0x${hex}` as `0x${string}`;
  if (byteLen === 32) return word64ToAddress(hex);

  return word64ToAddress(hex.padStart(64, "0"));
}
