import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "pm-AMM — Prediction Markets on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0b",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "6px",
            marginBottom: "24px",
          }}
        >
          <span style={{ fontSize: "72px", fontWeight: 500, color: "#e5e5e5", letterSpacing: "-0.02em" }}>
            pm-AMM
          </span>
        </div>
        <div
          style={{
            fontSize: "24px",
            color: "#737373",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
          }}
        >
          Prediction Markets on Solana
        </div>
        <div
          style={{
            display: "flex",
            gap: "32px",
            marginTop: "48px",
          }}
        >
          <div
            style={{
              padding: "16px 32px",
              border: "1px solid rgba(52, 211, 153, 0.3)",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "14px", color: "#34d399", letterSpacing: "0.08em" }}>YES</span>
            <span style={{ fontSize: "36px", color: "#34d399", fontFamily: "monospace" }}>0.6420</span>
          </div>
          <div
            style={{
              padding: "16px 32px",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "14px", color: "#f43f5e", letterSpacing: "0.08em" }}>NO</span>
            <span style={{ fontSize: "36px", color: "#f43f5e", fontFamily: "monospace" }}>0.3580</span>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            fontSize: "14px",
            color: "#525252",
            letterSpacing: "0.05em",
          }}
        >
          Paradigm pm-AMM (Moallemi & Robinson, 2024)
        </div>
      </div>
    ),
    { ...size }
  );
}
