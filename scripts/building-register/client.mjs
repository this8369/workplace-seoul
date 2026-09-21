import { readFile } from "node:fs/promises";
export const ENDPOINT = "https://apis.data.go.kr/1613000/BldRgstHubService";
export const OPERATIONS = [
  "getBrTitleInfo",
  "getBrRecapTitleInfo",
  "getBrBasisOulnInfo",
  "getBrFlrOulnInfo",
  "getBrExposPubuseAreaInfo",
  "getBrAtchJibunInfo",
  "getBrJijiguInfo",
  "getBrWclfInfo",
];
export function validateParcel(parcel) {
  for (const [key, pattern] of Object.entries({
    sigunguCd: /^\d{5}$/,
    bjdongCd: /^\d{5}$/,
    platGbCd: /^[012]$/,
    bun: /^\d{4}$/,
    ji: /^\d{4}$/,
  }))
    if (!pattern.test(parcel[key] || ""))
      throw new Error(`Invalid parcel ${key}`);
  return Object.fromEntries(
    ["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"].map((k) => [
      k,
      parcel[k],
    ]),
  );
}
export async function fetchRegister(
  operation,
  parcel,
  { serviceKey, fetchImpl = fetch, delayMs = 300 } = {},
) {
  if (!OPERATIONS.includes(operation))
    throw new Error("Unsupported register operation");
  const query = validateParcel(parcel);
  const key =
    serviceKey ||
    process.env.BUILDING_REGISTER_SERVICE_KEY ||
    (await readFile("data/private/building-register-key", "utf8")).trim();
  if (!key) throw new Error("Building register key is not configured");
  const pages = [];
  const items = [];
  for (let page = 1; page <= 1000; page++) {
    if (page > 1) await new Promise((r) => setTimeout(r, delayMs));
    const url = new URL(`${ENDPOINT}/${operation}`);
    url.search = new URLSearchParams({
      ...query,
      serviceKey: key,
      _type: "json",
      numOfRows: "100",
      pageNo: String(page),
    }).toString();
    let response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(30000),
        redirect: "error",
      });
    } catch {
      throw new Error(
        "Building register network request failed (credentials omitted)",
      );
    }
    if (!response.ok)
      throw new Error(`Building register HTTP ${response.status}`);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const code = text.match(/<(?:returnReasonCode|resultCode)>([^<]*)</)?.[1];
      throw new Error(
        `Building register non-JSON response${code ? `, code ${code.replace(/[^a-zA-Z0-9_]/g, "")}` : ""} (credentials omitted)`,
      );
    }
    const payload = data.response ?? data;
    const code = String(payload.header?.resultCode ?? "missing");
    if (code !== "00" && code !== "0")
      throw new Error(
        `Building register API code ${code.replace(/[^a-zA-Z0-9_]/g, "")}`,
      );
    const body = payload.body;
    if (
      !body ||
      !Number.isInteger(Number(body.totalCount)) ||
      Number(body.totalCount) < 0
    )
      throw new Error("Invalid register response body");
    const batch = body.items?.item;
    const rows = Array.isArray(batch)
      ? batch
      : batch && typeof batch === "object"
        ? [batch]
        : [];
    pages.push(data);
    items.push(...rows);
    if (items.length >= Number(body.totalCount))
      return {
        operation,
        query,
        pages,
        items,
        collected_at: new Date().toISOString(),
      };
    if (!rows.length)
      throw new Error("Incomplete building register pagination");
  }
  throw new Error("Building register pagination limit exceeded");
}
