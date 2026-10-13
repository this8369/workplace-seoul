// Resolve presentation values without copying or changing the source records.
export const hasAssetValue = (value: unknown) =>
  value != null && value !== "" && (!Array.isArray(value) || value.length > 0);
export function sharedFields<T extends { id: string }>(
  own: T | undefined,
  shared: T | undefined,
  fields: readonly (keyof T)[],
) {
  const values = own ? { ...own } : undefined;
  const inherited = new Set<keyof T>();
  if (values && shared)
    for (const key of fields) {
      if (!hasAssetValue(own![key]) && hasAssetValue(shared[key])) {
        values[key] = shared[key];
        inherited.add(key);
      }
    }
  return {
    values,
    inherited,
    sourceId: (field: keyof T) => (inherited.has(field) ? shared?.id : own?.id),
  };
}
export function scopedRows<T>(own: readonly T[], shared: readonly T[] = []) {
  return {
    rows: own.length ? [...own] : [...shared],
    inherited: !own.length && !!shared.length,
  };
}
