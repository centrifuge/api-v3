export const MultiAdapterAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "localCentrifugeId_",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "gateway_",
        type: "address",
        internalType: "contract IMessageHandler",
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
    type: "function",
    name: "PRIMARY_ADAPTER_ID",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "RECOVERY_CHALLENGE_PERIOD",
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
    name: "activeSessionId",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "adapters",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
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
    name: "disputeRecovery",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "adapter",
        type: "address",
        internalType: "contract IAdapter",
      },
      {
        name: "payloadHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "estimate",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "payload",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "gasLimit",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "total",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "executeRecovery",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "adapter",
        type: "address",
        internalType: "contract IAdapter",
      },
      {
        name: "payload",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
    name: "file",
    inputs: [
      {
        name: "what",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "addresses",
        type: "address[]",
        internalType: "contract IAdapter[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "gateway",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IMessageHandler",
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
        name: "payload",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "inbound",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "payloadHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "sessionId",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "pending",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "initiateRecovery",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "adapter",
        type: "address",
        internalType: "contract IAdapter",
      },
      {
        name: "payloadHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "localCentrifugeId",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quorum",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recoveries",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "adapter",
        type: "address",
        internalType: "contract IAdapter",
      },
      {
        name: "payloadHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "timestamp",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
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
    name: "send",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "payload",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "gasLimit",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "refund",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "votes",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "payloadHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint16[8]",
        internalType: "uint16[8]",
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
    name: "DisputeRecovery",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: false,
        internalType: "uint16",
      },
      {
        name: "payloadHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "adapter",
        type: "address",
        indexed: false,
        internalType: "contract IAdapter",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ExecuteRecovery",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: false,
        internalType: "uint16",
      },
      {
        name: "message",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "adapter",
        type: "address",
        indexed: false,
        internalType: "contract IAdapter",
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
    name: "File",
    inputs: [
      {
        name: "what",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: false,
        internalType: "uint16",
      },
      {
        name: "adapters",
        type: "address[]",
        indexed: false,
        internalType: "contract IAdapter[]",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "HandlePayload",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "payloadId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "payload",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "adapter",
        type: "address",
        indexed: false,
        internalType: "contract IAdapter",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "HandleProof",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "payloadId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "payloadHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "adapter",
        type: "address",
        indexed: false,
        internalType: "contract IAdapter",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "InitiateRecovery",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: false,
        internalType: "uint16",
      },
      {
        name: "payloadHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "adapter",
        type: "address",
        indexed: false,
        internalType: "contract IAdapter",
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
    name: "SendPayload",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "payloadId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "payload",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "adapter",
        type: "address",
        indexed: false,
        internalType: "contract IAdapter",
      },
      {
        name: "adapterData",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "refund",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SendProof",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "payloadId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "payloadHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "adapter",
        type: "address",
        indexed: false,
        internalType: "contract IAdapter",
      },
      {
        name: "adapterData",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "EmptyAdapterSet",
    inputs: [],
  },
  {
    type: "error",
    name: "ExceedsMax",
    inputs: [],
  },
  {
    type: "error",
    name: "FileUnrecognizedParam",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidAdapter",
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
    name: "InvalidValues",
    inputs: [],
  },
  {
    type: "error",
    name: "NoDuplicatesAllowed",
    inputs: [],
  },
  {
    type: "error",
    name: "NonPayloadAdapter",
    inputs: [],
  },
  {
    type: "error",
    name: "NonProofAdapter",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAuthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "NotEntrypoint",
    inputs: [],
  },
  {
    type: "error",
    name: "RecoveryChallengePeriodNotEnded",
    inputs: [],
  },
  {
    type: "error",
    name: "RecoveryNotInitiated",
    inputs: [],
  },
  {
    type: "error",
    name: "RecoveryPayloadRecovered",
    inputs: [],
  },
  {
    type: "error",
    name: "SliceOutOfBounds",
    inputs: [],
  },
  {
    type: "error",
    name: "Uint8_Overflow",
    inputs: [],
  },
  {
    type: "error",
    name: "UnknownChainId",
    inputs: [],
  },
  {
    type: "error",
    name: "UnknownMessageProofType",
    inputs: [],
  },
] as const;
