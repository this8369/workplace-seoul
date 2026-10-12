import { writeFile } from "node:fs/promises";
import { connectDatabase } from "../building-register/vworld-client.mjs";
const db = await connectDatabase(),
  apply = process.argv.includes("--apply");
try {
  await db.query("begin");
  await db.query(
    "select set_config('app.master_origin','official_source_enrichment',true),set_config('app.master_reason','Fill missing IGIS building fields from verified official register; preserve non-null MY and source values',true)",
  );
  const updated = await db.query(`with matched as (
 select l.building_id,min(r.id::text)::uuid record_id from building_register_links l join building_register_records r on r.id=l.record_id
 join private.igis_catalog_publications i on i.building_id=l.building_id
 where l.status='verified' and r.is_current group by l.building_id having count(*)=1)
 update buildings b set gross_area_m2=coalesce(b.gross_area_m2,nullif(r.gross_area_m2,0)),
 floors_above=coalesce(b.floors_above,r.floors_above::int),floors_below=coalesce(b.floors_below,r.floors_below::int),
 parking_spaces=coalesce(b.parking_spaces,r.parking_total::int),completion_year=coalesce(b.completion_year,extract(year from r.approval_date)::int),
 usage_approved_on=coalesce(b.usage_approved_on,r.approval_date),updated_at=now()
 from matched m join building_register_records r on r.id=m.record_id
 where b.id=m.building_id and b.status='operating' and b.source_name='IGIS 원본 자산 명부'
 and (b.gross_area_m2 is null and r.gross_area_m2>0 or b.floors_above is null and r.floors_above is not null or b.floors_below is null and r.floors_below is not null or b.parking_spaces is null and r.parking_total is not null or b.completion_year is null and r.approval_date is not null or b.usage_approved_on is null and r.approval_date is not null)`);
  await db.query(`update private.master_assets a set gross_area_m2=coalesce(a.gross_area_m2,b.gross_area_m2),completion_year=coalesce(a.completion_year,b.completion_year)
 from buildings b join private.igis_catalog_publications i on i.building_id=b.id
 where a.existing_building_id=b.id and (a.gross_area_m2 is null and b.gross_area_m2 is not null or a.completion_year is null and b.completion_year is not null)`);
  const boundaries = await db.query(
    `insert into private.catalog_publications(record_type,record_id) select 'building_parcels',p.id from building_parcels p join private.igis_catalog_publications i on i.building_id=p.building_id where p.verified and p.geometry is not null on conflict do nothing`,
  );
  const counts = (
    await db.query(`select count(*)::int assets,count(*) filter(where b.gross_area_m2*121<4000000)::int below_threshold,
 count(*) filter(where b.latitude is not null)::int located,
 count(*) filter(where exists(select 1 from building_register_links l where l.building_id=b.id and l.status='verified'))::int register_assets,
 count(*) filter(where exists(select 1 from building_parcels p where p.building_id=b.id and p.verified and p.geometry is not null))::int boundary_assets,
 count(*) filter(where exists(select 1 from building_parcels p where p.building_id=b.id and p.official_prices<>'[]'::jsonb))::int land_price_assets,
 count(*) filter(where exists(select 1 from building_places p where p.building_id=b.id))::int nearby_assets
 from catalog_buildings b where b.is_igis`)
  ).rows[0];
  const security = (
    await db.query(`select (select count(*)::int from catalog_buildings where is_igis) public_assets,
 has_table_privilege('anon','public.buildings','SELECT') raw_buildings_read,
 has_table_privilege('anon','private.master_investment_objects','SELECT') internal_read,
 has_function_privilege('anon','public.master_asset_context(uuid)','EXECUTE') internal_rpc,
 has_function_privilege('anon','public.has_workplace_permission(text)','EXECUTE') member_permission_rpc`)
  ).rows[0];
  if (
    security.raw_buildings_read ||
    security.internal_read ||
    security.internal_rpc ||
    security.member_permission_rpc
  )
    throw Error("Public boundary check failed");
  await db.query("set local role anon");
  const visible = (await db.query("select count(*)::int total from catalog_buildings where is_igis")).rows[0].total;
  if (visible !== counts.assets) throw Error("Anonymous projection differs");
  await db.query("reset role");
  await db.query(apply ? "commit" : "rollback");
  const receipt = {
    applied: apply,
    official_fields_filled: updated.rowCount,
    outlines_published: boundaries.rowCount,
    counts,
    security,
  };
  await writeFile(
    "data/private/igis-master-20261006/enrichment-receipt.json",
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(receipt));
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
