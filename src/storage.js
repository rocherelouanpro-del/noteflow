// Persistance : commandes Rust dans l'app Tauri, localStorage en mode navigateur (dev)
const isTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
const LS_KEY = "noteflow-data";

async function tauriInvoke(cmd, args) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args);
}

export async function loadData() {
  try {
    const raw = isTauri ? await tauriInvoke("load_data") : localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("loadData failed", e);
    return null;
  }
}

export async function saveData(state) {
  try {
    const raw = JSON.stringify(state);
    if (isTauri) await tauriInvoke("save_data", { data: raw });
    else localStorage.setItem(LS_KEY, raw);
  } catch (e) {
    console.error("saveData failed", e);
  }
}
