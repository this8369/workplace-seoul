// Download explicitly selected public source images into the private review queue.
// A source page and a visual review are retained separately from publication.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='data/private/images/research';
await mkdir(root,{recursive:true});
if(process.argv.includes('--pages')){
 const pages=JSON.parse(await readFile('data/private/images/research-pages.json','utf8'));
 for(const page of pages){
  try{
   const response=await fetch(page.url,{signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(`http-${response.status}`);
   const html=await response.text();
   await writeFile(`${root}/page-${page.n}.html`,html);
   const images=[...html.matchAll(/<img\b[^>]*>|<meta\b[^>]*og:image[^>]*>/gi)].map(x=>x[0]);
   console.log(JSON.stringify({n:page.n,images:images.filter(x=>!/(logo|icon|banner)/i.test(x)).slice(0,30)}));
  }catch(e){console.log(JSON.stringify({n:page.n,error:e.message}));}
  await new Promise(r=>setTimeout(r,500));
 }
 process.exit(0);
}
const plan=JSON.parse(await readFile('data/private/images/research-plan.json','utf8'));
const results=JSON.parse(await readFile(`${root}/downloads.json`,'utf8').catch(()=> '[]'));
const blocked=new Set();
for(const item of plan){
 if(results.some(r=>r.building_id===item.building_id&&r.source_image_url===item.source_image_url&&r.file))continue;
 const url=new URL(item.source_image_url);if(!['https:','http:'].includes(url.protocol)||blocked.has(url.host))continue;
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if([401,403,429].includes(response.status)){blocked.add(url.host);throw Error(`access-${response.status}`);}
  if(!response.ok)throw Error(`http-${response.status}`);
  if(!response.headers.get('content-type')?.startsWith('image/'))throw Error('not-image');
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>20000000)throw Error('image-too-large');
  const sha=createHash('sha256').update(bytes).digest('hex');
  const file=`${root}/${item.building_id}-${sha.slice(0,10)}.source`;
  await writeFile(file,bytes);
  results.push({...item,file,sha,bytes:bytes.length,collected_at:new Date().toISOString()});
  console.log('Downloaded '+item.name);
 }catch(e){console.log('Unavailable '+item.name+': '+e.message);}
 await writeFile(`${root}/downloads.json`,JSON.stringify(results,null,2));
 await new Promise(r=>setTimeout(r,450));
}
console.log(JSON.stringify({downloaded:results.length,planned:plan.length,blockedHosts:[...blocked]}));
