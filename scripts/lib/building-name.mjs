// Rental floor strata are not asset identities. Physical tower labels survive.
export function normalizeBuildingName(value) {
  if (value == null) return value;
  return String(value)
    .replace(/[<(\[（]\s*[0-9]+층\s*[~∼–-]\s*[0-9]+층\s*[>)\]）]/g, "")
    .replace(
      /(?:초고|저|중|고)층(?:부)?[0-9]*(?:\s+[0-9]+층\s*[~∼–-]\s*[0-9]+층)?/g,
      "",
    )
    .replace(/<\s*>|\(\s*\)|\[\s*\]|（\s*）/g, "")
    .replace(/([<([（])\s+/g, "$1")
    .replace(/\s+([>)\]）])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
