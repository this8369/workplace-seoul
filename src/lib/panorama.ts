import { loadSdk } from "../components/NaverMap";

let pending: Promise<any> | undefined;
export async function loadPanorama() {
  const maps = await loadSdk();
  if (maps.Panorama) return maps;
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        pending = undefined;
        reject(new Error("panorama-load-failed"));
      };
      const timer = setTimeout(fail, 15000);
      script.src = "https://oapi.map.naver.com/openapi/v3/maps-panorama.js";
      script.onerror = fail;
      script.onload = () => {
        if (!maps.Panorama) return fail();
        clearTimeout(timer);
        resolve(maps);
      };
      document.head.append(script);
    });
  }
  return pending;
}
