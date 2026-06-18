import { Buffer } from "node:buffer";

/**
 * Builds the body of a v3 `Request` message (without the leading type byte).
 */
export function buildV3RequestMessageBody(opts: {
  poolId: bigint;
  scId: `0x${string}`;
  assetId: bigint;
  requestType?: number;
  investor?: Buffer;
  amount?: bigint;
}): Buffer {
  const investor = opts.investor ?? Buffer.alloc(32, 0xaa);
  const amount = Buffer.alloc(16);
  amount.writeBigUInt64BE(opts.amount ?? 1000n, 8);

  const requestType = opts.requestType ?? 1; // DepositRequest
  const requestBody = Buffer.concat([Buffer.from([requestType]), investor, amount]);
  const lenBuf = Buffer.alloc(2);
  lenBuf.writeUInt16BE(requestBody.length, 0);
  const innerPayload = Buffer.concat([lenBuf, requestBody]);

  const poolBuf = Buffer.alloc(8);
  poolBuf.writeBigUInt64BE(opts.poolId);
  const scBuf = Buffer.from(opts.scId.replace(/^0x/, "").padStart(32, "0").slice(-32), "hex");
  const assetBuf = Buffer.alloc(16);
  assetBuf.writeBigUInt64BE(opts.assetId, 8);

  return Buffer.concat([poolBuf, scBuf, assetBuf, innerPayload]);
}
