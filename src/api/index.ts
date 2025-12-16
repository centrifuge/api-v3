import schema from "ponder:schema";
import { db } from "ponder:api";
import { Hono } from "hono";
import { graphql, client } from "ponder";
import {
  AccountService,
  AdapterService,
  AssetRegistrationService,
  AssetService,
  CrosschainMessageService,
  CrosschainPayloadService,
  EpochInvestOrderService,
  EpochRedeemOrderService,
  HoldingService,
  InvestOrderService,
  InvestorTransactionService,
  PoolService,
  RedeemOrderService,
  TokenInstanceService,
  TokenService,
} from "../services";
import { formatBigIntToDecimal } from "../helpers/formatter";
import { AdapterParticipationService } from "../services/AdapterParticipationService";

const app = new Hono();
const context = { db };

app.use("/", graphql({ db, schema }));
app.use("/sql/*", client({ db, schema }));
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

app.get("/stats", async (c) => {
  const tvl = await TokenService.getNormalisedTvl(context);
  const pools = await PoolService.count(context, { isActive: true });
  const tokens = await TokenService.count(context, { isActive: true });
  const tokenInstances = await TokenInstanceService.count(context, {
    isActive: true,
  });
  const assets = await AssetService.count(context, {});
  const assetRegistrations = await AssetRegistrationService.count(context, {});
  const adapters = await AdapterService.count(context, {});
  const adapterParticipations = await AdapterParticipationService.count(context,{});
  const investorTransactions = await InvestorTransactionService.count(context,{});
  const investOrders = await InvestOrderService.count(context,{});
  const redeemOrders = await RedeemOrderService.count(context,{});
  const epochInvestOrders = await EpochInvestOrderService.count(context,{});
  const epochRedeemOrders = await EpochRedeemOrderService.count(context,{});
  const crosschainMessages = await CrosschainMessageService.count(context,{});
  const crosschainPayloads = await CrosschainPayloadService.count(context,{});
  const accounts = await AccountService.count(context,{});
  const holdings = await HoldingService.count(context,{});
  return c.json(
    {
      tvl: formatBigIntToDecimal(tvl),
      pools,
      tokens,
      tokenInstances,
      assets,
      assetRegistrations,
      adapters,
      adapterParticipations,
      investorTransactions,
      investOrders,
      redeemOrders,
      epochInvestOrders,
      epochRedeemOrders,
      crosschainMessages,
      crosschainPayloads,
      accounts,
      holdings,
    },
    200,
    jsonDefaultHeaders
  );
});

export default app;
