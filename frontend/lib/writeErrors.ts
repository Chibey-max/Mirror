import {
  type Abi,
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  InsufficientFundsError,
  UserRejectedRequestError,
} from "viem";

/**
 * Thrown by `confirm` when a transaction was mined but reverted. A receipt
 * comes back either way, so without this a reverted write reads as success.
 */
export class TransactionRevertedError extends Error {
  constructor(readonly txHash: string) {
    super(`Transaction ${txHash} reverted`);
    this.name = "TransactionRevertedError";
  }
}

/**
 * Errors a user's own writes can revert with, beyond what's in the ABI the
 * write was sent with: a deposit reverts inside USDG's transferFrom, so its
 * reason is one of USDG's errors (OpenZeppelin ERC20) or SafeERC20's, not
 * CopyVault's. Decoding the raw revert bytes against this list recovers the
 * name either way. Shapes match the compiled contracts on main.
 */
const knownErrorsAbi = [
  { type: "error", name: "InsufficientBalance", inputs: [] },
  { type: "error", name: "AlreadyFollowing", inputs: [] },
  { type: "error", name: "NotFollowing", inputs: [] },
  {
    type: "error",
    name: "FollowerLimitReached",
    inputs: [{ name: "agentId", type: "uint256" }],
  },
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
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "SafeERC20FailedOperation",
    inputs: [{ name: "token", type: "address" }],
  },
] as const satisfies Abi;

const REVERT_COPY: Record<string, string> = {
  InsufficientBalance:
    "Not enough free balance in the vault. Deposit more or lower the amount.",
  AlreadyFollowing:
    "You're already following this agent. Unfollow first to set a new cap.",
  NotFollowing: "You're not following this agent, so there's nothing to unfollow.",
  FollowerLimitReached:
    "This agent has reached its follower limit, so it can't take new followers.",
  AgentNotFound: "This agent isn't in the registry.",
  AgentInactive:
    "This agent has been deactivated by its owner, so it can't take new followers.",
  ERC20InsufficientBalance: "Not enough USDG in your wallet.",
  ERC20InsufficientAllowance:
    "The vault isn't approved to spend that much USDG. Approve it and try again.",
  SafeERC20FailedOperation: "The USDG transfer didn't go through.",
};

const FALLBACK =
  "The transaction didn't go through. Check your wallet and try again.";

export type WriteFailure = {
  /** The user backed out in their wallet. Not a failure, so screens return
   *  to where they were instead of showing an error. */
  cancelled: boolean;
  /** One sentence for the screen, written for the person, not the ABI. */
  message: string;
  /** The contract error behind it, when there was one. */
  errorName?: string;
};

function revertName(revert: ContractFunctionRevertedError): string | undefined {
  if (revert.data?.errorName) return revert.data.errorName;
  if (!revert.raw) return undefined;
  try {
    return decodeErrorResult({ abi: knownErrorsAbi, data: revert.raw }).errorName;
  } catch {
    return undefined;
  }
}

/** Turns anything a write can throw into what the screen should say. */
export function describeWriteError(error: unknown): WriteFailure {
  if (error instanceof TransactionRevertedError) {
    return {
      cancelled: false,
      message:
        "The transaction was mined but reverted, so nothing changed. The explorer has the details.",
    };
  }
  if (!(error instanceof BaseError)) {
    return { cancelled: false, message: FALLBACK };
  }

  if (error.walk((e) => e instanceof UserRejectedRequestError)) {
    return { cancelled: true, message: "Cancelled in your wallet." };
  }
  if (error.walk((e) => e instanceof ChainMismatchError)) {
    return {
      cancelled: false,
      message:
        "Your wallet is on a different network. Switch to Robinhood Chain testnet and try again.",
    };
  }
  if (error.walk((e) => e instanceof InsufficientFundsError)) {
    return {
      cancelled: false,
      message: "Not enough ETH in your wallet to pay for gas.",
    };
  }

  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError) {
    const name = revertName(revert);
    if (name && REVERT_COPY[name]) {
      return { cancelled: false, message: REVERT_COPY[name], errorName: name };
    }
    return { cancelled: false, message: FALLBACK, errorName: name };
  }

  return { cancelled: false, message: FALLBACK };
}
