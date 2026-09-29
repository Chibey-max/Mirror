/**
 * WalletConnect's QR modal (Reown AppKit) dressed in Mirror's look.
 *
 * AppKit renders web components in nested shadow roots, which our CSS
 * can't reach. Two layers:
 *
 *   1. Its public theme API: font, dark/light mode, surfaces mixed toward
 *      our black or prism's paper, accent, and a near-black QR so the code
 *      stays scannable.
 *   2. A stylesheet adopted into every shadow root of the open modal,
 *      putting the buttons' liquid chrome on the card's edge and on the
 *      major containers inside it (the QR tile and the wallet rows), with
 *      a slow turn so it moves like the buttons' metal does. Roots
 *      appear as the modal changes view, so it keeps looking while open.
 *
 * Best effort throughout: if AppKit's internals change, the modal opens in
 * its default style and still connects.
 */

type ThemeableModal = {
  setThemeMode?: (mode: "dark" | "light") => void;
  setThemeVariables?: (variables: Record<string, string | number>) => void;
  subscribeState?: (callback: (state: { open?: boolean }) => void) => () => void;
};

/** The neutral chrome of MetalButton's CSS rim, hard-stopped bands. */
const CHROME_STOPS =
  "#3b3b40, #f2f2f6 11%, #6a6a72 23%, #d6d6dc 37%, #2c2c33 51%, #fafaff 64%, #77777f 78%, #cbcbd3 91%, #3b3b40";

/** The containers that get a rim, and the radius each one's inner surface
 *  already has, so the rim sits exactly on its edge. Only the major ones:
 *  the card, the QR tile and the wallet rows. Rims on every button, icon
 *  and tag as well turned the modal into a pile of chrome. */
const RIMMED: ReadonlyArray<readonly [string, string | null]> = [
  ["wui-card", null],
  ["wui-shimmer", null],
  ["wui-qr-code", null],
  ["wui-list-wallet", "24px"],
  ["wui-list-item", "24px"],
];

function dressSheet(prism: boolean): CSSStyleSheet {
  const tags = RIMMED.map(([tag]) => tag);
  const radii = RIMMED.filter(([, radius]) => radius)
    .map(([tag, radius]) => `${tag} { border-radius: ${radius}; }`)
    .join("\n");
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    @keyframes mirror-metal { to { --mirror-metal: 360deg; } }

    ${tags.join(", ")} { position: relative; }
    wui-list-wallet, wui-list-item { display: block; }
    ${radii}

    ${tags.map((tag) => `${tag}::after`).join(", ")} {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 2;
      border-radius: inherit;
      padding: 1px;
      pointer-events: none;
      background: conic-gradient(from var(--mirror-metal, 0deg), ${CHROME_STOPS});
      -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      opacity: 0.8;
      animation: mirror-metal 7s linear infinite;
    }

    /* The card: a heavier rim, a lit top edge like glass catching light,
       and a deep drop, the same object as the site's header pill. */
    wui-card::after { padding: 2px; opacity: 1; animation-duration: 11s; }
    wui-card {
      box-shadow:
        inset 0 1px 0 ${prism ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.08)"},
        0 40px 90px -24px ${prism ? "rgba(94, 71, 48, 0.35)" : "rgba(0, 0, 0, 0.8)"} !important;
    }

    /* A still chrome hairline under the header. */
    w3m-header { display: block; position: relative; }
    w3m-header::after {
      content: "";
      position: absolute;
      left: 22px;
      right: 22px;
      bottom: 0;
      height: 1px;
      pointer-events: none;
      background: linear-gradient(90deg, transparent, #6a6a72 20%, #f2f2f6 35%, #77777f 50%, #fafaff 65%, #6a6a72 80%, transparent);
      opacity: 0.6;
    }

    @media (prefers-reduced-motion: reduce) {
      ${tags.map((tag) => `${tag}::after`).join(", ")} { animation: none; }
    }
  `);
  return sheet;
}

/** Adopt the sheet into every shadow root under `root` not yet dressed. */
function dressTree(root: ParentNode, sheet: CSSStyleSheet, dressed: WeakSet<ShadowRoot>) {
  for (const el of root.querySelectorAll("*")) {
    const shadow = el.shadowRoot;
    if (!shadow) continue;
    if (!dressed.has(shadow)) {
      dressed.add(shadow);
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
    }
    dressTree(shadow, sheet, dressed);
  }
}

let stopDressing: (() => void) | null = null;

export async function themeWalletConnectModal(
  getProvider: () => Promise<unknown>,
) {
  try {
    const provider = (await getProvider()) as { modal?: ThemeableModal } | undefined;
    const modal = provider?.modal;
    if (!modal) return;
    const prism = document.documentElement.dataset.theme === "prism";
    const font = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-space-grotesk")
      .trim();

    const theme = {
      "font-family": `${font ? `${font}, ` : ""}ui-sans-serif, system-ui, sans-serif`,
      accent: prism ? "#74471f" : "#dfe1e6",
      "color-mix": prism ? "#f4f0e8" : "#000000",
      "color-mix-strength": prism ? 35 : 45,
      "border-radius-master": "6px",
      "qr-color": "#0b0b0c",
      "z-index": 70,
    };
    // AppKit 1.8 reads both spellings in different components (the old
    // --w3m names and the newer --apkt ones); set each value under both.
    const variables: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(theme)) {
      variables[`--w3m-${name}`] = value;
      variables[`--apkt-${name}`] = value;
    }
    modal.setThemeMode?.(prism ? "light" : "dark");
    modal.setThemeVariables?.(variables);

    // Dress the modal's parts for as long as it's open. Its views mount new
    // shadow roots as you move through them, so it keeps looking.
    stopDressing?.();
    const sheet = dressSheet(prism);
    const dressed = new WeakSet<ShadowRoot>();
    const tick = () => {
      const top = document.querySelector("w3m-modal")?.shadowRoot;
      if (!top) return;
      // The modal's own root holds the card; everything else is nested.
      if (!dressed.has(top)) {
        dressed.add(top);
        top.adoptedStyleSheets = [...top.adoptedStyleSheets, sheet];
      }
      dressTree(top, sheet, dressed);
    };
    const timer = window.setInterval(tick, 250);
    tick();
    let wasOpen = false;
    const unsubscribe = modal.subscribeState?.((state) => {
      if (state.open) wasOpen = true;
      else if (wasOpen) stopDressing?.();
    });
    // A ceiling, in case the modal never reports its state.
    const ceiling = window.setTimeout(() => stopDressing?.(), 5 * 60_000);
    stopDressing = () => {
      window.clearInterval(timer);
      window.clearTimeout(ceiling);
      unsubscribe?.();
      stopDressing = null;
    };
  } catch {
    // Unstyled is fine; failing to connect over styling is not.
  }
}
