import { supabase } from "./supabase";
import { emptyCatalog, type Catalog, type Transaction } from "./catalog";
import type { Building } from "./domain";
import { masterRpc, type MasterRecord } from "./master-data";

// These requests always use the member session. Database RLS is authoritative.
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
export async function fetchMemberAsset(
  id: string,
  includeTransactions: boolean,
  includeShared = true,
): Promise<Catalog> {
  if (!supabase) throw new Error("not-configured");
  const [{ data, error }, master] = await Promise.all([
    supabase.from("buildings").select("*").eq("id", id).single(),
    masterRpc<{ asset: MasterRecord; edited_fields: string[] } | null>(
      "master_asset_corrections",
      { building_key: id },
    ),
  ]);
  if (error) throw error;
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
  async function rows(table: string, filter: (query: any) => any) {
    const all: any[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await filter(supabase!.from(table).select("*"))
        .order("id")
        .range(from, from + 499);
      if (error) throw error;
      all.push(...data);
      if (data.length < 500) return all;
    }
  }
  const forAsset = (q: any) => q.eq("building_id", id);
  const [
    images,
    leasing,
    developments,
    occupancies,
    movements,
    transactions,
    towers,
  ] = await Promise.all([
    rows("building_images", (q) => forAsset(q).eq("review_status", "approved")),
    rows("leasing_quarters", forAsset),
    rows("development_records", forAsset),
    rows("occupancies", forAsset),
    rows("tenant_movements", (q) =>
      q.or(`from_building_id.eq.${id},to_building_id.eq.${id}`),
    ),
    includeTransactions ? rows("transactions", forAsset) : Promise.resolve([]),
    building.complex_id
      ? rows("building_towers", (q) => q.eq("complex_id", building.complex_id))
      : Promise.resolve([]),
  ]);
  const companyIds = [...new Set(occupancies.map((o) => o.company_id))];
  const companies = companyIds.length
    ? await rows("companies", (q) => q.in("id", companyIds))
    : [];
  const sharedAsset =
    includeShared &&
    building.component_source_building_id &&
    building.component_source_building_id !== id
      ? await fetchMemberAsset(
          building.component_source_building_id,
          includeTransactions,
          false,
        )
      : undefined;
  return {
    ...emptyCatalog,
    sharedAsset,
    buildings: [building],
    images,
    leasing,
    developments,
    occupancies,
    movements,
    transactions,
    towers,
    companies,
    review: true,
  };
}
