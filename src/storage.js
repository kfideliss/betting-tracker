// LocalStorage-based persistent storage (replaces window.storage from artifact)
const PREFIX = "edge_v4_";

export function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

export function lsSet(key, val) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch {}
}

export function lsRemove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

// Export all data as JSON string
export function exportAllData() {
  const keys = ["bets_v1", "books_v1", "txns_v1", "imported_v1"];
  const data = {};
  keys.forEach(k => { const v = localStorage.getItem(PREFIX + k); if (v) data[k] = JSON.parse(v); });
  return JSON.stringify(data, null, 2);
}

// Import all data from JSON string
export function importAllData(jsonStr) {
  const data = JSON.parse(jsonStr);
  Object.entries(data).forEach(([k, v]) => localStorage.setItem(PREFIX + k, JSON.stringify(v)));
}
