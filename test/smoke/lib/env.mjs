import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const smokeLibDir = path.dirname(fileURLToPath(import.meta.url));
const smokeRoot = path.resolve(smokeLibDir, "..");
export const projectRoot = path.resolve(smokeRoot, "../..");
export const specsRoot = path.join(smokeRoot, "specs");

dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

export const DEFAULT_GRAPHQL = "https://api.centrifuge.io/";
export const HUB_CENTRIFUGE_ID = "1";
