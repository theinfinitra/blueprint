import { useEffect, useState, useRef } from "react";
import { KEYFRAMES, skeletonOverlay, skeletonOrb, skeletonOrbInner, skeletonStatusBar, skeletonProgressTrack, skeletonProgressFill } from "./styles";

interface Props {
  services: string[];
  phase: "thinking" | "building" | "done" | null;
}

const NODE_W = 110, NODE_H = 56, GAP_X = 170, GAP_Y = 130, MAX_COLS = 4;

export function DiagramSkeleton({ services, phase }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== "building" || services.length === 0) return;
    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount((c) => {
        if (c >= services.length) { clearInterval(interval); return c; }
        return c + 1;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [phase, services]);

  if (phase === "thinking") {
    return (
      <div ref={containerRef} style={skeletonOverlay}>
        <style>{KEYFRAMES}</style>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={skeletonOrb}><div style={skeletonOrbInner} /></div>
          <p style={{ color: "#555", fontSize: 14, marginTop: 20, animation: "fadeInUp 0.6s ease" }}>
            Understanding your architecture...
          </p>
        </div>
      </div>
    );
  }

  if (phase !== "building") return null;

  // Compute centered positions
  const cols = Math.min(services.length, MAX_COLS);
  const totalRows = Math.ceil(services.length / cols);
  const gridW = cols * GAP_X - (GAP_X - NODE_W);
  const gridH = totalRows * GAP_Y - (GAP_Y - NODE_H);
  const offsetX = (size.w - gridW) / 2;
  const offsetY = (size.h - gridH) / 2 - 20; // shift up slightly to make room for pill

  const nodes = services.map((name, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const colsInRow = row === totalRows - 1 ? ((services.length - 1) % cols) + 1 : cols;
    const rowOffset = (cols - colsInRow) * GAP_X / 2;
    return {
      name,
      x: offsetX + col * GAP_X + rowOffset,
      y: offsetY + row * GAP_Y,
      visible: i < visibleCount,
      delay: i * 0.15,
    };
  });

  const edges = nodes.slice(1).map((node, i) => {
    const prev = nodes[i];
    const x1 = prev.x + NODE_W + 5, y1 = prev.y + NODE_H / 2;
    const x2 = node.x - 5, y2 = node.y + NODE_H / 2;
    return {
      x1, y1, x2, y2,
      visible: prev.visible && node.visible,
      length: Math.hypot(x2 - x1, y2 - y1),
      delay: (i + 1) * 0.15 + 0.3,
    };
  });

  // Pill sits right below the grid
  const pillY = offsetY + gridH + 30;

  return (
    <div ref={containerRef} style={skeletonOverlay}>
      <style>{KEYFRAMES}</style>
      <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#eef" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
            <animate attributeName="r" values="30%;50%;30%" dur="4s" repeatCount="indefinite" />
            <stop offset="0%" stopColor="#e8f0fe" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#bgGlow)" />

        {/* Self-drawing edges with traveling dot */}
        {edges.map((e, i) => e.visible && (
          <g key={`e${i}`}>
            <line
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke="#d0d8e8" strokeWidth="2"
              strokeDasharray={e.length}
              strokeDashoffset={e.length}
              style={{ animation: `drawLine 0.6s ease ${e.delay}s forwards` }}
            />
            <circle r="3" fill="#4488ff" opacity="0.8" filter="url(#glow)">
              <animateMotion
                dur="2s" repeatCount="indefinite"
                path={`M${e.x1},${e.y1} L${e.x2},${e.y2}`}
                begin={`${e.delay + 0.6}s`}
              />
            </circle>
          </g>
        ))}

        {/* Nodes with glow + scale entrance */}
        {nodes.map((n, i) => (
          <g
            key={i}
            style={{
              opacity: n.visible ? 1 : 0,
              transform: n.visible ? "scale(1)" : "scale(0.8)",
              transformOrigin: `${n.x + NODE_W / 2}px ${n.y + NODE_H / 2}px`,
              transition: "opacity 0.4s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <rect
              x={n.x - 2} y={n.y - 2} width={NODE_W + 4} height={NODE_H + 4} rx={10}
              fill="none" stroke="#4488ff" strokeWidth="1" opacity="0"
              style={{ animation: n.visible ? `glowPulse 2.5s ease-in-out ${n.delay}s infinite` : "none" }}
              filter="url(#glow)"
            />
            <rect
              x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={8}
              fill="#fff" stroke="#c8d4e8" strokeWidth="1.5"
              style={{ animation: n.visible ? `borderGlow 3s ease-in-out ${n.delay}s infinite` : "none" }}
            />
            <rect
              x={n.x + 8} y={n.y + 10} width={20} height={20} rx={4}
              fill="#e8f0fe" stroke="none"
              style={{ animation: n.visible ? `iconPulse 2s ease-in-out ${n.delay}s infinite` : "none" }}
            />
            <text x={n.x + 36} y={n.y + 24} fontSize="11" fontFamily="Inter, system-ui, sans-serif" fill="#444" fontWeight="500">
              {n.name}
            </text>
            <text x={n.x + 36} y={n.y + 40} fontSize="9" fontFamily="Inter, system-ui, sans-serif" fill="#aaa">
              AWS Service
            </text>
          </g>
        ))}
      </svg>

      {/* Progress pill — positioned right below the grid */}
      <div style={{ ...skeletonStatusBar, top: pillY, left: "50%", transform: "translateX(-50%)" }}>
        <div style={skeletonProgressTrack}>
          <div style={{
            ...skeletonProgressFill,
            width: services.length > 0 ? `${Math.min((visibleCount / services.length) * 100, 100)}%` : "0%",
          }} />
        </div>
        <span style={{ fontSize: 12, color: "#666" }}>
          {visibleCount < services.length
            ? `Placing components... ${visibleCount}/${services.length}`
            : "Computing layout & applying AWS icons..."}
        </span>
      </div>
    </div>
  );
}

// Styles imported from styles.ts
