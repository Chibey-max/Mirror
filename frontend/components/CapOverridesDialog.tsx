"use client";

import { useEffect, useId, useState } from "react";
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
  min,
  max,
  step,
  overrides,
  agentNames,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  current: number;
  /** Where the visitor let go of the home slider: the dialog's starting value. */
  next: number;
  min: number;
  max: number;
  step: number;
  overrides: CustomCap[];
  agentNames: Record<number, string>;
  onConfirm: (cap: number) => void;
  onCancel: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  // The home slider is behind this dialog, so the cap is adjusted here.
  // Mounted fresh for each change (keyed by the caller), so it starts at `next`.
  const [value, setValue] = useState(next);
  const sliderId = useId();

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
          You set {many ? "these" : "this"} on the agent&rsquo;s page. A new general cap
          won&rsquo;t change {many ? "them" : "it"}: it applies to every other agent and to new
          follows.
        </p>

        <div className="mt-4 rounded-2xl border border-border p-4">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={sliderId} className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              New general cap
            </label>
            <p className="tabular text-2xl font-semibold">
              ${value}
              <span className="ml-2 text-sm font-normal text-muted">was ${current}</span>
            </p>
          </div>
          <input
            id={sliderId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
            className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 [accent-color:var(--color-accent)]"
          />
        </div>

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
          <MetalButton
            tone="primary"
            fullWidth
            disabled={value === current}
            onClick={() => onConfirm(value)}
          >
            {value === current ? `General cap stays $${current}` : `Change general cap to $${value}`}
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
