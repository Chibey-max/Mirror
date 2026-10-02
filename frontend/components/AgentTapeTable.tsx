"use client";

import { Badge } from "@/components/Badge";
import { useRef } from "react";
import { Pager } from "@/components/Pager";
import { usePaged } from "@/hooks/usePaged";
import { txUrl } from "@/lib/chains";
import type { AgentFill } from "@/hooks/useAgents";

/** Rows per page: the latest eight first, the rest a page at a time. */
const PAGE_SIZE = 8;

export function AgentTapeTable({ fills }: { fills: AgentFill[] }) {
  const anchor = useRef<HTMLDivElement>(null);
  const paging = usePaged(fills, PAGE_SIZE, anchor);
  const { page, rows, missing, paged, rowMotion } = paging;
  if (fills.length === 0) {
    return (
      <div className="panel rounded-3xl p-6 text-sm text-muted">
        No fills recorded for this agent yet.
      </div>
    );
  }

  return (
    <div ref={anchor}>
      {/* Phones get one card per fill; the table needed 680px and scrolled
          sideways, hiding the explorer link off the right edge. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((fill, index) => (
          <li
            key={`${page}-${fill.id}`}
            style={rowMotion(index).style}
            className={`lift panel flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${rowMotion(index).className}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="pop"><Badge variant={fill.side === "BUY" ? "buy" : "sell"}>{fill.side}</Badge></span>
              <div className="min-w-0">
                <p className="text-sm text-text">
                  <span className="tabular">{fill.size}</span> {fill.token}{" "}
                  <span className="tabular text-muted">@ ${fill.price}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{fill.time}</p>
              </div>
            </div>
            {fill.txHash ? (
              <a
                href={txUrl(fill.txHash)}
                target="_blank"
                rel="noreferrer"
                className="-my-2 flex-none whitespace-nowrap py-3 text-sm font-medium text-accent hover:underline"
              >
                Open tx
              </a>
            ) : (
              <span className="flex-none text-sm text-muted">n/a</span>
            )}
          </li>
        ))}
      </ul>
      {paged && (
        <div className="panel mt-3 overflow-hidden rounded-3xl sm:hidden">
          <Pager paging={paging} label="Verified tape pages" />
        </div>
      )}
      <div className="hidden overflow-hidden panel rounded-3xl sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-border bg-[var(--row-hover)] text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Side</th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((fill, index) => (
                <tr
                  key={`${page}-${fill.id}`}
                  style={rowMotion(index).style}
                  className={`data-row ${rowMotion(index).className}`}
                >
                  <td className="px-4 py-3">
                    <span className="pop">
                      <Badge variant={fill.side === "BUY" ? "buy" : "sell"}>
                        {fill.side}
                      </Badge>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-text">{fill.token}</td>
                  <td className="tabular px-4 py-3 text-text">{fill.size}</td>
                  <td className="tabular px-4 py-3 text-text">${fill.price}</td>
                  <td className="px-4 py-3 text-muted">{fill.time}</td>
                  <td className="px-4 py-3">
                    {fill.txHash ? (
                      <a
                        href={txUrl(fill.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent/70"
                      >
                        Open tx
                      </a>
                    ) : (
                      // Read back from TrackRecord, which returns the fill and
                      // not the transaction that recorded it.
                      <span className="text-muted">n/a</span>
                    )}
                  </td>
                </tr>
              ))}
              {/* The last page keeps a full page's height, so the pager
                  under it doesn't jump. */}
              {Array.from({ length: missing }, (_, i) => (
                <tr key={`pad-${i}`} aria-hidden="true" style={{ borderColor: "transparent" }}>
                  <td colSpan={6} className="px-4 py-3">
                    <span className="invisible">
                      <Badge variant="buy">BUY</Badge>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paged && <Pager paging={paging} label="Verified tape pages" />}
      </div>
    </div>
  );
}
