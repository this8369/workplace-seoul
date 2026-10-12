export type AreaUnit = "평" | "m²";
export const M2_PER_PYEONG = 400 / 121;

export function convertArea(value: number, from: AreaUnit, to: AreaUnit) {
  return from === to
    ? value
    : to === "평"
      ? value / M2_PER_PYEONG
      : value * M2_PER_PYEONG;
}

export function areaText(
  value: number | null | undefined,
  from: AreaUnit,
  to: AreaUnit,
  digits = 1,
) {
  if (value == null || !Number.isFinite(value)) return "미확인";
  return `${convertArea(value, from, to).toLocaleString("ko-KR", { maximumFractionDigits: digits })}${to}`;
}

export function pricePerArea(
  value: number | null | undefined,
  from: AreaUnit,
  to: AreaUnit,
) {
  return value == null ? null : value / convertArea(1, from, to);
}
