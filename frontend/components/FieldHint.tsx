/**
 * What's wrong with a value while it's being typed: shown against the field
 * itself rather than as a toast, since it changes with every keystroke and a
 * notification per keypress would be noise. A marked chip, not a loose line
 * of red text, so it reads as part of the form.
 */
export function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="mt-2 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss/[0.07] px-3 py-2 text-xs leading-relaxed text-loss motion-safe:animate-[rowIn_0.2s_ease-out]"
    >
      <span
        aria-hidden="true"
        className="mt-px flex size-4 flex-none items-center justify-center rounded-full border border-loss/50 text-[10px] font-bold"
      >
        !
      </span>
      <span className="text-text/85">{children}</span>
    </p>
  );
}
