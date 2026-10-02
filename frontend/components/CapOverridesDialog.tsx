"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MetalButton } from "@/components/MetalButton";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { CustomCap } from "@/lib/capPrefs";

/**
 * Asked before the general cap changes while some agents have their own:
 * the visitor may have forgotten setting them, and should know which agents
 * the new general cap won't reach.
 */
export function CapOverridesDialog({
  open,
  current,
  next,
  overrides,
  agentNames,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  current: number;
  next: number;
  overrides: CustomCap[];
  agentNames: Record<number, string>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  const many = overrides.length > 1;

  // At the body, not where it's declared: the preview sits inside animated
  // (transformed) sections, which would pin a fixed overlay to them.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cap-overrides-title"
        aria-describedby="cap-overrides-body"
        className="panel panel-static w-full max-w-md rounded-t-3xl p-6 sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="cap-overrides-title" className="text-lg font-semibold text-text">
          {many ? `${overrides.length} agents have their own cap` : "One agent has its own cap"}
        </h2>
        <p id="cap-overrides-body" className="mt-2 text-sm leading-relaxed text-muted">
          You set {many ? "these" : "this"} on the agent&rsquo;s page. Changing your general cap
          from <span className="tabular text-text">${current}</span> to{" "}
          <span className="tabular text-text">${next}</span> won&rsquo;t change{" "}
          {many ? "them" : "it"}: the general cap applies to every other agent and to new follows.
        </p>

        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
          {overrides.map((item) => (
            <li key={item.agentId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/agents/${item.agentId}`}
                  className="font-medium text-text hover:underline"
                >
                  {agentNames[item.agentId] ?? `Agent #${item.agentId}`}
                </Link>
                <p className="text-xs text-muted">
                  {item.source === "following"
                    ? "Following · cap set on-chain"
                    : "Not following · saved cap"}
                </p>
              </div>
              <span className="tabular text-sm font-semibold">${item.cap.toFixed(2)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <MetalButton tone="primary" fullWidth onClick={onConfirm}>
            Change general cap to ${next}
          </MetalButton>
          <MetalButton tone="quiet" fullWidth onClick={onCancel}>
            Keep ${current}
          </MetalButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
