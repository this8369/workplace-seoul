import { regionForBuilding } from "./map-regions";
import { assetDetailClient as supabase } from "./asset-detail-client";
import { emptyCatalog, type Catalog, type Transaction } from "./catalog";
import type { Building } from "./domain";
import { masterRpc, type MasterRecord } from "./master-data";
import type { MemberAssetScope } from "./member-asset-scope";

// General detail uses the published projection without a member session.
export async function fetchTransactionDetail(id: string): Promise<Transaction> {
  if (!supabase) throw new Error("not-configured");
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Transaction;
}
// A direct link can identify a published component absent from the grouped list.
export async function fetchMemberBuilding(id: string): Promise<Building> {
  if (!supabase) throw new Error("not-configured");
  const { data, error } = await supabase
    .from("buildings")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw error || new Error("asset-unavailable");
  return {
    ...data,
    source_address: data.address,
    address: data.standard_address || data.address,
    region: regionForBuilding(data),
  };
}

type MasterCorrection = { asset: MasterRecord; edited_fields: string[] } | null;
function correctedBuilding(data: Building, master: MasterCorrection): Building {
  const building: Building = {
    ...data,
    source_address: data.address,
    address: data.standard_address || data.address,
  };
  // Canonical MY corrections are private. Anonymous list projections stay separately reviewed.
  if (master?.asset) {
    const a = master.asset;
    const edited = new Set(master.edited_fields);
    if (edited.has("name")) building.name = String(a.name);
    if (edited.has("address")) building.address = String(a.address ?? "");
    if (edited.has("gross_area_m2") && a.gross_area_m2 != null)
      building.gross_area_m2 = Number(a.gross_area_m2);
    if (edited.has("completion_year"))
      building.completion_year =
        a.completion_year == null ? null : Number(a.completion_year);
    if (edited.has("description"))
      building.overview = a.description == null ? null : String(a.description);
    if (edited.has("latitude"))
      building.latitude = a.latitude == null ? null : Number(a.latitude);
    if (edited.has("longitude"))
      building.longitude = a.longitude == null ? null : Number(a.longitude);
    if (
      edited.has("lifecycle_status") &&
      (a.lifecycle_status === "operating" ||
        a.lifecycle_status === "development")
    )
      building.status = a.lifecycle_status;
  }
  return building;
}
function masterCorrection(id: string, enabled: boolean) {
  // Never memoize authenticated corrections in the public complex scope.
  return enabled
    ? masterRpc<MasterCorrection>("master_asset_corrections", {
        building_key: id,
      })
    : Promise.resolve(null);
}
async function publicBuilding(
  id: string,
  scope?: MemberAssetScope,
): Promise<Building> {
  const seed = scope?.members.find((b) => b.id === id);
  if (seed) return seed;
  const load = async () => {
    if (!supabase) throw new Error("not-configured");
    const { data, error } = await supabase
      .from("buildings")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) throw error || new Error("asset-unavailable");
    return data as Building;
  };
  return scope ? scope.read(`building:${id}`, load) : load();
}
export async function fetchMemberAsset(
  id: string,
  includeTransactions: boolean,
  includeShared = true,
  memberCorrections = false,
  scope?: MemberAssetScope,
): Promise<Catalog> {
  if (!supabase) throw new Error("not-configured");
  async function rows(
    table: string,
    filter: (query: any) => any,
    key = `${table}:${id}`,
  ) {
    const load = async () => {
      const all: any[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await filter(supabase!.from(table).select("*"))
          .order("id")
          .range(from, from + 499);
        if (error) throw error;
        all.push(...data);
        if (data.length < 500) return all;
      }
    };
    const result = await (scope ? scope.read(key, load) : load());
    return [...result];
  }
  const forAsset = (q: any) => q.eq("building_id", id);
  // Start independent archive reads immediately, before the building or private
  // correction round trip completes. Related assets load alongside these reads.
  const buildingRead = publicBuilding(id, scope);
  const masterRead = masterCorrection(id, memberCorrections);
  const occupanciesRead = rows("occupancies", forAsset);
  const companiesRead = occupanciesRead.then((occupancies) => {
    const ids = [...new Set(occupancies.map((o) => o.company_id))].sort();
    return ids.length
      ? rows("companies", (q) => q.in("id", ids), `companies:${ids.join(",")}`)
      : [];
  });
  const ownRead = Promise.all([
    rows("building_images", (q) => forAsset(q).eq("review_status", "approved")),
    rows("leasing_quarters", forAsset),
    rows("development_records", forAsset),
    occupanciesRead,
    rows("tenant_movements", (q) =>
      q.or(`from_building_id.eq.${id},to_building_id.eq.${id}`),
    ),
    includeTransactions ? rows("transactions", forAsset) : Promise.resolve([]),
    companiesRead,
  ]);
  const relatedRead = buildingRead.then(async (building) => {
    const towersRead = building.complex_id
      ? scope?.complex.id === building.complex_id
        ? Promise.resolve([...scope.towers])
        : rows(
            "building_towers",
            (q) => q.eq("complex_id", building.complex_id),
            `towers:${building.complex_id}`,
          )
      : Promise.resolve([]);
    const complexRead =
      includeShared && building.complex_id
        ? scope?.complex.id === building.complex_id
          ? Promise.resolve(scope.complex)
          : rows(
              "building_complexes",
              (q) => q.eq("id", building.complex_id).eq("published", true),
              `complex:${building.complex_id}`,
            ).then((rows) => rows[0])
        : Promise.resolve(undefined);
    const parentId = building.component_source_building_id;
    const sharedRead =
      includeShared && parentId && parentId !== id
        ? fetchMemberAsset(
            parentId,
            includeTransactions,
            false,
            memberCorrections,
            scope,
          )
        : Promise.resolve(undefined);
    const overviewRead = complexRead.then(async (complex) => {
      const overviewId = complex?.representative_building_id;
      if (!overviewId || overviewId === id) return undefined;
      if (overviewId === parentId) return sharedRead;
      // The common overview needs the representative's building identity only,
      // not a second download of its photos, leases, tenants and transactions.
      const [record, master] = await Promise.all([
        publicBuilding(overviewId, scope),
        masterCorrection(overviewId, memberCorrections),
      ]);
      return {
        ...emptyCatalog,
        buildings: [correctedBuilding(record, master)],
        review: true,
      };
    });
    const [towers, overviewComplex, sharedAsset, overviewAsset] =
      await Promise.all([towersRead, complexRead, sharedRead, overviewRead]);
    return { towers, overviewComplex, sharedAsset, overviewAsset };
  });
  const [record, master, own, related] = await Promise.all([
    buildingRead,
    masterRead,
    ownRead,
    relatedRead,
  ]);
  const [
    images,
    leasing,
    developments,
    occupancies,
    movements,
    transactions,
    companies,
  ] = own;
  return {
    ...emptyCatalog,
    ...related,
    buildings: [correctedBuilding(record, master)],
    images,
    leasing,
    developments,
    occupancies,
    movements,
    transactions,
    companies,
    review: true,
  };
}
