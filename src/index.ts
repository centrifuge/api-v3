import { ponder } from "ponder:registry";
import { pool, tranche, currency } from "ponder:schema";

const escrows = {
  // PoolManager Contract Address: Escrow Address
  '0x78E9e622A57f70F1E0Ec652A4931E4e278e58142': '0xd595E1483c507E74E2E6A3dE8e7D08d8f6F74936', //PoolManagerV1 (ETH,BASE)
  '0x91808B5E2F6d7483D41A681034D7c9DbB64B9E29': '0x0000000005F458Fd6ba9EEb5f365D83b7dA913dD', //PoolManagerV2 (ETH)
  '0x5c8657b827a138D52a4e3f03683A28B1FaD86893': '0x1AB6cD0c08120215E241a6108ae7458c995E1694', //PoolManagerV1 (SEPOLIA)
  '0x7f192F34499DdB2bE06c4754CFf2a21c4B056994': '0x0000000005F458Fd6ba9EEb5f365D83b7dA913dD', //PoolManagerV2 (BASE)
  '0xa3Ce97352C1469884EEF3547Ec9362329FE78Cf0': '0x9EDf9FC14DDBEE68CE1a69827b09794367180717', //PoolManager V2 (CELO)
}

ponder.on("PoolManagerV1:DeployTranche", async ({ event, context }) => {
  const { client } = context;
  const { PoolManagerV1 } = context.contracts;

  const poolId = event.args.poolId.toString();
  const trancheId = event.args.trancheId.substring(0, 34);
  const tokenAddress = event.args.token;
  
  console.info(
    `Processing DeployTranche event for tranche ${poolId}-${trancheId} token: ${tokenAddress}` +
    ` block: ${event.block.number} poolManager: ${event.transaction.from}`
  );

  // Insert or update pool recor

  // Get escrow address from config (you'll need to set this up in ponder.config.ts)

  // Insert or update currency record
});