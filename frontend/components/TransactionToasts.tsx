"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { txUrl } from "@/lib/chains";
import type { WriteProgress } from "@/hooks/useVaultConnection";
import { describeWriteError } from "@/lib/writeErrors";

type TxStatus = "approving" | "pending" | "success" | "error" | "cancelled";

type TxRecord = {
  id: string;
  /** What the user asked for, "Deposit 25.00 USDG", not a function name. */
  label: string;
  status: TxStatus;
  txHash?: string;
  /** Why it failed, in the user's terms. Only set on `error`. */
  detail?: string;
};

type TransactionsContextValue = {
  records: TxRecord[];
  /** Starts tracking a write, before it has a hash. Returns the id every
   *  other call needs. */
  begin: (label: string) => string;
  /** The write got a hash and its receipt is now awaited. */
  submitted: (id: string, txHash: string) => void;
  /** The write settled, clears from the header count either way, and
   *  the toast itself fades a few seconds later so a glance still catches
   *  a failure that happened while looking elsewhere. */
  resolve: (
    id: string,
    outcome: "success" | "error" | "cancelled",
    detail?: string,
  ) => void;
  dismiss: (id: string) => void;
};

const TransactionsContext = createContext<TransactionsContextValue | null>(
  null,
);

const AUTO_DISMISS_MS = 6000;

let nextId = 0;

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<TxRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setRecords((current) => current.filter((record) => record.id !== id));
  }, []);

  const begin = useCallback((label: string) => {
    const id = `tx-${++nextId}`;
    setRecords((current) => [...current, { id, label, status: "approving" }]);
    return id;
  }, []);

  const submitted = useCallback((id: string, txHash: string) => {
    setRecords((current) =>
      current.map((record) =>
        record.id === id ? { ...record, status: "pending", txHash } : record,
      ),
    );
  }, []);

  const resolve = useCallback(
    (id: string, outcome: "success" | "error" | "cancelled", detail?: string) => {
      setRecords((current) =>
        current.map((record) =>
          record.id === id ? { ...record, status: outcome, detail } : record,
        ),
      );
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  return (
    <TransactionsContext.Provider
      value={{ records, begin, submitted, resolve, dismiss }}
    >
      {children}
      <TransactionToastHost />
    </TransactionsContext.Provider>
  );
}

function useTransactions(): TransactionsContextValue {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error("useTransactions must be used inside TransactionsProvider");
  }
  return context;
}

/**
 * How many writes are still in flight, what the header's indicator counts.
 * `success`/`error` are settled; only `approving`/`pending` are "in flight".
 */
export function usePendingTxCount(): number {
  const { records } = useTransactions();
  return records.filter((r) => r.status === "approving" || r.status === "pending")
    .length;
}

/**
 * Wraps a write so it reports itself to the global toast/indicator store
 * instead of only to whichever modal happens to still be open.
 *
 * Modals already thread a `WriteProgress` callback into every write hook to
 * drive their own stage machine; this wraps that same callback rather than
 * replacing it, so closing the modal mid-transaction no longer makes the
 * transaction disappear, the toast and the header's pending count outlive
 * the component that started the write.
 */
export function useTrackedWrite() {
  const { begin, submitted, resolve } = useTransactions();

  return useCallback(
    async <T extends { txHash: string }>(
      label: string,
      run: (onProgress: WriteProgress) => Promise<T>,
    ): Promise<T> => {
      const id = begin(label);
      try {
        const result = await run((event) => {
          if (event.stage === "submitted") submitted(id, event.txHash);
        });
        resolve(id, "success");
        return result;
      } catch (error) {
        const failure = describeWriteError(error);
        resolve(
          id,
          failure.cancelled ? "cancelled" : "error",
          failure.cancelled ? undefined : failure.message,
        );
        throw error;
      }
    },
    [begin, submitted, resolve],
  );
}

const STATUS_COPY: Record<TxStatus, string> = {
  approving: "Confirm in your wallet…",
  pending: "Pending on-chain…",
  success: "Confirmed",
  error: "Failed",
  cancelled: "Cancelled in your wallet",
};

function TransactionToastHost() {
  const { records, dismiss } = useTransactions();

  if (records.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:items-end sm:px-6"
    >
      {records.map((record) => (
        <div
          key={record.id}
          className={`panel pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 ${
            record.status === "error" ? "border-loss/40" : ""
          }`}
        >
          <span
            aria-hidden="true"
            className={`mt-1 h-2 w-2 flex-none rounded-full ${
              record.status === "success"
                ? "bg-profit"
                : record.status === "error"
                  ? "bg-loss"
                  : record.status === "cancelled"
                    ? "bg-muted"
                    : "animate-pulse bg-accent"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">
              {record.label}
            </p>
            <p
              className={`mt-0.5 text-xs ${
                record.status === "error" ? "text-loss" : "text-muted"
              }`}
            >
              {record.status === "error" && record.detail
                ? record.detail
                : STATUS_COPY[record.status]}
              {record.txHash && (
                <>
                  {" · "}
                  <a
                    href={txUrl(record.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    View tx ↗
                  </a>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(record.id)}
            aria-label="Dismiss"
            className="flex-none text-muted transition hover:text-text"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/** The header's own glimpse of the same state, a dot and a count, not a
 *  second list; the toasts already are the list. */
export function PendingTxIndicator() {
  const count = usePendingTxCount();
  if (count === 0) return null;

  return (
    <span
      role="status"
      aria-label={`${count} transaction${count === 1 ? "" : "s"} pending`}
      className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[11px] text-accent"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
      {count}
    </span>
  );
}
