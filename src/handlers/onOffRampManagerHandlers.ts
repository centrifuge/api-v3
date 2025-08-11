import { ponder } from "ponder:registry";
import { BlockchainService, OffRampAddressService, OffRampRelayerService } from "../services";
import { logEvent } from "../helpers/logger";
import { OnOffRampManagerAbi } from "../../abis/OnOffRampManagerAbi";
import { OnRampAssetService } from "../services";

ponder.on("OnOffRampManager:UpdateRelayer", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManager:UpdateRelayer");
  const { relayer, isEnabled } = event.args;
  const offRampRelayer = (await OffRampRelayerService.getOrInit(context, {
    address: relayer,
  })) as OffRampRelayerService;
  offRampRelayer.setEnabled(isEnabled);
  await offRampRelayer.save();
});

ponder.on("OnOffRampManager:UpdateOnramp", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManager:UpdateOnramp");
  const { asset } = event.args;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is not a number");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();


  const onOffRampManagerMulticall = {
    address: event.log.address,
    abi: OnOffRampManagerAbi,
  } as const;

  const multicallResult = await context.client.multicall({
    contracts: [
      {
        ...onOffRampManagerMulticall,
        functionName: "poolId",
      },
      {
        ...onOffRampManagerMulticall,
        functionName: "scId",
      },
    ],
  });

  for (const result of multicallResult.map((r) => r.status)) {
    if (result !== "success") throw new Error(`Multicall failed: ${result}`);
  }

  const [poolId, scId] = multicallResult.map((r) => r.result!) as [
    bigint,
    `0x${string}`
  ];

  const onRampAsset = await OnRampAssetService.getOrInit(context, {
    assetAddress: asset as `0x${string}`,
    poolId,
    centrifugeId,
    tokenId: scId,
  });
  await onRampAsset.save();
});

ponder.on("OnOffRampManager:UpdateOfframp", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManager:UpdateOfframp");
  const { asset, receiver } = event.args;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is not a number");
  
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const onOffRampManagerMulticall = {
    address: event.log.address,
    abi: OnOffRampManagerAbi,
  } as const;

  const multicallResult = await context.client.multicall({
    contracts: [
      {
        ...onOffRampManagerMulticall,
        functionName: "poolId",
      },
      {
        ...onOffRampManagerMulticall,
        functionName: "scId",
      },
    ],
  });

  for (const result of multicallResult.map((r) => r.status)) {
    if (result !== "success") throw new Error(`Multicall failed: ${result}`);
  }

  const [poolId, scId] = multicallResult.map((r) => r.result!) as [
    bigint,
    `0x${string}`
  ];

  const offRampAddress = await OffRampAddressService.getOrInit(context, {
    poolId,
    centrifugeId,
    tokenId: scId,
    assetAddress: asset.substring(0, 42) as `0x${string}`,
    receiverAddress: receiver.substring(0, 42) as `0x${string}`,
  });
  await offRampAddress.save();
});

ponder.on("OnOffRampManagerFactory:DeployOnOfframpManager", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManagerFactory:DeployOnOfframpManager");
});