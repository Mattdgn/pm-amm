/** pm/amm wordmark — bracketed [p] + lockup. Port of shared/logo.js. */
export function Wordmark({
  size = 16,
  tone = "light",
}: {
  size?: number;
  tone?: "light" | "dark";
}) {
  const color = tone === "light" ? "var(--text-hi)" : "var(--bg)";
  const dim = tone === "light" ? "var(--muted)" : "oklch(0.45 0.01 70)";

  return (
    <div
      className="inline-flex items-center"
      style={{
        gap: size * 0.4,
        color,
        fontFamily: "var(--font-sans)",
        fontSize: size,
        fontWeight: 500,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: size * 0.9,
          height: size * 0.9,
          border: `1px solid ${color}`,
          borderRadius: 2,
          fontSize: size * 0.55,
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          letterSpacing: 0,
        }}
      >
        p
      </span>
      <span>
        pm<span style={{ color: dim }}>/</span>amm
      </span>
    </div>
  );
}
