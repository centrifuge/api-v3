import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";

// SHARE CLASS LIFECYCLE
ponder.on("MultiShareClassAbi:AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)", async ({ event, context }) => {
  logEvent(event, "AddedShareClass");
});

ponder.on("MultiShareClassAbi:AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)", async ({ event, context }) => {
  logEvent(event);
});

// INVESTOR TRANSACTIONS
ponder.on("MultiShareClassAbi:UpdatedMetadata", async ({ event, context }) => {
  logEvent(event, "UpdatedMetadata");
});

ponder.on("MultiShareClassAbi:NewEpoch", async ({ event, context }) => {
  logEvent(event, "NewEpoch");
});

ponder.on("MultiShareClassAbi:UpdatedDepositRequest", async ({ event, context }) => {
  logEvent(event, "UpdatedDepositRequest");

  // TODO: Create InvestorTransaction
  // TODO: Create OutstandingOrder
});

ponder.on("MultiShareClassAbi:UpdatedRedeemRequest", async ({ event, context }) => {
  logEvent(event, "UpdatedRedeemRequest");

  // TODO: Create InvestorTransaction
  // TODO: Create OutstandingOrder
});

ponder.on("MultiShareClassAbi:ApprovedDeposits", async ({ event, context }) => {
  logEvent(event, "ApprovedDeposits");

  // TODO: Create InvestorTransaction
  // TODO: Flush OutstandingOrder
});

ponder.on("MultiShareClassAbi:ApprovedRedeems", async ({ event, context }) => {
  logEvent(event, "ApprovedRedeems");

  // TODO: Create InvestorTransaction
  // TODO: Flush OutstandingOrder
});

ponder.on("MultiShareClassAbi:ClaimedDeposit", async ({ event, context }) => {
  logEvent(event, "ClaimedDeposit");

  // TODO: Create InvestorTransaction
});

ponder.on("MultiShareClassAbi:ClaimedRedeem", async ({ event, context }) => {
  logEvent(event, "ClaimedRedeem");

  // TODO: Create InvestorTransaction
});









