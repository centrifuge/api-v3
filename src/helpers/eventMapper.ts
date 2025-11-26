import { ponder } from "ponder:registry";
import type { Context, Event } from "ponder:registry";
import { contracts } from "../../ponder.config";

type ContractEvents = Parameters<typeof ponder.on>[0];

type RemoveVersionFromEvent<T extends string> = T extends `${infer ContractName}V${string}:${infer EventName}`
  ? ContractName extends ""
    ? T // Don't match if contract name is empty (avoid matching "V..." at start)
    : `${ContractName}:${EventName}`
  : T;


type UnversionedContractEvents = RemoveVersionFromEvent<ContractEvents>;


export type RelatedContractEvents<ContractName extends string> = 
  Extract<ContractEvents, `${ContractName}V${string}:${string}`>;

// Extracts contract name and event name from an unversioned event
type ExtractParts<T extends string> = T extends `${infer ContractName}:${infer EventName}`
  ? { contractName: ContractName; eventName: EventName }
  : never;

type VersionedEventsForUnversioned<T extends UnversionedContractEvents> = 
  Extract<ContractEvents, `${ExtractParts<T>["contractName"]}V${string}:${ExtractParts<T>["eventName"]}`>;

/**
 * Maps an unversioned contract event to a handler, registering handlers for all
 * matching versioned events where the contract exists, validated using string pattern matching
 * (e.g., "Hub:NotifyPool" registers for "HubV3:NotifyPool" and "HubV3_1:NotifyPool" 
 * only if those contract keys exist and the event string pattern matches).
 */
export function multiMapper<E extends UnversionedContractEvents>(
  event: E,
  handler: (args: { event: Event<VersionedEventsForUnversioned<E>>; context: Context }) => void | Promise<void>
): void {
  // Extract contract name and event name from unversioned event
  const [contractName, ...eventNameParts] = event.split(":") as [string, ...string[]];
  const eventName = eventNameParts.join(":");
  
  // Find all contract keys that start with the contract name followed by "V"
  // This gives us all available versions for this contract
  const contractKeys = Object.keys(contracts).filter((key) =>
    key.startsWith(`${contractName}V`)
  );
  
  // Extract versions from contract keys (e.g., "HubV3" -> "V3", "HubV3_1" -> "V3_1")
  const versions = contractKeys
    .map((key) => {
      // Remove the contract name prefix to get the version
      if (key.startsWith(contractName)) {
        return key.slice(contractName.length);
      }
      return null;
    })
    .filter((v): v is string => v !== null && v.startsWith("V"));
  
  // Register handlers for versioned events using string pattern matching
  // Pattern: <ContractName><Version>:<EventName>
  // Validate against contract keys (strings) - only register if contract key exists
  const registeredEvents: string[] = [];
  
  for (const version of versions) {
    const contractKey = `${contractName}${version}`;
    
    // Verify contract key exists in contracts by checking the string key
    if (!(contractKey in contracts)) continue;
    
    // Construct versioned event string pattern: <ContractName><Version>:<EventName>
    // Split by ":" to validate: first part should match contractKey, second part should match eventName
    const versionedEvent = `${contractName}${version}:${eventName}` as ContractEvents;
    const [eventContractPart, eventEventPart] = versionedEvent.split(":");
    
    // Verify string pattern matches: contract key and event name both match
    if (eventContractPart === contractKey && eventEventPart === eventName) {
      ponder.on(versionedEvent, handler as Parameters<typeof ponder.on>[1]);
      registeredEvents.push(versionedEvent);
    }
  }
  
  if (registeredEvents.length > 0) {
    process.stdout.write(`${event} mapped to [${registeredEvents.join(", ")}]\n`);
  }
}