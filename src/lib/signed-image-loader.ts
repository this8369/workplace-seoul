type Signed = {
  path: string | null;
  signedUrl: string | null;
  error?: string | null;
};
type Entry = { url: string; expires: number };
export function createSignedImageLoader(
  sign: (paths: string[]) => Promise<Signed[]>,
  storage?: {
    read: () => Record<string, Entry>;
    write: (entries: Record<string, Entry>) => void;
  },
) {
  const cache = new Map<string, Entry>();
  try {
    Object.entries(storage?.read() ?? {}).forEach(([path, e]) => {
      if (e.expires > Date.now()) cache.set(path, e);
    });
  } catch {
    /* optional cache */
  }
  const pending = new Map<
    string,
    {
      promise: Promise<string>;
      resolve: (url: string) => void;
      reject: (reason: unknown) => void;
    }
  >();
  const queue = new Set<string>();
  let scheduled = false,
    active = 0;
  function schedule() {
    if (!scheduled) {
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        void flush();
      }, 12);
    }
  }
  async function flush() {
    if (active >= 2 || !queue.size) return;
    const paths = [...queue].slice(0, 32);
    paths.forEach((p) => queue.delete(p));
    active++;
    if (queue.size) schedule();
    try {
      const results = await sign(paths);
      for (const path of paths) {
        const row = results.find((r) => r.path === path);
        if (row?.signedUrl && !row.error) {
          cache.set(path, {
            url: row.signedUrl,
            expires: Date.now() + 50 * 60_000,
          });
          pending.get(path)?.resolve(row.signedUrl);
        } else pending.get(path)?.reject(new Error("Photo unavailable"));
      }
      try {
        storage?.write(
          Object.fromEntries(
            [...cache].filter(([, e]) => e.expires > Date.now()).slice(-128),
          ),
        );
      } catch {
        /* optional cache */
      }
    } catch (error) {
      paths.forEach((p) => pending.get(p)?.reject(error));
    } finally {
      paths.forEach((p) => pending.delete(p));
      active--;
      if (queue.size) schedule();
    }
  }
  return {
    get(path: string): Promise<string> {
      const cached = cache.get(path);
      if (cached && cached.expires > Date.now())
        return Promise.resolve(cached.url);
      const existing = pending.get(path);
      if (existing) return existing.promise;
      let resolve!: (url: string) => void, reject!: (reason: unknown) => void;
      const promise = new Promise<string>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      pending.set(path, { promise, resolve, reject });
      queue.add(path);
      schedule();
      return promise;
    },
    invalidate(path: string) {
      cache.delete(path);
    },
  };
}
