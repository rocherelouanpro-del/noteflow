// Zoom général de l'application.
//
// On passe par le zoom NATIF du webview (l'équivalent de Cmd + / Cmd - dans un
// navigateur) plutôt que par la propriété CSS `zoom`. Mesuré : avec un `zoom`
// CSS sur la racine, un élément `position: fixed` demandé à 400 px atterrit à
// 600 px pour un facteur 1,5 — or tous les menus de l'app (colonnes, cellules,
// étiquettes, slash, barre flottante) sont des `fixed` positionnés à partir de
// `event.clientX`. Ils seraient tous décalés. Le zoom du webview, lui, met à
// l'échelle le repère lui-même : coordonnées, clics et menus restent cohérents.

// Paliers, façon navigateur : un cran = un écart visible, jamais un demi-pixel.
export const ZOOM_STEPS = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const DEFAULT_ZOOM = 1;

const isTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

// Le zoom natif n'existe pas sur mobile : wry documente « Android : non
// supporté », et sur iOS `setPageZoom` est bien appelé sans aucun effet visible
// (vérifié au simulateur, deux captures identiques à 100 % et 175 %). Plutôt
// que d'offrir un réglage qui ne fait rien, on masque le contrôle.
const isMobile =
  typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export const ZOOM_SUPPORTED = !isMobile;

// Palier suivant / précédent à partir de la valeur courante (qui peut ne pas
// être exactement sur un palier si le fichier de données vient d'ailleurs).
export function stepZoom(current, direction) {
  const i = ZOOM_STEPS.findIndex((z) => Math.abs(z - current) < 0.001);
  if (i !== -1) {
    return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + direction))];
  }
  return direction > 0
    ? ZOOM_STEPS.find((z) => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
    : [...ZOOM_STEPS].reverse().find((z) => z < current) ?? ZOOM_STEPS[0];
}

export const clampZoom = (z) =>
  Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], Math.max(ZOOM_STEPS[0], z || DEFAULT_ZOOM));

// Applique le zoom à la fenêtre. Sans Tauri (aperçu navigateur en développement)
// il n'y a pas d'équivalent scriptable : le zoom d'un navigateur ne s'ouvre pas
// au JavaScript. On ne fait alors rien plutôt que de retomber sur le `zoom` CSS,
// qui casserait les menus.
export async function applyZoom(z) {
  if (!isTauri) return false;
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    await getCurrentWebview().setZoom(clampZoom(z));
    return true;
  } catch (e) {
    // Plateforme sans zoom de webview (certains mobiles) : on n'insiste pas.
    console.warn("zoom non appliqué", e);
    return false;
  }
}
