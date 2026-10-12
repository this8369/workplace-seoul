import { supabase } from "./supabase";
import { emptyCatalog, type Catalog, type Transaction } from "./catalog";
import type { Building } from "./domain";

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
): Promise<Catalog> {
  if (!supabase) throw new Error("not-configured");
  const { data, error } = await supabase
    .from("buildings")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const building: Building = {
    ...data,
    source_address: data.address,
    address: data.standard_address || data.address,
  };
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
  return {
    ...emptyCatalog,
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
