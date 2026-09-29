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
  /** A notification rather than a transaction: no wallet step, no hash,
   *  and `detail` is the whole message whatever the status. */
  notice?: boolean;
  /** Playing its exit animation; removed once that finishes. */
  leaving?: boolean;
  /** The words on the explorer link, when "View tx" isn't the right name
   *  (a rejection's tx is the evidence, not the user's own write). */
  linkLabel?: string;
};

export type NoticeTone = "error" | "success" | "info";

export type Notice = {
  title: string;
  detail?: string;
  tone?: NoticeTone;
  /** Adds an explorer link to this transaction. */
  txHash?: string;
  linkLabel?: string;
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
  /** Anything that isn't a transaction but still needs saying: a wallet
   *  that wouldn't connect, a network that couldn't be added. Every error
   *  in the app surfaces here rather than as a line of red text somewhere
   *  the user may not be looking. */
  notify: (notice: Notice) => void;
};

const TransactionsContext = createContext<TransactionsContextValue | null>(
  null,
);

const AUTO_DISMISS_MS = 6000;
/** Matches the toastOut keyframes in globals.css. */
const EXIT_MS = 220;

let nextId = 0;

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<TxRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setRecords((current) =>
      current.map((record) =>
        record.id === id ? { ...record, leaving: true } : record,
      ),
    );
    setTimeout(
      () => setRecords((current) => current.filter((record) => record.id !== id)),
      EXIT_MS,
    );
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

  const notify = useCallback(
    ({ title, detail, tone = "error", txHash, linkLabel }: Notice) => {
      const id = `notice-${++nextId}`;
      const status: TxStatus =
        tone === "error" ? "error" : tone === "success" ? "success" : "cancelled";
      setRecords((current) => [
        // The same message twice in a row (a retry that fails the same way)
        // replaces the old toast rather than stacking a copy of it.
        ...current.filter(
          (record) => !(record.notice && record.label === title && record.detail === detail),
        ),
        { id, label: title, status, detail, notice: true, txHash, linkLabel },
      ]);
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS + 2000);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  return (
    <TransactionsContext.Provider
      value={{ records, begin, submitted, resolve, dismiss, notify }}
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

/** Raise a notification from anywhere under the provider. */
export function useNotify() {
  return useTransactions().notify;
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

const TONE: Record<
  TxStatus,
  { ring: string; icon: string; glow: string; bar: string }
> = {
  approving: { ring: "border-accent/40 text-accent", icon: "", glow: "from-accent/15", bar: "" },
  pending: { ring: "border-accent/40 text-accent", icon: "", glow: "from-accent/15", bar: "" },
  success: { ring: "border-profit/40 text-profit", icon: "✓", glow: "from-profit/15", bar: "bg-profit/60" },
  error: { ring: "border-loss/50 text-loss", icon: "!", glow: "from-loss/20", bar: "bg-loss/70" },
  cancelled: { ring: "border-chrome-dim text-muted", icon: "i", glow: "from-white/5", bar: "bg-chrome-dim" },
};

/**
 * The one place anything is announced: transactions from the wallet prompt
 * to the receipt, and every error or notice the app raises.
 *
 * Each toast slides up into the stack, carries a status mark (a spinner
 * while a transaction is in flight), a wash of its tone's colour from the
 * left edge, and, once settled, a hairline that runs down to show how long
 * it has before it clears itself.
 */
function TransactionToastHost() {
  const { records, dismiss } = useTransactions();

  if (records.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] sm:items-end sm:pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:px-6"
    >
      {records.map((record) => {
        const tone = TONE[record.status];
        const inFlight = record.status === "approving" || record.status === "pending";
        const message =
          record.notice || (record.status === "error" && record.detail)
            ? record.detail
            : STATUS_COPY[record.status];
        const lifetime = record.notice ? AUTO_DISMISS_MS + 2000 : AUTO_DISMISS_MS;
        return (
          <div
            key={record.id}
            role={record.status === "error" ? "alert" : "status"}
            className={`panel panel-static pointer-events-auto relative flex w-full max-w-sm bg-surface items-start gap-3 overflow-hidden rounded-2xl px-4 py-3.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] ${
              record.status === "error" ? "border-loss/40" : ""
            } ${
              record.leaving
                ? "motion-safe:animate-[toastOut_220ms_ease-in_forwards]"
                : "motion-safe:animate-[toastIn_380ms_cubic-bezier(0.16,1,0.3,1)]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r ${tone.glow} to-transparent`}
            />
            <span
              aria-hidden="true"
              className={`relative mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border text-[12px] font-bold ${tone.ring}`}
            >
              {inFlight ? (
                <span className="size-3 rounded-full border-2 border-accent/30 border-t-accent motion-safe:animate-spin" />
              ) : (
                tone.icon
              )}
            </span>
            <div className="relative min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">{record.label}</p>
              {message && (
                <p
                  className={`mt-0.5 text-xs leading-relaxed ${
                    record.status === "error" ? "text-loss/90" : "text-muted"
                  }`}
                >
                  {message}
                </p>
              )}
              {record.txHash && (
                <a
                  href={txUrl(record.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
                >
                  {record.linkLabel ?? "View tx"} ↗
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(record.id)}
              aria-label="Dismiss"
              className="relative -m-1.5 flex size-8 flex-none items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-text"
            >
              ✕
            </button>
            {!inFlight && !record.leaving && (
              <span
                aria-hidden="true"
                className={`absolute bottom-0 left-0 h-px w-full origin-left motion-safe:animate-[toastTimer_linear_forwards] ${tone.bar}`}
                style={{ animationDuration: `${lifetime}ms` }}
              />
            )}
          </div>
        );
      })}
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
