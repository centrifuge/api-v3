import fetch from "node-fetch";
import { serviceError } from "./logger";

const DEFAULT_IPFS_GATEWAY = "https://ipfs.centrifuge.io/ipfs/";
const IPFS_GATEWAY = process.env.IPFS_GATEWAY
  ? process.env.IPFS_GATEWAY.endsWith("/")
    ? process.env.IPFS_GATEWAY
    : `${process.env.IPFS_GATEWAY}/`
  : DEFAULT_IPFS_GATEWAY;

/**
 * Fetches and parses JSON data from IPFS using the configured gateway.
 *
 * Gateway is `https://ipfs.centrifuge.io/ipfs/` by default (matches the registry
 * fetcher) and can be overridden via the `IPFS_GATEWAY` env var. A trailing slash
 * is enforced.
 *
 * @param ipfsHash - The IPFS hash/CID to fetch. Can optionally include 'ipfs://' prefix
 * @returns {Promise<any>} The parsed JSON data from IPFS
 * @throws {Error} If the IPFS fetch fails or response is not OK
 */
export async function fetchFromIpfs(ipfsHash: string): Promise<any> {
  // Remove ipfs:// prefix if present
  const hash = ipfsHash.replace("ipfs://", "");

  try {
    const response = await fetch(`${IPFS_GATEWAY}${hash}`);
    if (!response.ok) {
      throw new Error(`IPFS fetch failed with status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    serviceError(`Error fetching from IPFS: ${error}`);
    throw error;
  }
}
