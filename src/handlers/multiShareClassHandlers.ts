import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";

ponder.on("MultiShareClassAbi:AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)", async ({ event, context }) => {
  logEvent(event);
});

ponder.on("MultiShareClassAbi:AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)", async ({ event, context }) => {
  logEvent(event);
});
