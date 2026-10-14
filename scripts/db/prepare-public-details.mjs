import { writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase();
const asset = "public.is_public_detail_asset(r.building_id)";
const approved = (t) =>
  `(r.published or exists(select 1 from private.catalog_publications p where p.record_type='${t}' and p.record_id=r.id))`;
const definitions = [
  [
    "buildings",
    "r.status in ('operating','development') and public.is_public_detail_asset(r.id)",
  ],
  [
    "building_complexes",
    "r.published and public.is_public_detail_asset(r.representative_building_id)",
  ],
  [
    "building_towers",
    "exists(select 1 from public.detail_building_complexes c where c.id=r.complex_id)",
  ],
  ["building_images", `${asset} and r.review_status='approved'`],
  [
    "leasing_quarters",
    `${asset} and r.data_domain='market_leasing' and ${approved("leasing_quarters")}`,
  ],
  ["development_records", `${asset} and ${approved("development_records")}`],
  ["occupancies", `${asset} and r.published`],
  [
    "tenant_movements",
    "r.published and r.link_status='verified' and (public.is_public_detail_asset(r.from_building_id) or public.is_public_detail_asset(r.to_building_id))",
  ],
  [
    "companies",
    "r.published or exists(select 1 from public.detail_occupancies o where o.company_id=r.id)",
  ],
  [
    "transactions",
    `${approved("transactions")} and (r.building_id is null or ${asset})`,
  ],
  [
    "transaction_assets",
    `${asset} and exists(select 1 from public.detail_transactions t where t.id=r.transaction_id)`,
  ],
  ["building_asset_profiles", asset],
  ["building_power_specs", asset],
  ["asset_certification_options", "true"],
  ["building_facts", `${asset} and r.published`],
  ["building_parcels", `${asset} and r.verified`],
  ["building_places", `${asset} and r.verified`],
  ["building_green_spaces", asset],
  ["building_register_links", `${asset} and r.status='verified'`],
  [
    "building_register_records",
    "r.is_current and exists(select 1 from public.detail_building_register_links l where l.record_id=r.id)",
  ],
  ...[
    "building_register_floors",
    "building_register_area_parts",
    "building_register_sections",
  ].map((t) => [
    t,
    "exists(select 1 from public.detail_building_register_records b where b.id=r.record_id)",
  ]),
];
const excluded = new Set([
  "snapshot_id",
  "source_row_id",
  "source_snapshot_id",
  "evidence",
  "reviewed_by",
  "reviewed_at",
  "review_note",
  "rights_note",
  "source_image_url",
  "created_at",
  "updated_at",
  "source_note",
  "reviewer_id",
  "updated_by",
  "uploaded_by",
  "provider_confirmation",
  "content_hash",
  "address_provider",
  "address_checked_at",
]);
try {
  let sql = `begin;
-- Public asset detail is an explicit read-only physical/market projection.
-- Raw tables, private masters, leases and operations keep their existing grants/RLS.
create function public.is_public_detail_asset(asset_key uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.catalog_buildings b where b.id=asset_key)
 or exists(select 1 from public.building_towers t join public.buildings b on b.id=t.building_id
   join public.building_complexes c on c.id=t.complex_id
   join public.catalog_buildings p on p.id=c.representative_building_id
   where t.building_id=asset_key and t.parent_tower_id is null and t.component_kind<>'facility'
   and t.published and c.published and b.status in ('operating','development'))
$$;
revoke all on function public.is_public_detail_asset(uuid) from public,anon,authenticated;
grant execute on function public.is_public_detail_asset(uuid) to anon,authenticated;

-- Only direct IGIS publication or a generated component of that approved
-- aggregate inherits the relationship. A complex/sibling is never sufficient.
create function public.public_detail_igis_source(asset_key uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select i.building_id from private.igis_catalog_publications i
 where public.is_public_detail_asset(asset_key) and (
  i.building_id=asset_key or exists(
   select 1 from private.complex_component_assets m
   join public.buildings parent on parent.id=m.parent_building_id
   where m.building_id=asset_key and m.parent_building_id=i.building_id
   and parent.complex_scope='aggregate'
  )) order by (i.building_id=asset_key) desc limit 1
$$;
revoke all on function public.public_detail_igis_source(uuid) from public,anon,authenticated;
grant execute on function public.public_detail_igis_source(uuid) to anon,authenticated;
`;
  for (const [table, predicate] of definitions) {
    const columns = (
      await db.query(
        "select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
        [table],
      )
    ).rows
      .map((r) => r.column_name)
      .filter((c) => !excluded.has(c));
    if (!columns.length) throw Error("missing " + table);
    const fields = columns.map((c) => {
      if (c === "component_source_building_id")
        return `case when public.is_public_detail_asset(r.${c}) then r.${c} end as ${c}`;
      return `r.${c}`;
    });
    if (table === "buildings")
      fields.push(
        "(public.public_detail_igis_source(r.id) is not null) as is_igis",
        "public.public_detail_igis_source(r.id) as igis_source_building_id",
        "coalesce((select i.asset_category from private.igis_catalog_publications i where i.building_id=public.public_detail_igis_source(r.id)),'office') as asset_category",
        "coalesce((select c.is_mixed_use from public.catalog_buildings c where c.id=public.public_detail_igis_source(r.id)),false) as is_mixed_use",
      );
    // Inline the invoker-only park view so its underlying permissions are checked
    // as this projection's owner, without opening the original physical tables.
    const source =
      table === "building_green_spaces"
        ? `(${(await db.query("select pg_get_viewdef('public.building_green_spaces'::regclass,true) definition")).rows[0].definition.trim().replace(/;$/, "")})`
        : `public.${table}`;
    sql += `\ncreate view public.detail_${table} with(security_barrier=true) as\n select ${fields.join(",")}\n from ${source} r where ${predicate};\nrevoke all on public.detail_${table} from public,anon,authenticated;\ngrant select on public.detail_${table} to anon,authenticated;\n`;
  }
  sql += `\ncreate function public.is_public_detail_image(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.detail_building_images i where i.object_path=object_name or i.thumbnail_path=object_name)
$$;
revoke all on function public.is_public_detail_image(text) from public,anon,authenticated;
grant execute on function public.is_public_detail_image(text) to anon,authenticated;
alter policy building_images_storage_public_read on storage.objects using(
 bucket_id='building-images' and (public.is_catalog_thumbnail(name) or public.is_public_detail_image(name))
);
alter policy catalog_storage_anon_gate on storage.objects using(
 bucket_id<>'building-images' or public.is_catalog_thumbnail(name) or public.is_public_detail_image(name)
);
alter policy catalog_storage_member_gate on storage.objects using(
 bucket_id<>'building-images' or public.is_catalog_thumbnail(name) or public.is_public_detail_image(name) or (select public.has_workplace_permission('details.read'))
);
update private.platform_data_domains set access_boundary='public_published_detail' where key in ('market_leasing','market_transaction','physical_registry');
notify pgrst,'reload schema';
commit;\n`;
  await writeFile(
    "supabase/migrations/202610140001_public_asset_details.sql",
    sql,
  );
  console.log(
    JSON.stringify({
      views: definitions.length,
      rawGrantsUnchanged: true,
      privateDataExcluded: true,
    }),
  );
} finally {
  await db.end();
}
