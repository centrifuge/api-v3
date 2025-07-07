import type { Context } from "ponder:registry";
import { Deployment } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class DeploymentService extends mixinCommonStatics(
  Service<typeof Deployment>,
  Deployment,
  "Deployment"
) {}
