// Design tokens for the Curriculum Scoping Engine.
// These mirror the HTML prototype exactly. Map them onto your codebase's
// existing token system (Tailwind config, CSS vars, theme provider, etc.).

export const color = {
  ink: "#0f1729",
  inkHover: "#1e293b",
  bg: "#ffffff",
  panel: "#fbfcfd",
  panelAlt: "#f8fafc",
  border: "#e6e9ef",
  borderSoft: "#f1f5f9",
  borderHover: "#cbd5e1",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  textBody: "#475569",
  textStrong: "#334155",
  green: "#16a34a",
  greenBorder: "#22c55e",
  greenBg: "#dcfce7",
  greenText: "#166534",
  amber: "#f59e0b",
  amberText: "#d97706",
  red: "#ef4444",
  redStrong: "#dc2626",
  redBg: "#fee2e2",
  redText: "#991b1b",
  indigo: "#4f46e5",
  indigoBg: "#eef2ff",
  indigoBorder: "#c7d2fe",
  indigoTint: "#f5f7ff",
};

export const font = {
  ui: "'Inter Tight', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

export const radius = { sm: 6, md: 9, lg: 11, xl: 13, xxl: 16 };

export const shadow = {
  card: "0 1px 3px rgba(15,23,41,.12)",
  cardHover: "0 6px 20px -8px rgba(15,23,41,.18)",
  modal: "0 24px 60px -12px rgba(15,23,41,.4)",
  toast: "0 12px 32px -8px rgba(15,23,41,.5)",
};
