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
  const remainderStr = remainder.toString().padStart(decimals, '0');
  
  return `${integerStr}.${remainderStr}`;
}
