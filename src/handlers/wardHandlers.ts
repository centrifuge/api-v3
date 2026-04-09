import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import { BlockchainService, SmartContractService, SmartContractWardService } from "../services";
import { getContractNameForAddress } from "../contracts";
import { contracts } from "../../ponder.config";

// Derive unversioned ward contract base names from the contracts config.
// Keys like "wardBalanceSheetV3", "wardVaultV3_1" are stripped to "wardBalanceSheet", "wardVault".
const allWardContracts = [
  ...new Set(
    Object.keys(contracts)
      .filter((k) => k.startsWith("ward"))
      .map((k) => k.replace(/V\d+(?:_\d+)?$/, ""))
  ),
];

async function handleRelyDeny({ event, context }: { event: any; context: any }, isActive: boolean) {
  const contractAddress = event.log.address as `0x${string}`;
  const userAddress = event.args.user as `0x${string}`;
  const chainId = context.chain.id;
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const contractName = getContractNameForAddress(chainId, contractAddress);

  // Ensure the emitting contract exists in the SmartContract table
  await SmartContractService.getOrInit(
    context,
    { centrifugeId, address: contractAddress, name: contractName },
    event
  );

  // Ensure the relied/denied address exists in the SmartContract table
  const userName = getContractNameForAddress(chainId, userAddress);
  await SmartContractService.getOrInit(
    context,
    { centrifugeId, address: userAddress, name: userName },
    event
  );

  // Upsert the ward relationship
  await SmartContractWardService.upsert(
    context,
    {
      centrifugeId,
      fromAddress: contractAddress,
      toAddress: userAddress,
      isActive,
    },
    event
  );
}

// Ward contract keys are dynamically computed (e.g. "wardBalanceSheetV3") and
// not present in Ponder's ContractEvents union type. The `as any` cast is
// required for multiMapper to accept the unversioned event string.
for (const contract of allWardContracts) {
  multiMapper(`${contract}:Rely` as any, async ({ event, context }) => {
    logEvent(event, context, `${contract}:Rely`);
    await handleRelyDeny({ event, context }, true);
  });

  multiMapper(`${contract}:Deny` as any, async ({ event, context }) => {
    logEvent(event, context, `${contract}:Deny`);
    await handleRelyDeny({ event, context }, false);
  });
}
