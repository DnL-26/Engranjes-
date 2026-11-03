const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/** 1234 → "1.23K"; por encima de los sufijos, notación científica. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  const a = Math.abs(n);
  if (a < 1000) {
    if (Number.isInteger(n)) return n.toString();
    return a < 10 ? n.toFixed(2) : a < 100 ? n.toFixed(1) : Math.floor(n).toString();
  }
  const exp = Math.floor(Math.log10(a) / 3);
  if (exp < SUFFIXES.length) {
    const v = n / 10 ** (exp * 3);
    const digits = Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0;
    return v.toFixed(digits) + SUFFIXES[exp];
  }
  return n.toExponential(2).replace("e+", "e");
}

/** Como `fmt`, pero las cantidades enteras pequeñas no llevan decimales. */
export function fmtInt(n: number): string {
  return Math.abs(n) < 1000 ? Math.floor(n).toString() : fmt(n);
}

/** Vueltas por segundo → texto en RPM, que suena más a máquina. */
export function fmtRpm(rps: number): string {
  return `${fmt(rps * 60)} RPM`;
}

export function fmtDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}
