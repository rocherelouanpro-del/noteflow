import React from "react";

// Camembert / donut SVG : taux de complétion d'une habitude
export default function Donut({ pct, color, size = 92, stroke = 11 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (c * Math.min(Math.max(pct, 0), 100)) / 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct)}%`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        style={{ stroke: "rgb(var(--hover))" }}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.21}
        fontWeight="600"
        style={{ fill: "rgb(var(--ink))" }}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}
