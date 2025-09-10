import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { logEvent } from "../helpers/logger";
import {
  AccountService,
  AssetRegistrationService,
  AssetService,
  PoolManagerService,
} from "../services";
import { BlockchainService } from "../services/BlockchainService";
import { fetchFromIpfs } from "../helpers/ipfs";
import { getAddress } from "viem";
import { isoCurrencies } from "../helpers/isoCurrencies";

const ipfsHashRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58})$/;

ponder.on("HubRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, context, "HubRegistry:NewPool");
  const { poolId, currency, manager } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const _pool = (await PoolService.insert(
    context,
    {
      id: poolId,
      centrifugeId,
      currency,
      isActive: true,
    },
    event.block
  )) as PoolService;

  const account = (await AccountService.getOrInit(
    context,
    {
      address: getAddress(manager),
    },
    event.block
  )) as AccountService;

  const { address: managerAddress } = account.read();

  const poolManager = (await PoolManagerService.getOrInit(
    context,
    {
      address: managerAddress,
      centrifugeId,
      poolId,
    },
    event.block
  )) as PoolManagerService;
  poolManager.setIsHubManager(true);
  await poolManager.save(event.block);
});

ponder.on("HubRegistry:NewAsset", async ({ event, context }) => {
  //Fires Second to complete
  logEvent(event, context, "HubRegistry:NewAsset");

  const { assetId, decimals } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const _assetRegistration = (await AssetRegistrationService.insert(
    context,
    {
      assetId,
      centrifugeId,
    },
    event.block
  )) as AssetRegistrationService;

  const isIsoCurrency = assetId < 1000n;
  if (isIsoCurrency) {
    const isoCurrency =
      isoCurrencies[Number(assetId) as keyof typeof isoCurrencies];
    const _asset = (await AssetService.getOrInit(
      context,
      {
        id: assetId,
        decimals,
        symbol: isoCurrency.shortcode,
        name: isoCurrency.name,
      },
      event.block
    )) as AssetService;
  }
});

ponder.on("HubRegistry:UpdateManager", async ({ event, context }) => {
  logEvent(event, context, "HubRegistry:UpdateManager");

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const { manager, poolId, canManage } = event.args;

  const account = (await AccountService.getOrInit(
    context,
    {
      address: getAddress(manager),
    },
    event.block
  )) as AccountService;
  const { address: managerAddress } = account.read();

  const poolManager = (await PoolManagerService.getOrInit(
    context,
    {
      centrifugeId,
      poolId,
      address: managerAddress,
    },
    event.block
  )) as PoolManagerService;
  poolManager.setIsHubManager(canManage);
  await poolManager.save(event.block);
});

ponder.on("HubRegistry:SetMetadata", async ({ event, context }) => {
  logEvent(event, context, "HubRegistry:SetMetadata");


  const { poolId, metadata: rawMetadata } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const pool = (await PoolService.getOrInit(
    context,
    {
      id: poolId,
      centrifugeId,
    },
    event.block
  )) as PoolService;
  if (!pool) throw new Error("Pool not found");

  let metadata = Buffer.from(rawMetadata.slice(2), "hex").toString("utf-8");
  const isIpfs = ipfsHashRegex.test(metadata);
  if (isIpfs) {
    metadata = `ipfs://${metadata}`;
    const ipfsData = await fetchFromIpfs(metadata);
    pool.setName(ipfsData?.pool?.name);
  }

  pool.setMetadata(metadata);
  await pool.save(event.block);
});
