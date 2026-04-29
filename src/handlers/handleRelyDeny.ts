import { ponder } from "ponder:registry";
import type { Context, Event } from "ponder:registry";
import { contracts } from "../../ponder.config";
import { logEvent, serviceLog } from "../helpers/logger";
import { registerProtocolAddress } from "../helpers/protocolAddresses";
import { SmartContractService, SmartContractWardService } from "../services";

type ContractEvents = Parameters<typeof ponder.on>[0];
type AuthEventName = "Rely" | "Deny";

const AUTH_EVENT_NAMES: AuthEventName[] = ["Rely", "Deny"];

/**
 * Returns true when the concrete contract ABI exposes the requested Auth event.
 */
function hasAuthEvent(
  abi: (typeof contracts)[keyof typeof contracts]["abi"],
  eventName: AuthEventName
): boolean {
  return abi.some((item) => item.type === "event" && item.name === eventName);
}

/**
 * Persists the latest ward state for a single Auth event.
 */
async function handleRelyDeny({
  event,
  context,
  eventName,
  isActive,
}: {
  event: Event;
  context: Context;
  eventName: AuthEventName;
  isActive: boolean;
}) {
  logEvent(event, context, `Auth:${eventName}`);

  const authEvent = event as Event & {
    args: { user: `0x${string}` };
    log: { address: `0x${string}` };
  };
  const { user } = authEvent.args;
  const chainId = context.chain.id;
  const emittingContract = authEvent.log.address.toLowerCase() as `0x${string}`;
  const ward = user.toLowerCase() as `0x${string}`;

  await SmartContractService.ensure(context, { chainId, address: emittingContract }, event);
  await SmartContractService.ensure(context, { chainId, address: ward }, event);
  registerProtocolAddress(chainId, emittingContract);
  registerProtocolAddress(chainId, ward);
  await SmartContractWardService.setActive(
    context,
    {
      fromChainId: chainId,
      fromAddress: emittingContract,
      toChainId: chainId,
      toAddress: ward,
    },
    isActive,
    event
  );
}

/**
 * Registers Auth event handlers for every concrete v3.1 Ponder contract key whose ABI supports them.
 */
function registerRelyDenyHandlers() {
  const registeredEvents: string[] = [];

  for (const [contractKey, contractConfig] of Object.entries(contracts)) {
    if (!contractKey.endsWith("V3_1")) continue;

    for (const eventName of AUTH_EVENT_NAMES) {
      if (!hasAuthEvent(contractConfig.abi, eventName)) continue;

      const versionedEvent = `${contractKey}:${eventName}` as ContractEvents;
      ponder.on(versionedEvent, ({ event, context }) =>
        handleRelyDeny({
          event,
          context,
          eventName,
          isActive: eventName === "Rely",
        })
      );
      registeredEvents.push(versionedEvent);
    }
  }

  if (registeredEvents.length > 0) {
    serviceLog(`Rely/Deny mapped to [${registeredEvents.join(", ")}]`);
  }
}

registerRelyDenyHandlers();
