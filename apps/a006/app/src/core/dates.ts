/** Tiny date helpers (explicit inputs, no hidden clock). */
export type DateKey = string; // YYYY-MM-DD

export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n, 12); // noon avoids DST edges
  const p = (v: number) => String(v).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function year(key: DateKey): number {
  return Number(key.slice(0, 4));
}
