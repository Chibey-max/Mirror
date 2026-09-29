export type MirrorMode = "fixture" | "live";

const configuredMode = process.env.NEXT_PUBLIC_MIRROR_MODE;
const localDefault =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
    ? "fixture"
    : undefined;
const selectedMode = configuredMode ?? localDefault;

if (selectedMode !== "fixture" && selectedMode !== "live") {
  throw new Error(
    "NEXT_PUBLIC_MIRROR_MODE must be explicitly set to fixture or live",
  );
}

export const mirrorMode: MirrorMode = selectedMode;

export function walletConnectProjectId(): string {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  // Required for a live production build. In local development, live mode
  // reads the chain without it; only WalletConnect can't pair until one is
  // set in .env.local.
  if (mirrorMode === "live" && !projectId && process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required in live mode",
    );
  }
  return projectId ?? "mirror-fixture-only";
}
