// pm/amm — minimal wordmark. A small bracket + the text.
// No animated curve, no dynamic probability. Quiet by default.
window.PmAmmWordmark = function PmAmmWordmark({ size = 16, tone = "light" } = {}) {
  const color = tone === "light" ? "var(--text-hi)" : "var(--bg)";
  const dim = tone === "light" ? "var(--muted)" : "oklch(0.45 0.01 70)";
  return React.createElement("div", {
    style: {
      display: "inline-flex", alignItems: "center", gap: size * 0.4,
      color, fontFamily: "var(--font-sans)",
      fontSize: size, fontWeight: 500, letterSpacing: "-0.02em",
      lineHeight: 1
    }
  },
    React.createElement("span", {
      style: {
        width: size * 0.9, height: size * 0.9,
        border: `1px solid ${color}`,
        borderRadius: 2,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.55, fontFamily: "var(--font-mono)", fontWeight: 500,
        letterSpacing: 0
      }
    }, "p"),
    React.createElement("span", null,
      "pm",
      React.createElement("span", { style: { color: dim } }, "/"),
      "amm"
    )
  );
};
