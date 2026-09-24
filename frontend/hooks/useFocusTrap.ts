"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside a modal while it's open.
 *
 * On open, focus moves into the dialog: its first input if it has one (the
 * amount field is what every modal here is for), otherwise its first
 * control. Tab and Shift+Tab wrap at the ends instead of walking out onto the
 * page behind the overlay. On close, focus goes back to whatever opened it,
 * so a keyboard user lands where they were rather than at the top of the page.
 *
 * Attach the returned ref to the element with role="dialog".
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;

    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );

    const initial =
      container.querySelector<HTMLElement>("input:not([disabled])") ??
      focusables()[0];
    if (initial) {
      initial.focus();
    } else {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !container) return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const outside = !container.contains(current);
      if (event.shiftKey && (current === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [active]);

  return ref;
}
