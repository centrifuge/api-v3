import fetch from "node-fetch";
import { serviceError } from "./logger";

const IPFS_GATEWAY = "https://centrifuge.mypinata.cloud/ipfs/";

/**
 * Fetches and parses JSON data from IPFS using the configured gateway
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
