import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import { BlockchainService, SmartContractService, SmartContractWardService } from "../services";
import { getContractNameForAddress } from "../contracts";

// All ward contract base names (unversioned) for multiMapper registration.
// Registry contracts
const registryWardContracts = [
  "wardBalanceSheet",
  "wardGateway",
  "wardHoldings",
  "wardHubRegistry",
  "wardHub",
  "wardMerkleProofManagerFactory",
  "wardMessageDispatcher",
  "wardMultiAdapter",
  "wardOnOfframpManagerFactory",
  "wardPoolEscrowFactory",
  "wardShareClassManager",
  "wardSpoke",
  // V3_1 only (multiMapper skips if contract doesn't exist for a version)
  "wardBatchRequestManager",
  "wardVaultRegistry",
  "wardSyncManager",
];

// Factory-deployed contracts
const factoryWardContracts = [
  "wardVault",
  "wardPoolEscrow",
  "wardOnOfframpManager",
  "wardMerkleProofManager",
  "wardTokenInstance",
];

const allWardContracts = [...registryWardContracts, ...factoryWardContracts];

// Ward event args: { log: { address }, args: { user } }
// Typed as `any` because ward contract keys are dynamically computed and
// not present in Ponder's ContractEvents union type.
async function handleRelyDeny({ event, context }: { event: any; context: any }, isActive: boolean) {
  const contractAddress = event.log.address as `0x${string}`;
  const userAddress = event.args.user as `0x${string}`;
  const chainId = context.chain.id;
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  // Resolve contract name from registry (null for factory-deployed contracts)
  const contractName = getContractNameForAddress(chainId, contractAddress);

  // Upsert the emitting SmartContract
  const fromContract = (await SmartContractService.getOrInit(
    context,
    {
      centrifugeId,
      address: contractAddress,
      name: contractName,
    },
    event
  )) as SmartContractService;
  await fromContract.save(event);

  // Upsert the relied/denied SmartContract
  const userName = getContractNameForAddress(chainId, userAddress);
  const toContract = (await SmartContractService.getOrInit(
    context,
    {
      centrifugeId,
      address: userAddress,
      name: userName,
    },
    event
  )) as SmartContractService;
  await toContract.save(event);

  // Upsert the ward relationship (upsert ensures isActive is updated on existing records)
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
// decorateWardContracts returns Record<string, ...>, so the specific keys aren't
// in Ponder's ContractEvents union type. The `as any` cast is required for
// multiMapper to accept the unversioned event string. Runtime validation in
// multiMapper ensures the event is registered only if the contract key exists.
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
