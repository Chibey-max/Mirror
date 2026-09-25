export const aggregatorAbi = [
  {
    type: "function",
    name: "setPrice",
    stateMutability: "nonpayable",
    inputs: [{ name: "newPrice", type: "int256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

export const trackRecordAbi = [
  {
    type: "function",
    name: "runner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "recordFill",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "token", type: "address" },
      { name: "isBuy", type: "bool" },
      { name: "size", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "oracleRoundId", type: "bytes32" },
    ],
    outputs: [{ name: "fillId", type: "uint256" }],
  },
  {
    type: "event",
    name: "FillRecorded",
    inputs: [
      { name: "fillId", type: "uint256", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "size", type: "uint256", indexed: false },
      { name: "price", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint64", indexed: false },
      { name: "oracleRoundId", type: "bytes32", indexed: false },
    ],
  },
  { type: "error", name: "NotRunner", inputs: [] },
  { type: "error", name: "ZeroToken", inputs: [] },
  { type: "error", name: "ZeroSize", inputs: [] },
  { type: "error", name: "ZeroPrice", inputs: [] },
  {
    type: "error",
    name: "AgentNotFound",
    inputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "error",
    name: "AgentInactive",
    inputs: [{ name: "agentId", type: "uint256" }],
  },
] as const;

export const copyVaultAbi = [
  {
    type: "function",
    name: "runner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "mirrorFill",
    stateMutability: "nonpayable",
    inputs: [{ name: "fillId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "isMirrored",
    stateMutability: "view",
    inputs: [{ name: "fillId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  { type: "error", name: "NotRunner", inputs: [] },
  {
    type: "error",
    name: "FillNotFound",
    inputs: [{ name: "fillId", type: "uint256" }],
  },
  {
    type: "error",
    name: "FillAlreadyMirrored",
    inputs: [{ name: "fillId", type: "uint256" }],
  },
  {
    type: "error",
    name: "InvalidTokenDecimals",
    inputs: [{ name: "token", type: "address" }],
  },
  {
    type: "error",
    name: "NotionalOverflow",
    inputs: [{ name: "fillId", type: "uint256" }],
  },
] as const;
