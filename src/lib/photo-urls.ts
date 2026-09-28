import { supabase } from "./supabase";
import { publicSupabase } from "./public-supabase";
import { createSignedImageLoader } from "./signed-image-loader";
const cacheKey = `workplace-photo-urls-v1:${import.meta.env.VITE_SUPABASE_URL}`;
const signer = (isPublic: boolean) => async (paths: string[]) => {
  const client = isPublic ? publicSupabase : supabase;
  if (!client) throw new Error("not-configured");
  const { data, error } = await client.storage
    .from("building-images")
    .createSignedUrls(paths, 3600);
  if (error) throw error;
  return data;
};
const publicPhotos = createSignedImageLoader(signer(true), {
  read: () => JSON.parse(sessionStorage.getItem(cacheKey) || "{}"),
  write: (entries) => sessionStorage.setItem(cacheKey, JSON.stringify(entries)),
});
const privatePhotos = createSignedImageLoader(signer(false));
export const photoUrls = (approved: boolean) =>
  approved ? publicPhotos : privatePhotos;
