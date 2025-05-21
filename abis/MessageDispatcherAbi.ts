export const MessageDispatcherAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "localCentrifugeId_",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "root_",
        "type": "address",
        "internalType": "contract IRoot"
      },
      {
        "name": "gateway_",
        "type": "address",
        "internalType": "contract IGateway"
      },
      {
        "name": "tokenRecoverer_",
        "type": "address",
        "internalType": "contract ITokenRecoverer"
      },
      { "name": "deployer", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceSheet",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IBalanceSheetGatewayHandler"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deny",
    "inputs": [
      { "name": "user", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "estimate",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "payload", "type": "bytes", "internalType": "bytes" }
    ],
    "outputs": [
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "file",
    "inputs": [
      { "name": "what", "type": "bytes32", "internalType": "bytes32" },
      { "name": "data", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "gateway",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "address", "internalType": "contract IGateway" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hub",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IHubGatewayHandler"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "investmentManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IRequestManagerGatewayHandler"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "localCentrifugeId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint16", "internalType": "uint16" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPoolManagerGatewayHandler"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rely",
    "inputs": [
      { "name": "user", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "root",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "address", "internalType": "contract IRoot" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sendApprovedDeposits",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "assetAmount", "type": "uint128", "internalType": "uint128" },
      {
        "name": "pricePoolPerAsset",
        "type": "uint128",
        "internalType": "D18"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendCancelDepositRequest",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "investor", "type": "bytes32", "internalType": "bytes32" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendCancelRedeemRequest",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "investor", "type": "bytes32", "internalType": "bytes32" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendCancelUpgrade",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "target", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendDepositRequest",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "investor", "type": "bytes32", "internalType": "bytes32" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "amount", "type": "uint128", "internalType": "uint128" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendDisputeRecovery",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      {
        "name": "adapterCentrifugeId",
        "type": "uint16",
        "internalType": "uint16"
      },
      { "name": "adapter", "type": "bytes32", "internalType": "bytes32" },
      { "name": "hash", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendFulfilledCancelDepositRequest",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "investor", "type": "bytes32", "internalType": "bytes32" },
      {
        "name": "cancelledAmount",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendFulfilledCancelRedeemRequest",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "investor", "type": "bytes32", "internalType": "bytes32" },
      {
        "name": "cancelledShares",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendFulfilledDepositRequest",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "investor", "type": "bytes32", "internalType": "bytes32" },
      { "name": "assetAmount", "type": "uint128", "internalType": "uint128" },
      { "name": "shareAmount", "type": "uint128", "internalType": "uint128" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendFulfilledRedeemRequest",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "investor", "type": "bytes32", "internalType": "bytes32" },
      { "name": "assetAmount", "type": "uint128", "internalType": "uint128" },
      { "name": "shareAmount", "type": "uint128", "internalType": "uint128" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendInitiateRecovery",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      {
        "name": "adapterCentrifugeId",
        "type": "uint16",
        "internalType": "uint16"
      },
      { "name": "adapter", "type": "bytes32", "internalType": "bytes32" },
      { "name": "hash", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendIssuedShares",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "shareAmount", "type": "uint128", "internalType": "uint128" },
      {
        "name": "pricePoolPerShare",
        "type": "uint128",
        "internalType": "D18"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendNotifyPool",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendNotifyPricePoolPerAsset",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "price", "type": "uint128", "internalType": "D18" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendNotifyPricePoolPerShare",
    "inputs": [
      { "name": "chainId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "sharePrice", "type": "uint128", "internalType": "D18" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendNotifyShareClass",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "name", "type": "string", "internalType": "string" },
      { "name": "symbol", "type": "string", "internalType": "string" },
      { "name": "decimals", "type": "uint8", "internalType": "uint8" },
      { "name": "salt", "type": "bytes32", "internalType": "bytes32" },
      { "name": "hook", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendNotifyShareMetadata",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "name", "type": "string", "internalType": "string" },
      { "name": "symbol", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendRecoverTokens",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "target", "type": "bytes32", "internalType": "bytes32" },
      { "name": "token", "type": "bytes32", "internalType": "bytes32" },
      { "name": "tokenId", "type": "uint256", "internalType": "uint256" },
      { "name": "to", "type": "bytes32", "internalType": "bytes32" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendRedeemRequest",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "investor", "type": "bytes32", "internalType": "bytes32" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "amount", "type": "uint128", "internalType": "uint128" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendRegisterAsset",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "decimals", "type": "uint8", "internalType": "uint8" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendRevokedShares",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "assetAmount", "type": "uint128", "internalType": "uint128" },
      { "name": "shareAmount", "type": "uint128", "internalType": "uint128" },
      {
        "name": "pricePoolPerShare",
        "type": "uint128",
        "internalType": "D18"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendScheduleUpgrade",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "target", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendSetQueue",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "enabled", "type": "bool", "internalType": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendTransferShares",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "receiver", "type": "bytes32", "internalType": "bytes32" },
      { "name": "amount", "type": "uint128", "internalType": "uint128" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendTriggerIssueShares",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "who", "type": "address", "internalType": "address" },
      { "name": "shares", "type": "uint128", "internalType": "uint128" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendTriggerSubmitQueuedAssets",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendTriggerSubmitQueuedShares",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendUpdateContract",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "target", "type": "bytes32", "internalType": "bytes32" },
      { "name": "payload", "type": "bytes", "internalType": "bytes" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendUpdateHoldingAmount",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "assetId", "type": "uint128", "internalType": "AssetId" },
      { "name": "provider", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint128", "internalType": "uint128" },
      {
        "name": "pricePoolPerAsset",
        "type": "uint128",
        "internalType": "D18"
      },
      { "name": "isIncrease", "type": "bool", "internalType": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendUpdateRestriction",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "payload", "type": "bytes", "internalType": "bytes" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendUpdateShareHook",
    "inputs": [
      { "name": "centrifugeId", "type": "uint16", "internalType": "uint16" },
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "hook", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sendUpdateShares",
    "inputs": [
      { "name": "poolId", "type": "uint64", "internalType": "PoolId" },
      { "name": "scId", "type": "bytes16", "internalType": "ShareClassId" },
      { "name": "shares", "type": "uint128", "internalType": "uint128" },
      { "name": "isIssuance", "type": "bool", "internalType": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "tokenRecoverer",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ITokenRecoverer"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "wards",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Deny",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "File",
    "inputs": [
      {
        "name": "what",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "addr",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Rely",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  { "type": "error", "name": "FileUnrecognizedParam", "inputs": [] },
  { "type": "error", "name": "NotAuthorized", "inputs": [] },
  { "type": "error", "name": "SliceOverflow", "inputs": [] },
  { "type": "error", "name": "Uint64_Overflow", "inputs": [] }
] as const