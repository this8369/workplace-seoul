import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('sheet ingestion is private, reviewed, idempotent and revisioned',async()=>{
 const db=new PGlite();
 try{
 await db.exec('create role anon; create role authenticated; create role service_role; create schema private;');
 await db.exec(await readFile(new URL('../migrations/202609180002_sheet_ingestion.sql',import.meta.url),'utf8'));
 const id='10000000-0000-0000-0000-000000000001';
 const record={id,payload:{'건물명':'합성 테스트','검수상태':'검수완료','반영요청':'요청'}};
 const call=(rows)=>db.query('select public.record_sheet_batch($1,$2,$3::jsonb)', ['synthetic-source','buildings',JSON.stringify(rows)]);
 await db.exec('set role anon');await assert.rejects(()=>call([record]),/permission denied/);
 await db.exec('reset role; set role authenticated');await assert.rejects(()=>call([record]),/permission denied/);
 await db.exec('reset role; set role service_role');
 await call([record]);await call([record]);
 await assert.rejects(()=>call([record,record]),/duplicate id/);
 await assert.rejects(()=>call([{id,payload:{'검수상태':'미검수'}}]),/reviewed/);
 await call([{...record,payload:{...record.payload,'건물명':'합성 변경'}}]);
 await db.exec('reset role');
 assert.equal((await db.query('select revision from private.sheet_records')).rows[0].revision,2);
 assert.equal((await db.query('select count(*)::int as n from private.sheet_record_history')).rows[0].n,2);
 }finally{await db.close();}
});
