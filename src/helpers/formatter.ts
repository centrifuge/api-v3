import BN from "bn.js";

/**
 * Formats a bigint value as a decimal string with specified number of decimals.
 * 
 * @param value - The bigint value to format
 * @param decimals - The number of decimal places (default: 18)
 * @returns The formatted decimal string (e.g., "1.080326888094136128")
 */
export function formatBigIntToDecimal(value: bigint, decimals: number = 18): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const valueBN = new BN(value.toString());
  const integerPart = valueBN.div(divisor).toString();
  const remainder = valueBN.mod(divisor).toString().padStart(decimals, '0');
  return `${integerPart}.${remainder}`;
}
