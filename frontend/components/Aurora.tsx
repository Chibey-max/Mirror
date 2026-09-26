/**
 * The light behind everything: very large, very soft pools of the planet's
 * own neutral light (its chrome, and a cold steel for depth) drifting
 * slowly across the black. No warm tones: a copper pool read as an orange
 * cast over the whole page, the way a nebula's
 * glow sits behind a star field. The page used to be flat black wherever
 * the planet wasn't.
 *
 * Plain radial gradients moved with transforms only (auroraDrift in
 * globals.css), so the compositor animates them without repainting, and no
 * blur filter: the gradients are already soft. Held still under reduced
 * motion.
 */
export function Aurora() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-30 overflow-hidden"
    >
      <div className="aurora-pool left-[-25vmax] top-[10vh] h-[90vmax] w-[90vmax] bg-[radial-gradient(closest-side,rgb(150_162_190/0.09),transparent)] motion-safe:animate-[auroraDrift_46s_ease-in-out_infinite_alternate]" />
      <div className="aurora-pool right-[-30vmax] top-[40vh] h-[100vmax] w-[100vmax] bg-[radial-gradient(closest-side,rgb(120_138_176/0.12),transparent)] motion-safe:animate-[auroraDrift_58s_ease-in-out_-20s_infinite_alternate-reverse]" />
      <div className="aurora-pool bottom-[-40vmax] left-[15vw] h-[80vmax] w-[80vmax] bg-[radial-gradient(closest-side,rgb(223_225_230/0.07),transparent)] motion-safe:animate-[auroraDrift_64s_ease-in-out_-35s_infinite_alternate]" />
    </div>
  );
}
