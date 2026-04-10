/**
 * Blueprint design system — tokens, shared styles, keyframes.
 */
import type { CSSProperties } from "react";

// ── Color tokens ─────────────────────────────────────────────────────────────
export const C = {
  bg: "#FAFBFC",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  primaryLight: "#EFF6FF",
  primaryMuted: "#DBEAFE",
  violet: "#7C3AED",
  text: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  success: "#16A34A",
  error: "#DC2626",
  userBubble: "#2563EB",
  assistantBubble: "#F1F5F9",
  sidebarBg: "#F8FAFC",
  hover: "#EFF6FF",
  selected: "#DBEAFE",
};

// ── Typography ───────────────────────────────────────────────────────────────
export const FONT = {
  mono: "'JetBrains Mono', monospace",
  sans: "'Inter', system-ui, sans-serif",
};

// ── Button styles ────────────────────────────────────────────────────────────
export const btnPrimary: CSSProperties = {
  borderRadius: 8, border: "none", background: C.primary, color: "#fff",
  fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT.sans,
  transition: "background 0.15s",
};

export const btnGhost: CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
  background: "transparent", fontSize: 13, fontWeight: 500, cursor: "pointer",
  color: C.textSecondary, fontFamily: FONT.sans,
  transition: "all 0.15s",
};

export const btnAction: CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`,
  background: C.surface, fontSize: 13, fontWeight: 500, cursor: "pointer",
  color: C.text, fontFamily: FONT.sans,
  transition: "all 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

export const btnActionPrimary: CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "5px 12px", borderRadius: 7, border: "none",
  background: C.primary, fontSize: 14, fontWeight: 600, cursor: "pointer",
  color: "#FFFFFF", fontFamily: FONT.sans,
  transition: "all 0.15s", boxShadow: "0 1px 3px rgba(37,99,235,0.3)",
};

export const btnIcon: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 6, border: "none",
  background: "transparent", cursor: "pointer", color: C.textSecondary,
  transition: "all 0.15s",
};

export const btnQuickAction: CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  padding: "5px 12px", borderRadius: 16,
  border: `1px solid ${C.border}`, background: C.surface,
  fontSize: 13, fontWeight: 500, cursor: "pointer", color: C.textSecondary,
  fontFamily: FONT.sans, transition: "all 0.15s", whiteSpace: "nowrap",
};

// ── Skeleton styles ──────────────────────────────────────────────────────────
export const skeletonOverlay: CSSProperties = {
  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(250,251,252,0.97)",
  zIndex: 10,
  display: "flex", alignItems: "center", justifyContent: "center",
};

export const skeletonOrb: CSSProperties = {
  width: 48, height: 48, borderRadius: "50%",
  border: `2px solid ${C.border}`, borderTopColor: C.primary,
  animation: "orbSpin 1s linear infinite",
};

export const skeletonOrbInner: CSSProperties = {
  width: 20, height: 20, borderRadius: "50%",
  background: C.primary, margin: "12px auto",
  animation: "orbPulse 2s ease-in-out infinite",
};

export const skeletonStatusBar: CSSProperties = {
  position: "absolute",
  display: "flex", alignItems: "center", gap: 12,
  padding: "8px 20px", borderRadius: 24,
  background: C.surface, boxShadow: "0 4px 16px rgba(0,0,0,0.06)", border: `1px solid ${C.borderLight}`,
  minWidth: 280,
};

export const skeletonProgressTrack: CSSProperties = {
  width: 60, height: 4, borderRadius: 2,
  background: C.borderLight, overflow: "hidden",
};

export const skeletonProgressFill: CSSProperties = {
  height: "100%", borderRadius: 2,
  background: `linear-gradient(90deg, ${C.primary}, #60A5FA, ${C.primary})`,
  backgroundSize: "200% 100%",
  animation: "progressShimmer 1.5s linear infinite",
  transition: "width 0.4s ease",
};

// ── Keyframes (inject via <style> tag) ───────────────────────────────────────
export const KEYFRAMES = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeInUp { from { opacity: 0; transform: translateX(-50%) translateY(-8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
@keyframes glowPulse { 0%, 100% { opacity: 0; } 50% { opacity: 0.6; } }
@keyframes borderGlow { 0%, 100% { stroke: #c8d4e8; } 50% { stroke: #88aaee; } }
@keyframes iconPulse { 0%, 100% { fill: #e8f0fe; } 50% { fill: #c0d4f8; } }
@keyframes drawLine { to { stroke-dashoffset: 0; } }
@keyframes orbSpin { to { transform: rotate(360deg); } }
@keyframes orbPulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.2); opacity: 1; } }
@keyframes progressShimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
`;
