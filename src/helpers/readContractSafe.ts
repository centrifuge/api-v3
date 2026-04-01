import type { Context } from "ponder:registry";
import type {
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  ReadContractParameters,
  ReadContractReturnType,
} from "viem";
import { ContractFunctionExecutionError, ContractFunctionZeroDataError } from "viem";

type PonderReadContractArg = Parameters<Context["client"]["readContract"]>[0];

/**
 * Same shape as `context.client.readContract` (Ponder injects block; optional `cache` / `retryEmptyResponse` match Ponder).
 */
export type ReadContractSafeArgs<
  abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi, "pure" | "view">,
  fnArgs extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
> = Omit<ReadContractParameters<abi, functionName, fnArgs>, "blockTag" | "blockNumber"> & {
  cache?: "immutable";
  blockNumber?: bigint;
  retryEmptyResponse?: boolean;
};

/** Handler event shape required to pin and retry `eth_call` block tags. */
export type ReadContractSafeEvent = { block: { number: bigint } };

/**
 * Like `context.client.readContract`, but retries once at `event.block.number + 1` when some RPCs
 * return empty `0x` for same-block state (notably L2s). Return type is inferred from `args`.
 */
export async function readContractSafe<
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi, "pure" | "view">,
  const fnArgs extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
>(
  context: Context,
  event: ReadContractSafeEvent,
  args: ReadContractSafeArgs<abi, functionName, fnArgs>
): Promise<ReadContractReturnType<abi, functionName, fnArgs>> {
  const client = context.client;
  const eventBlockNumber = event.block.number;
  try {
    return (await client.readContract(args as PonderReadContractArg)) as ReadContractReturnType<
      abi,
      functionName,
      fnArgs
    >;
  } catch (error) {
    const isZeroData =
      error instanceof ContractFunctionExecutionError &&
      error.cause instanceof ContractFunctionZeroDataError;
    if (!isZeroData) throw error;

    return (await client.readContract({
      ...args,
      blockNumber: eventBlockNumber + 1n,
    } as PonderReadContractArg)) as ReadContractReturnType<abi, functionName, fnArgs>;
  }
}
