import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import { resolveDecimalsForInit } from "../helpers/decimalsResolver";
import {
  AccountService,
  AssetRegistrationService,
  AssetService,
  PoolManagerService,
  BlockchainService,
  PoolService,
} from "../services";
import { fetchFromIpfs } from "../helpers/ipfs";
import { isoCurrencies } from "../helpers/isoCurrencies";

const ipfsHashRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58})$/;

multiMapper("hubRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, context, "hubRegistry:NewPool");
  const { poolId, currency, manager } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const decimals = await resolveDecimalsForInit(context, event, {
    assetId: currency,
    hubRegistryAddress: event.log.address,
  });
  if (typeof decimals !== "number") {
    return serviceError(`Pool decimals not resolved for currency ${currency}`);
  }

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

multiMapper("hubRegistry:UpdateCurrency", async ({ event, context }) => {
  logEvent(event, context, "hubRegistry:UpdateCurrency");
  const { poolId, currency } = event.args;
  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const pool = (await PoolService.get(context, { id: poolId, centrifugeId })) as PoolService | null;
  if (!pool) {
    return serviceError(`Pool not found. Cannot update currency poolId=${poolId}`);
  }
  pool.setCurrency(currency);
  await pool.save(event);
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
      decimals: Number(decimals),
    },
    event
  )) as AssetRegistrationService;

  const isIsoCurrency = assetId < 1000n;
  if (isIsoCurrency) {
    const isoCurrency = isoCurrencies[Number(assetId) as keyof typeof isoCurrencies];
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

  await AssetService.backfillPoolDecimals(context, assetId, Number(decimals), event);
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

  const pool = (await PoolService.get(context, { id: poolId, centrifugeId })) as PoolService | null;
  if (!pool) return serviceError(`Pool not found. Cannot set metadata poolId=${poolId}`);

  let metadata = Buffer.from(rawMetadata.slice(2), "hex").toString("utf-8");
  const isIpfs = ipfsHashRegex.test(metadata);
  if (isIpfs) {
    metadata = `ipfs://${metadata}`;
    const ipfsData = await fetchFromIpfs(metadata);
    const name = ipfsData?.pool?.name;
    if (name) pool.setName(name);
  }
  pool.setMetadata(metadata);
  await pool.save(event);
});
