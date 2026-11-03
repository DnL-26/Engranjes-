import type { Expr } from "../sim/dialogue";

/**
 * Retrato de Anselmo como eco de vapor, en SVG. Las clases a-* las anima style.css: el vapor ondula,
 * los engranajes giran y la figura flota.
 */

const BROWS: Record<Expr, string> = {
  normal: "M74 88 Q85 84 95 88 M105 88 Q115 84 126 88",
  surprised: "M74 81 Q85 75 95 81 M105 81 Q115 75 126 81",
  worried: "M74 84 Q85 90 95 88 M105 88 Q115 90 126 84",
  proud: "M74 90 Q85 85 95 89 M105 89 Q115 85 126 90",
};

function eyes(expr: Expr): string {
  if (expr === "surprised") {
    return '<circle cx="85" cy="104" r="4.2" fill="#2a3b5a"/><circle cx="115" cy="104" r="4.2" fill="#2a3b5a"/>';
  }
  if (expr === "proud") {
    return '<path d="M80 106 Q85 100 90 106 M110 106 Q115 100 120 106" fill="none" stroke="#2a3b5a" stroke-width="2.6" stroke-linecap="round"/>';
  }
  return '<g class="a-blink"><circle cx="85" cy="104" r="3" fill="#2a3b5a"/><circle cx="115" cy="104" r="3" fill="#2a3b5a"/></g>';
}

function mouth(expr: Expr): string {
  switch (expr) {
    case "surprised":
      return '<ellipse cx="100" cy="141" rx="5" ry="6" fill="#2a3b5a" fill-opacity="0.7"/>';
    case "worried":
      return '<path d="M92 143 Q100 137 108 143" fill="none" stroke="#2a3b5a" stroke-opacity="0.7" stroke-width="2.6" stroke-linecap="round"/>';
    case "proud":
      return '<path d="M90 138 Q100 148 110 138" fill="none" stroke="#2a3b5a" stroke-opacity="0.7" stroke-width="2.6" stroke-linecap="round"/>';
    default:
      return "";
  }
}

export function anselmoSvg(expr: Expr): string {
  return `<svg viewBox="20 36 160 184" width="100%" height="100%" aria-hidden="true">
  <g class="a-wisp">
    <path d="M50 220 Q46 178 70 160 Q100 150 130 160 Q154 178 150 220 Z" fill="#9cc0ff" fill-opacity="0.22"/>
    <path d="M62 214 Q58 176 82 164 Q100 158 118 164 Q142 176 138 214 Q124 200 112 214 Q100 198 88 214 Q76 200 62 214 Z" fill="#b9d2ff" fill-opacity="0.35"/>
    <path d="M76 196 Q100 186 124 196" fill="none" stroke="#dbe8ff" stroke-opacity="0.5" stroke-width="3" stroke-linecap="round"/>
  </g>
  <ellipse cx="100" cy="100" rx="40" ry="46" fill="#cfe0ff" fill-opacity="0.82"/>
  <path d="M60 84 Q62 52 100 50 Q138 52 140 84 Q120 72 100 72 Q80 72 60 84 Z" fill="#9cc0ff" fill-opacity="0.78"/>
  <rect x="64" y="74" width="72" height="8" rx="4" fill="#7fa6e8" fill-opacity="0.88"/>
  <path d="${BROWS[expr]}" fill="none" stroke="#f2f7ff" stroke-width="3" stroke-linecap="round"/>
  <circle cx="85" cy="104" r="10" fill="none" stroke="#f2f7ff" stroke-width="2.5"/>
  <circle cx="115" cy="104" r="10" fill="none" stroke="#f2f7ff" stroke-width="2.5"/>
  <line x1="95" y1="104" x2="105" y2="104" stroke="#f2f7ff" stroke-width="2.5"/>
  ${eyes(expr)}
  <path d="M68 128 Q72 160 100 170 Q128 160 132 128 Q116 138 100 134 Q84 138 68 128 Z" fill="#eef4ff" fill-opacity="0.72"/>
  ${mouth(expr)}
  <path d="M78 162 Q74 176 82 186 M100 170 Q98 184 104 194 M122 162 Q128 176 120 186" fill="none" stroke="#eef4ff" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round"/>
  <path d="M72 126 Q86 116 100 124 Q114 116 128 126 Q114 134 100 129 Q86 134 72 126 Z" fill="#ffffff" fill-opacity="0.88"/>
  <circle class="a-gear" cx="38" cy="66" r="10" fill="none" stroke="#ffd36b" stroke-opacity="0.8" stroke-width="5" stroke-dasharray="3 2.5"/>
  <circle class="a-gear rev" cx="164" cy="58" r="7" fill="none" stroke="#ffd36b" stroke-opacity="0.7" stroke-width="4" stroke-dasharray="2.5 2"/>
  <circle class="a-gear rev" cx="162" cy="150" r="11" fill="none" stroke="#ffd36b" stroke-opacity="0.6" stroke-width="5" stroke-dasharray="3.5 3"/>
  <circle class="a-gear" cx="36" cy="150" r="6" fill="none" stroke="#ffd36b" stroke-opacity="0.6" stroke-width="3.5" stroke-dasharray="2 2"/>
</svg>`;
}
