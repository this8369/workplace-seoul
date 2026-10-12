import { createContext, useContext, useState, type ReactNode } from "react";
import { areaText, pricePerArea, type AreaUnit } from "../lib/area-unit";

const AreaUnitContext = createContext<{
  unit: AreaUnit;
  setUnit: (unit: AreaUnit) => void;
} | null>(null);

export function AreaUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnit] = useState<AreaUnit>("평");
  return (
    <AreaUnitContext.Provider value={{ unit, setUnit }}>
      {children}
    </AreaUnitContext.Provider>
  );
}

export function useAreaUnit() {
  const shared = useContext(AreaUnitContext);
  const [local, setLocal] = useState<AreaUnit>("평");
  const { unit, setUnit } = shared ?? { unit: local, setUnit: setLocal };
  return {
    unit,
    setUnit,
    formatArea: (
      value: number | null | undefined,
      from: AreaUnit = "m²",
      digits = 1,
    ) => areaText(value, from, unit, digits),
    perPyeong: (value: number | null | undefined) =>
      pricePerArea(value, "평", unit),
    areaField: (key: string, value: unknown) => {
      const from = key.endsWith("_m2")
        ? "m²"
        : key.endsWith("_pyeong")
          ? "평"
          : null;
      if (!from) return undefined;
      return areaText(
        value == null || value === "" ? null : Number(value),
        from,
        unit,
      );
    },
    areaLabel: (key: string, label: string) =>
      /_(m2|pyeong)$/.test(key)
        ? label.replace(/\s*\((평|㎡|m²)\)/g, "")
        : label,
    showAreaField: (key: string, record: Record<string, unknown>) => {
      const match = key.match(/_(m2|pyeong)$/);
      if (!match) return true;
      const other = key.replace(
        /_(m2|pyeong)$/,
        match[1] === "m2" ? "_pyeong" : "_m2",
      );
      if (!(other in record)) return true;
      const present = record[key] != null && record[key] !== "";
      const otherPresent = record[other] != null && record[other] !== "";
      if (present !== otherPresent) return present;
      return match[1] === (unit === "평" ? "pyeong" : "m2");
    },
  };
}
