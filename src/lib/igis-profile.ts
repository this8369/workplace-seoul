// Reuse IGIS's published employee portrait assets and file naming convention.
export function igisProfileImage(name: string) {
  const clean = name.split("(")[0].trim();
  const extension = ["김현진", "남민호"].includes(clean) ? "png" : "webp";
  return clean
    ? `https://iotaseoul.cloud/${encodeURIComponent(clean)}.${extension}`
    : "";
}

export function igisStaffTitle(name: string) {
  const titles: Record<string, string> = {
    이철승: "부문대표",
    윤관식: "부대표",
    정조민: "부대표",
    우형석: "그룹장",
    권술일: "파트장",
    권순일: "파트장",
    강순용: "파트장",
    윤주형: "Sr.Manager",
    한찬호: "Sr.Manager",
    박준호: "센터장",
    강석민: "Sr.Manager",
    정리훈: "Sr.Manager",
    홍장군: "센터장",
    채원: "담당",
    김대익: "마스터",
    장성진: "마스터",
    김보성: "마스터",
    박봉서: "전문위원",
    이정훈: "담당",
    김민지: "Sr.Manager",
    김현수: "센터장",
    이가현: "리더",
    이시정: "리더",
    현철호: "그룹장",
    홍창의: "파트장",
    신민호: "Sr.Manager",
    김행단: "그룹장",
    윤용택: "Sr.Manager",
  };
  return name ? titles[name] || "\uB9E4\uB2C8\uC800" : "";
}
