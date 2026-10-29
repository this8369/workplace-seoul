// Source IDs and row evidence are authoritative. Never match a renamed asset by
// fuzzy name, derive efficiency from NOC, or spread a complex ratio to its towers.
export function sourceEfficiencies(normalized, raw) {
  const table = (prefix) => {
    const t = normalized.find((t) => t.title.startsWith(prefix));
    if (!t) throw Error(`Missing normalized table ${prefix}`);
    return t.rows.map((r) =>
      Object.fromEntries(t.headers.map((h, i) => [h, r[i]])),
    );
  };
  const quarters = table("02");
  return table("01")
    .filter((r) => r["전용률"] != null)
    .map((r) => {
      const ratio = r["전용률"];
      const original = raw.tabs.operating[r["원본행"] - 1];
      if (
        r["자산구분"] !== "기성" ||
        !Number.isFinite(ratio) ||
        ratio <= 0 ||
        ratio > 1 ||
        original?.[24] !== ratio
      )
        throw Error(`Invalid source efficiency at row ${r["원본행"]}`);
      return {
        id: r["건물ID"],
        name: String(original[2]).trim(),
        pct: Number((ratio * 100).toFixed(4)),
        sourceUrl: r["원본링크"],
        sourcePeriod: r["원본기준월"],
        floorScoped: /저층|중층|고층|\d+\s*층\s*[~∼–-]/.test(original[2]),
        leases: quarters
          .filter((q) => q["건물ID"] === r["건물ID"])
          .map((q) => ({
            matchesRaw: (() => {
              const column = raw.tabs.operating[1].indexOf(q["기준분기"]);
              return (
                column >= 0 &&
                [
                  "보증금_원평",
                  "월임대료_원평",
                  "관리비_원평",
                  "렌트프리_개월년",
                  "공실률",
                  "NOC_원평",
                ].every((field, i) => {
                  const v = original[column + i];
                  return (
                    q[field] ===
                    (typeof v === "number" && Number.isFinite(v) ? v : null)
                  );
                })
              );
            })(),
            id: q["임대기록ID"],
            building_id: r["건물ID"],
            period: q["기준분기"],
            source_url: q["원본링크"],
            deposit: q["보증금_원평"],
            rent: q["월임대료_원평"],
            fee: q["관리비_원평"],
            noc: q["NOC_원평"],
            vacancy: q["공실률"],
            rent_free: q["렌트프리_개월년"],
          })),
      };
    });
}

export function leaseMatchesSource(lease, source) {
  return (
    lease != null &&
    source.matchesRaw === true &&
    lease.id === source.id &&
    lease.building_id === source.building_id &&
    lease.period === source.period &&
    lease.source_url === source.source_url &&
    lease.provider_code === "rsquare" &&
    lease.data_domain === "market_leasing" &&
    lease.currency_code === "KRW" &&
    lease.rate_area_unit === "pyeong" &&
    ["deposit", "rent", "fee", "noc", "vacancy", "rent_free"].every((k) =>
      lease[k] == null
        ? source[k] == null
        : source[k] != null && Number(lease[k]) === Number(source[k]),
    )
  );
}

export function wholeAssetEfficiency(source, building) {
  return (
    building != null &&
    building.id === source.id &&
    building.complex_scope !== "aggregate" &&
    !source.floorScoped
  );
}
