// Keep the UI usable when browser storage is unavailable, full, or malformed.
export function createStorage(resolve = () => globalThis.localStorage) {
  const memory = new Map();
  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key);
      try {
        return resolve().getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      const string = String(value);
      memory.set(key, string);
      try {
        resolve().setItem(key, string);
      } catch { /* Session-only fallback. */ }
    },
    removeItem(key) {
      memory.set(key, null);
      try {
        resolve().removeItem(key);
      } catch { /* Session-only fallback. */ }
    },
  };
}
export const storage = createStorage();
export function readJSON(key, fallback, source = storage) {
  try {
    const result = JSON.parse(source.getItem(key));
    if (Array.isArray(fallback)) {
      return Array.isArray(result) ? result : fallback;
    }
    return result && typeof result === "object" && !Array.isArray(result)
      ? result
      : fallback;
  } catch {
    return fallback;
  }
}
