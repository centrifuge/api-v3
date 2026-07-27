import { contracts } from "../../../ponder.config";

export { getPublicClient } from "../../helpers/publicClient";

/**
 * Retrieves the ABI for a contract by name
 * @param name - The contract name as defined in ponder.config
 * @returns The contract ABI
 */
export function getContractAbi(name: keyof typeof contracts) {
  const entry = contracts[name];
  if (!entry) {
    throw new Error(`Contract not found in ponder.config: ${String(name)}`);
  }
  return entry.abi;
}
