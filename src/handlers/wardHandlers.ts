import type { Context } from "ponder:registry";
import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import {
  BlockchainService,
  SmartContractService,
  SmartContractWardService,
} from "../services";
import { getContractNameForAddress } from "../contracts";

// Ward events have a known shape but aren't in Ponder's typed event union
// (ward contract keys are dynamically computed strings). This interface
// captures the Rely/Deny event shape for type safety within the handler.
interface WardEvent {
  log: { address: `0x${string}` };
  args: { user: `0x${string}` };
}

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

async function handleRelyDeny(
  { event, context }: { event: WardEvent; context: Context },
  isActive: boolean
) {
  const contractAddress = event.log.address;
  const userAddress = event.args.user;
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
