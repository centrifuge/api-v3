import schema from "ponder:schema";
import { db } from "ponder:api";
import { Hono } from "hono";
import { graphql } from "ponder";
import { TokenInstanceService, TokenService } from "../services";
import { formatBigIntToDecimal } from "../helpers/formatter";
import { eq } from "drizzle-orm";
import { Blockchain, PoolSpokeBlockchain, Token, CrosschainPayload } from "ponder:schema";

const app = new Hono();
const context = { db };

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

const jsonDefaultHeaders = {
  charset: "utf-8",
  "Content-Type": "application/json",
};
app.get("/tokens/:address/total-issuance", async (c) => {
  const address = c.req.param("address") as `0x${string}`;
  const tokenInstance = await TokenInstanceService.get(context, { address });
  if (!tokenInstance)
    return c.json(
      { error: "TokenInstance address not found" },
      404,
      jsonDefaultHeaders
    );
  const { tokenId } = tokenInstance.read();

  const token = await TokenService.get(context, { id: tokenId });
  if (!token)
    return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);

  const { totalIssuance, decimals } = token.read();
  if (totalIssuance === null)
    return c.json({ error: "Total issuance not set" }, 404, jsonDefaultHeaders);
  if (decimals === null)
    return c.json({ error: "Token decimals not set" }, 404, jsonDefaultHeaders);
  return c.json(
    { result: formatBigIntToDecimal(totalIssuance, decimals) },
    200,
    jsonDefaultHeaders
  );
});

app.get("/tokens/:address/price", async (c) => {
  const address = c.req.param("address") as `0x${string}`;

  const tokenInstance = await TokenInstanceService.get(context, { address });
  if (!tokenInstance)
    return c.json(
      { error: "TokenInstance not found" },
      404,
      jsonDefaultHeaders
    );
  const { tokenId } = tokenInstance.read();

  const token = await TokenService.get(context, { id: tokenId });
  if (!token)
    return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);

  const { tokenPrice } = token.read();
  if (tokenPrice === null) return c.json({ error: "Token price not set" }, 404);

  return c.json(
    { result: formatBigIntToDecimal(tokenPrice) },
    200,
    jsonDefaultHeaders
  );
});

app.get("/transactions/:txHash", async (c) => {
  const txHash = c.req.param("txHash") as `0x${string}`;
  
  // Query CrosschainPayload by prepareTxHash
  const [payload] = await db
    .select()
    .from(CrosschainPayload)
    .where(eq(CrosschainPayload.prepareTxHash, txHash))
    .limit(1);
  
  if (!payload) {
    return c.json({
      data: {
        status: "NOT_FOUND",
        substatus: "NOT_FOUND",
        sourceTx: txHash,
        destinationTx: null,
        explorerLink: null
      }
    });
  }
  
  // Map CrosschainPayload status to transaction status
  let status: string;
  let substatus: string;
  
  switch (payload.status) {
    case "Underpaid":
    case "InTransit":
      status = "PENDING";
      substatus = payload.deliveredAt ? "WAIT_DESTINATION_TRANSACTION" : "WAIT_SOURCE_CONFIRMATIONS";
      break;
    case "Delivered":
      status = "PENDING";
      substatus = "WAIT_DESTINATION_TRANSACTION";
      break;
    case "Completed":
      status = "DONE";
      substatus = "COMPLETED";
      break;
    case "PartiallyFailed":
      status = "DONE";
      substatus = "PARTIAL";
      break;
    default:
      status = "PENDING";
      substatus = "UNKNOWN_ERROR";
  }
  
  return c.json({
    data: {
      status,
      substatus,
      sourceTx: payload.prepareTxHash,
      destinationTx: payload.deliveryTxHash || null,
      explorerLink: null // Could be constructed from fromCentrifugeId and blockchain explorer URLs
    }
  });
});

app.get("/routes", async (c) => {
  const limit = parseInt(c.req.query("limit") || "100");
  const offset = parseInt(c.req.query("offset") || "0");
  
  // Get all active tokens with their hub blockchain
  const tokens = await db.select().from(Token).where(eq(Token.isActive, true));
  
  // Get all blockchains
  const blockchains = await db.select().from(Blockchain);
  const blockchainMap = new Map(blockchains.map(b => [b.centrifugeId, b]));
  
  // Get all spoke blockchains
  const spokeBlockchains = await db.select().from(PoolSpokeBlockchain);
  
  // Generate routes
  const routes = [];
  for (const token of tokens) {
    if (!token.centrifugeId || token.decimals === null) continue;
    
    const hubBlockchain = blockchainMap.get(token.centrifugeId);
    if (!hubBlockchain || !hubBlockchain.chainId || !hubBlockchain.name) continue;
    
    // Get spoke blockchains for this token's pool
    const tokenSpokes = spokeBlockchains.filter(s => s.poolId === token.poolId);
    
    for (const spoke of tokenSpokes) {
      // Skip if spoke is the same as hub
      if (spoke.centrifugeId === token.centrifugeId) continue;
      
      // Get the spoke blockchain details from the blockchain map
      const spokeBlockchain = blockchainMap.get(spoke.centrifugeId);
      if (!spokeBlockchain || !spokeBlockchain.chainId || !spokeBlockchain.name) continue;
      
      // Hub to Spoke route
      routes.push({
        tokenId: token.id,
        tokenName: token.name || token.id,
        fromChainId: hubBlockchain.chainId.toString(),
        fromChainName: hubBlockchain.name,
        toChainId: spokeBlockchain.chainId.toString(),
        toChainName: spokeBlockchain.name,
        minTransferSize: "0",
        maxTransferSize: "340282366920938463463374607431768211455", // uint128 max
        decimals: token.decimals,
        estimatedDuration: 210,
        estimatedGas: 1000000,
        standard: "CentrifugeV31",
        isEnabled: true
      });
      
      // Spoke to Hub route
      routes.push({
        tokenId: token.id,
        tokenName: token.name || token.id,
        fromChainId: spokeBlockchain.chainId.toString(),
        fromChainName: spokeBlockchain.name,
        toChainId: hubBlockchain.chainId.toString(),
        toChainName: hubBlockchain.name,
        minTransferSize: "0",
        maxTransferSize: "340282366920938463463374607431768211455", // uint128 max
        decimals: token.decimals,
        estimatedDuration: 210,
        estimatedGas: 1000000,
        standard: "CentrifugeV31",
        isEnabled: true
      });
    }
  }
  
  // Paginate
  const paginatedRoutes = routes.slice(offset, offset + limit);
  const baseUrl = `${c.req.url.split('?')[0]}`;
  
  return c.json({
    paging: {
      self: `${baseUrl}?limit=${limit}&offset=${offset}`,
      next: offset + limit < routes.length ? `${baseUrl}?limit=${limit}&offset=${offset + limit}` : undefined
    },
    data: paginatedRoutes
  });
});

export default app;
