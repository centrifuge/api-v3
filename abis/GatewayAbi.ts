export const GatewayAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "root_",
        type: "address",
        internalType: "contract IRoot",
      },
      {
        name: "gasService_",
        type: "address",
        internalType: "contract IGasService",
      },
      {
        name: "deployer",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "receive",
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "BATCH_LOCATORS_SLOT",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "GLOBAL_POT",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint64",
        internalType: "PoolId",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "adapter",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IAdapter",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "addUnpaidMessage",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "message",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "deny",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "endBatching",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "endTransactionPayment",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "extraGasLimit",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "failedMessages",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "messageHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "file",
    inputs: [
      {
        name: "what",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "instance",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "fuel",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "gasService",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IGasService",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "handle",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "batch",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isBatching",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "processor",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IMessageProcessor",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recoverTokens",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "recoverTokens",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rely",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "repay",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "batch",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "retry",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "message",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "root",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IRoot",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "send",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "message",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setExtraGasLimit",
    inputs: [
      {
        name: "gas",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setRefundAddress",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "refund",
        type: "address",
        internalType: "contract IRecoverable",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "startBatching",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "startTransactionPayment",
    inputs: [
      {
        name: "payer",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "subsidizePool",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "subsidy",
    inputs: [
      {
        name: "",
        type: "uint64",
        internalType: "PoolId",
      },
    ],
    outputs: [
      {
        name: "value",
        type: "uint96",
        internalType: "uint96",
      },
      {
        name: "refund",
        type: "address",
        internalType: "contract IRecoverable",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transactionRefund",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "underpaid",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "batchHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "counter",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "gasLimit",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "wards",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Deny",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ExecuteMessage",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "message",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FailMessage",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "message",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "error",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "File",
    inputs: [
      {
        name: "what",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "addr",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PrepareMessage",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: false,
        internalType: "PoolId",
      },
      {
        name: "message",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Rely",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RepayBatch",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "batch",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetRefundAddress",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        indexed: false,
        internalType: "PoolId",
      },
      {
        name: "refund",
        type: "address",
        indexed: false,
        internalType: "contract IRecoverable",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SubsidizePool",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "UnderpaidBatch",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "batch",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "EmptyMessage",
    inputs: [],
  },
  {
    type: "error",
    name: "ExceedsMaxGasLimit",
    inputs: [],
  },
  {
    type: "error",
    name: "FileUnrecognizedParam",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientFundsForRepayment",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidMessage",
    inputs: [
      {
        name: "code",
        type: "uint8",
        internalType: "uint8",
      },
    ],
  },
  {
    type: "error",
    name: "NoBatched",
    inputs: [],
  },
  {
    type: "error",
    name: "NoCode",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAuthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "NotEnoughTransactionGas",
    inputs: [],
  },
  {
    type: "error",
    name: "NotFailedMessage",
    inputs: [],
  },
  {
    type: "error",
    name: "NotUnderpaidBatch",
    inputs: [],
  },
  {
    type: "error",
    name: "Paused",
    inputs: [],
  },
  {
    type: "error",
    name: "RefundAddressNotSet",
    inputs: [],
  },
  {
    type: "error",
    name: "SafeTransferEthFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "SliceOutOfBounds",
    inputs: [],
  },
  {
    type: "error",
    name: "SliceOverflow",
    inputs: [],
  },
  {
    type: "error",
    name: "WrappedError",
    inputs: [
      {
        name: "target",
        type: "address",
        internalType: "address",
      },
      {
        name: "selector",
        type: "bytes4",
        internalType: "bytes4",
      },
      {
        name: "reason",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "details",
        type: "bytes",
        internalType: "bytes",
      },
    ],
  },
] as const;
