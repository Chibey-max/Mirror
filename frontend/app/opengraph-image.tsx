import { ImageResponse } from "next/og";

export const alt =
  "Mirror: every trade on-chain, every follow capped. On-chain agent track records on Robinhood Chain.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The card a shared link unfurls into. Same palette as the app: black
// ledger ground, the copper accent, off-white type.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "radial-gradient(ellipse 70% 60% at 12% 0%, rgba(226,169,127,0.28) 0%, rgba(226,169,127,0) 70%), #050506",
          color: "#ececef",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "3px solid #e2a97f",
            }}
          />
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>
            Mirror
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
            Every trade on-chain.
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              color: "#e2a97f",
            }}
          >
            Every follow capped.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 24,
            color: "#8e9097",
          }}
        >
          <div>Tamper-proof track records · hard daily caps · a kill switch</div>
          <div>Robinhood Chain</div>
        </div>
      </div>
    ),
    size,
  );
}
