import type { Context } from "ponder:registry";
import { Escrow } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class EscrowService extends mixinCommonStatics(
  Service<typeof Escrow>,
  Escrow,
  "Escrow"
) {}
