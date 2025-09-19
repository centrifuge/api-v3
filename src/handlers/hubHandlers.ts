import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { WhitelistedInvestorService, TokenService } from "../services";

ponder.on("Hub:UpdateRestriction", async ({ event, context }) => {
  logEvent(event, context, "Hub:UpdateRestriction");
  const {
    centrifugeId: spokeCentrifugeId,
    scId: tokenId,
    payload,
  } = event.args;

  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService | null;
  if (!token) {
    console.error("Token not found for id ", tokenId);
    return;
  }
  const { poolId } = token.read();

  const decodedPayload = decodeUpdateRestriction(payload);
  if (!decodedPayload) {
    console.error("Unable to decode updateRestriction payload: ", payload);
    return;
  }

  const [restrictionType, accountAddress, validUntil] = decodedPayload;

  const whitelistedInvestor = (await WhitelistedInvestorService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      centrifugeId: spokeCentrifugeId.toString(),
      accountAddress,
    },
    event.block
  )) as WhitelistedInvestorService;

  switch (restrictionType) {
    case RestrictionType.Member:
      whitelistedInvestor.setValidUntil(validUntil);
      await whitelistedInvestor.save(event.block);
      break;
    case RestrictionType.Freeze:
      whitelistedInvestor.freeze();
      await whitelistedInvestor.save(event.block);
      break;
    case RestrictionType.Unfreeze:
      whitelistedInvestor.unfreeze();
      await whitelistedInvestor.save(event.block);
      break;
    default:
      break;
  }
});

enum RestrictionType {
  "Invalid",
  "Member",
  "Freeze",
  "Unfreeze",
}

/**
 * Decodes the update restriction payload into its parameters.
 * @param payload - The payload to decode.
 * @returns The decoded parameters.
 */
function decodeUpdateRestriction(
  payload: `0x${string}`
):
  | [
      restrictionType:
        | RestrictionType.Member
        | RestrictionType.Freeze
        | RestrictionType.Unfreeze,
      accountAddress: `0x${string}`,
      validUntil: Date | null
    ]
  | null {
  const buffer = Buffer.from(payload.slice(2), "hex");
  const restrictionType = buffer.readUInt8(0);
  const accountBuffer = buffer.subarray(1, 32);
  const accountAddress = `0x${accountBuffer.toString("hex").slice(0, 40)}` as `0x${string}`;
  switch (restrictionType) {
    case RestrictionType.Member:
      const _validUntil = Number(buffer.readBigUInt64BE(33) * 1000n);
      const validUntil = Number.isSafeInteger(_validUntil)
        ? new Date(Number(_validUntil))
        : new Date("9999-12-31T23:59:59Z");
      return [restrictionType, accountAddress, validUntil];
    case RestrictionType.Freeze:
      return [restrictionType, accountAddress, null];
    case RestrictionType.Unfreeze:
      return [restrictionType, accountAddress, null];
    default:
      return null;
  }
}
