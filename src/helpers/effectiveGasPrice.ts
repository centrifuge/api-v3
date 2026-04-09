/**
 * Effective gas price for the emitting transaction, from block header + tx fields only
 * (same formula as receipt `effectiveGasPrice` for standard EIP-1559 txs).
 *
 * @returns Wei **per gas unit** (wei/gas), not total fee in wei. Total L1 fee is
 *   `gasUsed * effectiveGasPrice` from the receipt. Compare: `SendPayload.gasPaid` is total wei for the adapter.
 * @see https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1559.md
 */
export function effectiveGasPriceFromEvent(event: {
  block: { baseFeePerGas: bigint | null };
  transaction: {
    type: string;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  };
}): bigint | null {
  const { block, transaction: tx } = event;

  if (tx.type === "legacy" || tx.type === "eip2930") {
    return tx.gasPrice ?? null;
  }

  if (tx.type === "eip1559") {
    const base = block.baseFeePerGas;
    if (base === null || tx.maxFeePerGas === undefined || tx.maxPriorityFeePerGas === undefined) {
      return null;
    }
    return eip1559EffectiveGasPrice(base, tx.maxFeePerGas, tx.maxPriorityFeePerGas);
  }

  if (tx.gasPrice !== undefined) return tx.gasPrice;
  if (
    block.baseFeePerGas !== null &&
    tx.maxFeePerGas !== undefined &&
    tx.maxPriorityFeePerGas !== undefined
  ) {
    return eip1559EffectiveGasPrice(block.baseFeePerGas, tx.maxFeePerGas, tx.maxPriorityFeePerGas);
  }

  return null;
}

function eip1559EffectiveGasPrice(
  baseFeePerGas: bigint,
  maxFeePerGas: bigint,
  maxPriorityFeePerGas: bigint
) {
  const maxPriority = maxPriorityFeePerGas;
  const capped =
    maxFeePerGas - baseFeePerGas < maxPriority ? maxFeePerGas - baseFeePerGas : maxPriority;
  const withBase = baseFeePerGas + capped;
  return withBase < maxFeePerGas ? withBase : maxFeePerGas;
}
