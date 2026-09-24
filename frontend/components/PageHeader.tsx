import type { ReactNode } from "react";

/**
 * The masthead every inner page opens with: a mono eyebrow, the title, a line
 * of explanation, optional actions on the right, and a rule under the lot,
 * the same ledger vocabulary the tape and the stat cells use.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="border-b border-border pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            {eyebrow}
          </p>
          <h1 className="font-display mt-2 text-4xl tracking-tight">{title}</h1>
          {description && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * A section divider inside a page: the same mono label the tape and the stat
 * cells use, over a rule. Sections are told apart by their label and their
 * content, not by competing headline sizes.
 */
export function SectionHeader({
  label,
  description,
  actions,
}: {
  label: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-3">
      <div className="min-w-0">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          {label}
        </h2>
        {description && (
          <p className="mt-2 text-sm text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex-none">{actions}</div>}
    </div>
  );
}
