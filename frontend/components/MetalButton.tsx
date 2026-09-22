"use client";

import * as React from "react";
import Link from "next/link";
import { LiquidMetal } from "@paper-design/shaders-react";

/**
 * The one button style across Mirror: a dark pill inside a thin rim of moving
 * liquid chrome.
 *
 * Structure, from the reference (21st.dev liquid-metal-button):
 *   1. A chrome layer filling the whole pill, Paper Shaders' LiquidMetal.
 *   2. A dark gradient face inset 2px, so only a 2px rim of chrome shows.
 *   3. The label on top.
 * Hover speeds the chrome up, a press kicks it faster for 300ms and sinks the
 * pill 1px with an inset shadow.
 *
 * Every LiquidMetal is its own WebGL context, and browsers cap live contexts
 * per page (Chrome at 16, dropping the oldest). An agent page with a modal
 * open reaches that. So real shaders are handed out from a shared budget, and
 * any button past it, plus the small chips, where 2px of chrome is too thin
 * to tell apart, draws a CSS conic-gradient rim instead. When a shader
 * button unmounts, the next waiting button is promoted to a real one.
 */

type Tone = "primary" | "neutral" | "danger" | "quiet";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

type Base = {
  children: React.ReactNode;
  /** primary: the main action. danger: destructive. neutral: everything else. */
  tone?: Tone;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
};

type ButtonProps = Base &
  Omit<React.ComponentPropsWithoutRef<"button">, keyof Base> & {
    href?: undefined;
  };
type LinkProps = Base &
  Omit<React.ComponentPropsWithoutRef<typeof Link>, keyof Base | "href"> & {
    href: string;
  };
export type MetalButtonProps = ButtonProps | LinkProps;

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3.5 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
  icon: "h-11 w-11 text-base",
  "icon-sm": "h-8 w-8 text-sm",
};

/** The shader's tint. Primary pulls toward the signature; danger toward red. */
const TINT: Record<Tone, string> = {
  primary: "#ffb27a",
  neutral: "#ffffff",
  danger: "#ff8a80",
  quiet: "#ffffff",
};

const LABEL: Record<Tone, string> = {
  primary: "text-white",
  neutral: "text-[#d6d6d6]",
  danger: "text-loss",
  quiet: "text-muted transition-colors group-hover:text-text",
};

/** CSS stand-in for the shader: hard-stopped chrome bands around the rim. */
const CHROME: Record<Tone, string> = {
  neutral:
    "conic-gradient(from 200deg, #3b3b40, #f2f2f6 11%, #6a6a72 23%, #d6d6dc 37%, #2c2c33 51%, #fafaff 64%, #77777f 78%, #cbcbd3 91%, #3b3b40)",
  primary:
    "conic-gradient(from 200deg, #4a2a16, #ffe2c7 11%, #8a4f26 23%, #ffc08f 37%, #3a1e0e 51%, #fff1e3 64%, #9a5a2c 78%, #f7b683 91%, #4a2a16)",
  danger:
    "conic-gradient(from 200deg, #4a1814, #ffd3cf 11%, #8a2f28 23%, #ff9f97 37%, #3a120f 51%, #ffe6e3 64%, #9a3a32 78%, #f59a92 91%, #4a1814)",
  quiet: "transparent",
};

/** Real shaders allowed at once, leaving room for the hero's own canvas. */
const SHADER_BUDGET = 8;

/*
 * Shader slots, first come first served. A button's place in `waiting`
 * decides whether it gets a real shader; everyone is notified when the queue
 * changes so a freed slot is picked up without a remount.
 */
const waiting: { id: string; notify: () => void }[] = [];
const notifyAll = () => {
  for (const entry of waiting.slice()) entry.notify();
};

function useShaderSlot(id: string, wanted: boolean) {
  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (!wanted) return () => {};
      waiting.push({ id, notify });
      notifyAll();
      return () => {
        const i = waiting.findIndex((entry) => entry.id === id);
        if (i >= 0) waiting.splice(i, 1);
        notifyAll();
      };
    },
    [id, wanted],
  );
  const getSnapshot = React.useCallback(() => {
    const i = waiting.findIndex((entry) => entry.id === id);
    return i >= 0 && i < SHADER_BUDGET;
  }, [id]);
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function subscribeReducedMotion(notify: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", notify);
  return () => mq.removeEventListener("change", notify);
}

export function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** A shader slot for one component instance. False means draw the CSS rim. */
export function useMetalShaderSlot(wanted = true) {
  const id = React.useId();
  return useShaderSlot(id, wanted);
}

/**
 * The chrome rim and dark face on their own, for anything that should share
 * the buttons' material without being a button. Fills its positioned parent,
 * which sets the size; the shape is always a pill.
 */
export function MetalLayers({
  shader,
  speed,
  tone = "neutral",
  pressable = false,
  strip = false,
}: {
  /** From useMetalShaderSlot: a real shader, or the CSS stand-in. */
  shader: boolean;
  speed: number;
  tone?: Tone;
  /** Sink the face on :active of the nearest `group`. Buttons only. */
  pressable?: boolean;
  /**
   * For long, thin pills like the header. The button settings draw the metal
   * inside a circle sized to the canvas, which on a bar many times wider than
   * it is tall leaves every highlight bunched in the middle third; a strip
   * fills the whole canvas with the pattern instead.
   */
  strip?: boolean;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_2px_5px_rgba(0,0,0,0.35),0_9px_9px_rgba(0,0,0,0.25)]"
        style={shader ? undefined : { background: CHROME[tone] }}
      >
        {shader && (
          <LiquidMetal
            className="absolute inset-0 h-full w-full"
            speed={speed}
            /*
             * A strip needs broad, soft, lengthwise highlights. The button
             * settings tiled across a long canvas into diagonal barber-pole
             * streaks, with the red/blue dispersion multiplying them: four
             * repeats at 45 degrees is a highlight on a round pill and a
             * pattern on a bar. Fewer repeats, bigger scale, along the
             * length, and less fringing.
             */
            repetition={strip ? 0.8 : 4}
            softness={strip ? 1 : 0.5}
            shiftRed={strip ? 0.05 : 0.3}
            shiftBlue={strip ? 0.05 : 0.3}
            distortion={0}
            contour={0}
            angle={strip ? 90 : 45}
            scale={strip ? 9 : 8}
            shape={strip ? "none" : "circle"}
            offsetX={strip ? 0 : 0.1}
            offsetY={strip ? 0 : -0.1}
            colorTint={TINT[tone]}
          />
        )}
      </span>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-[2px] rounded-full bg-[linear-gradient(180deg,#232323_0%,#050505_100%)] ${
          pressable
            ? "transition-shadow duration-150 group-active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.45),inset_0_1px_2px_rgba(0,0,0,0.3)]"
            : ""
        }`}
      />
    </>
  );
}

export function MetalButton({
  children,
  tone = "neutral",
  size = "md",
  fullWidth = false,
  className = "",
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  ...rest
}: MetalButtonProps) {
  // Quiet buttons never take a shader slot: they have no rim to animate, and
  // the slots are scarce (see the budget above).
  const quiet = tone === "quiet";
  const small = size === "sm" || size === "icon-sm";
  const shader = useMetalShaderSlot(!small && !quiet);
  const reduced = useReducedMotion();
  const disabled = rest.href === undefined && !!rest.disabled;

  const [hover, setHover] = React.useState(false);
  const [burst, setBurst] = React.useState(false);
  const burstTimer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(burstTimer.current), []);

  const speed = reduced || disabled ? 0 : burst ? 2.4 : hover ? 1 : 0.6;

  const handlers = {
    onPointerEnter: (e: React.PointerEvent<never>) => {
      setHover(true);
      onPointerEnter?.(e);
    },
    onPointerLeave: (e: React.PointerEvent<never>) => {
      setHover(false);
      onPointerLeave?.(e);
    },
    onPointerDown: (e: React.PointerEvent<never>) => {
      setBurst(true);
      window.clearTimeout(burstTimer.current);
      burstTimer.current = window.setTimeout(() => setBurst(false), 300);
      onPointerDown?.(e);
    },
  };

  const classes = [
    "group relative isolate inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold outline-none",
    "transition-transform duration-150 ease-out active:translate-y-px active:scale-[0.98]",
    "focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0 disabled:active:scale-100",
    SIZE[size],
    fullWidth ? "w-full" : "",
    className,
  ].join(" ");

  const face = (
    <>
      {quiet ? (
        /*
         * A flat pill on a hairline, no chrome. Chrome everywhere turned
         * every control into a primary action; one metal button per view is
         * the rule, and this is everything else.
         */
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border border-border bg-[#0f0f11] transition-colors group-hover:border-chrome-dim group-hover:bg-[#15151a]"
        />
      ) : (
        <MetalLayers shader={shader} speed={speed} tone={tone} pressable />
      )}
      <span
        className={`relative z-10 inline-flex items-center justify-center gap-2 whitespace-nowrap [text-shadow:0_1px_2px_rgba(0,0,0,0.5)] ${LABEL[tone]}`}
      >
        {children}
      </span>
    </>
  );

  if (rest.href !== undefined) {
    const { href, ...anchor } = rest;
    return (
      <Link href={href} className={classes} {...anchor} {...handlers}>
        {face}
      </Link>
    );
  }

  const { type = "button", ...button } = rest;
  return (
    <button type={type} className={classes} {...button} {...handlers}>
      {face}
    </button>
  );
}
