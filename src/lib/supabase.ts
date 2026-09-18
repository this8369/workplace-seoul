import {createClient} from '@supabase/supabase-js';
import type {Building} from './domain';
const url=import.meta.env.VITE_SUPABASE_URL, key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase=url && key ? createClient(url,key) : null;
export async function fetchBuildings():Promise<Building[]> {
 if(!supabase) throw new Error('not-configured');
 const rows:Building[]=[];
 for(let from=0;;from+=500) {
  const {data,error}=await supabase.from('buildings').select('id,name,address,region,status,gross_area_m2,area_basis,latitude,longitude,overview,floors_above,floors_below,completion_year,parking_spaces,source_name,source_url,verified_on').order('id').range(from,from+499);
  if(error) throw error;
  rows.push(...data as Building[]); if(data.length<500) break;
 }
 return rows;
}
