// A post-save read must start after any request that began before the save.
export function createCatalogRequests<T>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  function read() {
    if (!pending)
      pending = Promise.resolve()
        .then(load)
        .finally(() => {
          pending = undefined;
        });
    return pending;
  }
  async function fresh() {
    if (pending) await pending.catch(() => undefined);
    return read();
  }
  return { read, fresh };
}
