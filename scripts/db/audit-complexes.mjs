import {connectDatabase} from '../building-register/vworld-client.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const db=await connectDatabase();
try {
 const buildings=(await db.query('select * from public.buildings order by name')).rows;
 const complexes=(await db.query('select * from public.building_complexes order by name')).rows;
 const towers=(await db.query('select * from public.building_towers order by complex_id,sort_order')).rows;
 const registers=(await db.query(`select r.*,array_agg(distinct l.building_id) building_ids from public.building_register_records r join public.building_register_links l on l.record_id=r.id and l.status='verified' where r.is_current group by r.id order by r.parcel_key,r.record_kind,r.dong_name`)).rows;
 const master=(await db.query('select id,name,existing_building_id from private.master_assets order by name')).rows;
 const profiles=(await db.query('select * from public.building_asset_profiles')).rows;
 const power=(await db.query('select * from public.building_power_specs')).rows;
 const snapshot={buildings,complexes,towers,registers,master,profiles,power};
 await mkdir('data/private/complexes',{recursive:true});await writeFile('data/private/complexes/inventory.json',JSON.stringify(snapshot,null,2));
 const groups=Object.groupBy(buildings,b=>(b.road_address||b.address).replace(/서울특별시|서울시/g,'서울').replace(/\s+/g,''));
 console.log(JSON.stringify({counts:Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,v.length])),complexes:complexes.map(c=>({name:c.name,id:c.id,representative:c.representative_building_id,area:c.gross_area_m2,members:buildings.filter(b=>b.complex_id===c.id).map(b=>({id:b.id,name:b.name})),towers:towers.filter(t=>t.complex_id===c.id).map(t=>({id:t.id,name:t.label,building_id:t.building_id}))})),sharedAddresses:Object.values(groups).filter(g=>g.length>1).map(g=>g.map(b=>({id:b.id,name:b.name,address:b.address,complex_id:b.complex_id}))),multiRegisters:buildings.flatMap(b=>{const rr=registers.filter(r=>r.building_ids.includes(b.id)&&r.record_kind==='building'&&r.main_annex_code==='0');return rr.length>1?[{id:b.id,name:b.name,records:rr.map(r=>({id:r.id,name:r.building_name,dong:r.dong_name,use:r.main_use,area:r.gross_area_m2}))}]:[]}),nameCandidates:buildings.filter(b=>/타워[123AB]|[ABC123]동|남측|북측|이오타|IFC|East|West|트윈|Twin|타워팰리스|파크원|센터필드|센터원|그랑서울|[1-9]관|[동서]관|[1-9]차|[12]빌딩/i.test(b.name)).map(b=>({id:b.id,name:b.name,address:b.address,complex_id:b.complex_id}))},null,2));
} finally{await db.end();}
