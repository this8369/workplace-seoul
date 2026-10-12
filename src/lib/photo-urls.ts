import { supabase } from "./supabase";
import { publicSupabase } from "./public-supabase";
import { createSignedImageLoader } from "./signed-image-loader";
const cacheKey = `workplace-photo-urls-v2:${import.meta.env.VITE_SUPABASE_URL}`;
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
let generation = 0;
const privateObjectUrls = new Set<string>();
function memberPhotos() {
  return createSignedImageLoader(async (paths) => {
    const started = generation;
    return Promise.all(
      paths.map(async (path) => {
        if (!supabase) throw new Error("not-configured");
        // Authorization header required on every download; no shareable signed URL.
        const { data, error } = await supabase.storage
          .from("building-images")
          .download(path);
        if (error || !data || started !== generation)
          throw error || new Error("session-ended");
        const signedUrl = URL.createObjectURL(data);
        privateObjectUrls.add(signedUrl);
        return { path, signedUrl };
      }),
    );
  });
}
let privatePhotos = memberPhotos();
export function clearPrivatePhotoUrls() {
  generation++;
  for (const url of privateObjectUrls) URL.revokeObjectURL(url);
  privateObjectUrls.clear();
  privatePhotos = memberPhotos();
}
export const photoUrls = (approved: boolean) =>
  approved ? publicPhotos : privatePhotos;
