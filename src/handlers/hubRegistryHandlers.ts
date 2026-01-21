import { multiMapper } from "../helpers/multiMapper";
import { PoolService } from "../services/PoolService";
import { logEvent, serviceError } from "../helpers/logger";
import {
  AccountService,
  AssetRegistrationService,
  AssetService,
  PoolManagerService,
} from "../services";
import { BlockchainService } from "../services/BlockchainService";
import { fetchFromIpfs } from "../helpers/ipfs";
import { isoCurrencies } from "../helpers/isoCurrencies";

const ipfsHashRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58})$/;

multiMapper("hubRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, context, "hubRegistry:NewPool");
  const { poolId, currency, manager } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const decimals = await AssetService.getDecimals(context, currency);

  const _pool = (await PoolService.upsert(
    context,
    {
      id: poolId,
      centrifugeId,
      currency,
      isActive: true,
      decimals,
    },
    event
  )) as PoolService;

  const account = (await AccountService.getOrInit(
    context,
    {
      address: manager,
    },
    event
  )) as AccountService;

  const { address: managerAddress } = account.read();

  const poolManager = (await PoolManagerService.getOrInit(
    context,
    {
      address: managerAddress,
      centrifugeId,
      poolId,
    },
    event
  )) as PoolManagerService;
  poolManager.setIsHubManager(true);
  await poolManager.save(event);
});

multiMapper("hubRegistry:NewAsset", async ({ event, context }) => {
  //Fires Second to complete
  logEvent(event, context, "hubRegistry:NewAsset");

  const { assetId, decimals } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const _assetRegistration = (await AssetRegistrationService.upsert(
    context,
    {
      assetId,
      centrifugeId,
    },
    event
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
      event
    )) as AssetService;
  }
});

multiMapper("hubRegistry:UpdateManager", async ({ event, context }) => {
  logEvent(event, context, "hubRegistry:UpdateManager");

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const { manager, poolId, canManage } = event.args;

  const account = (await AccountService.getOrInit(
    context,
    {
      address: manager,
    },
    event
  )) as AccountService;
  const { address: managerAddress } = account.read();
  const poolManager = (await PoolManagerService.getOrInit(
    context,
    {
      centrifugeId,
      poolId,
      address: managerAddress,
    },
    event
  )) as PoolManagerService;
  poolManager.setIsHubManager(canManage);
  await poolManager.save(event);
});

multiMapper("hubRegistry:SetMetadata", async ({ event, context }) => {
  logEvent(event, context, "hubRegistry:SetMetadata");


  const { poolId, metadata: rawMetadata } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const pool = (await PoolService.getOrInit(
    context,
    {
      id: poolId,
      centrifugeId,
    },
    event
  )) as PoolService;
  if (!pool) return serviceError(`Pool not found. Cannot set metadata`);

  let metadata = Buffer.from(rawMetadata.slice(2), "hex").toString("utf-8");
  const isIpfs = ipfsHashRegex.test(metadata);
  if (isIpfs) {
    metadata = `ipfs://${metadata}`;
    const ipfsData = await fetchFromIpfs(metadata);
    pool.setName(ipfsData?.pool?.name);
  }

  pool.setMetadata(metadata);
  await pool.save(event);
});
