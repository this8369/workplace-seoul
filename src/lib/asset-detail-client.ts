import { publicSupabase } from "./public-supabase";
// These read-only projections expose published physical/market information.
// Private master/operations RPCs and authenticated writes use their original client.
const tables = new Set([
  "buildings",
  "building_complexes",
  "building_towers",
  "building_images",
  "leasing_quarters",
  "development_records",
  "occupancies",
  "tenant_movements",
  "companies",
  "transactions",
  "transaction_assets",
  "building_asset_profiles",
  "building_power_specs",
  "asset_certification_options",
  "building_facts",
  "building_parcels",
  "building_places",
  "building_green_spaces",
  "building_register_links",
  "building_register_records",
  "building_register_floors",
  "building_register_area_parts",
  "building_register_sections",
]);
export const assetDetailClient = publicSupabase
  ? {
      from(table: string) {
        if (!tables.has(table)) throw Error("unsupported-public-detail-table");
        return publicSupabase!.from(`detail_${table}`);
      },
    }
  : null;
