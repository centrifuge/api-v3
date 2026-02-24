/**
 * Returns the minimum value from a list of bigints.
 * @param values - The list of bigints to find the minimum value of.
 * @returns The minimum value from the list of bigints.
 */
export function bigintMin(...values: bigint[]) {
  return values.reduce((min, value) => (value < min ? value : min), values[0] ?? 0n);
}

/**
 * Returns the maximum value from a list of bigints.
 * @param values - The list of bigints to find the maximum value of.
 * @returns The maximum value from the list of bigints.
 */
export function bigintMax(...values: bigint[]) {
  return values.reduce((max, value) => (value > max ? value : max), values[0] ?? 0n);
}
