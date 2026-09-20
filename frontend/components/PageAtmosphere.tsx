import { SingularityHorizon } from "@/components/SingularityHorizon";

/**
 * The hero's body and ring, dimmed right down, behind an inner page.
 *
 * The landing page gets the full object; here it's atmosphere — pushed off to
 * one side, faded to a third, and masked away before it reaches the content
 * so tables and numbers never sit on a moving field. Fewer particles too:
 * this is a background, and the screens it sits behind are the ones people
 * actually read.
 */
export function PageAtmosphere() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[78svh] overflow-hidden opacity-40 [mask-image:linear-gradient(to_bottom,#000_20%,transparent_88%)]"
    >
      <div className="absolute -top-[56svh] left-[calc(50%+26vw)] h-[120svh] w-[150vw] -translate-x-1/2">
        <SingularityHorizon height="100%" particles={18000} />
      </div>
    </div>
  );
}
