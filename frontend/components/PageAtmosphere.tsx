import { SingularityHorizon } from "@/components/SingularityHorizon";
import { Starfield } from "@/components/Starfield";

/**
 * The hero's body and ring, dimmed right down, behind an inner page.
 *
 * The landing page gets the full object; here it's atmosphere, faded to a
 * third and masked away before it reaches the content so tables and numbers
 * never sit on a moving field. Fewer particles too: this is a background, and
 * the screens it sits behind are the ones people actually read.
 *
 * Placement is the landing hero's, box for box and breakpoint for breakpoint
 * (see the hero-canvas-mask div in app/page.tsx), so the body sits in the
 * same spot on every page instead of drifting off to the right. Change one,
 * change both.
 */
export function PageAtmosphere() {
  return (
    <>
      {/* The same star field as the landing page, settled, drifting and
          sliding by depth as the page scrolls, behind everything. */}
      <Starfield ambient />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[78svh] overflow-hidden opacity-40 [mask-image:linear-gradient(to_bottom,#000_20%,transparent_88%)]"
      >
        <div className="absolute left-[calc(50%-20vw)] top-[calc(20px-30.7svh)] h-[115svh] w-[170vw] -translate-x-1/2 sm:left-[calc(50%-35vw)] sm:top-[calc(20px-25.6svh)] sm:h-[145svh] sm:w-[180vw]">
          <SingularityHorizon height="100%" particles={18000} pixelBudget={1_200_000} />
        </div>
        {/* The fade is a real mask on this screen-sized wrapper (not on the
            several-screen canvas box inside it), so the stars
            behind the page show through instead of meeting a black edge. */}
      </div>
    </>
  );
}
