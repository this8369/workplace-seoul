import pg from 'pg';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const {reviewerEmail,...config}=JSON.parse(await readFile('data/private/db-config.json','utf8'));
const db=new pg.Client({...config,password:(await readFile('data/private/db-password','utf8')).trim(),ssl:{rejectUnauthorized:true,ca:await readFile('data/private/supabase-ca.crt','utf8')},connectionTimeoutMillis:15000});
await db.connect();
try {
 const rows=(await db.query(`select b.id,b.name,b.address,b.standard_address,b.road_address,b.latitude,b.longitude,b.status,b.gross_area_m2,
 (select count(*)::int from building_images i where i.building_id=b.id and i.is_primary and i.review_status='approved' and i.thumbnail_path is not null) photo_count
 from buildings b order by b.gross_area_m2 desc`)).rows;
 await mkdir('data/private/images',{recursive:true});
 await writeFile('data/private/images/inventory.json',JSON.stringify(rows,null,2));
 const missing=rows.filter(b=>!b.photo_count);
 await writeFile('data/private/images/missing.json',JSON.stringify(missing,null,2));
 console.log(JSON.stringify({total:rows.length,withPhoto:rows.length-missing.length,missing:missing.length,operating:missing.filter(b=>b.status==='operating').length,development:missing.filter(b=>b.status!=='operating').length}));
 console.log(missing.map((b,i)=>`${i+1}\t${b.status}\t${b.name}\t${b.road_address||b.standard_address||b.address}`).join('\n'));
} finally {await db.end();}
