// Navigation clavier entre blocs (façon Notion) :
// ↑ depuis la première ligne / ↓ depuis la dernière ligne → bloc précédent / suivant
// en conservant la position horizontale du caret ; ← au tout début / → à la toute
// fin → fin du bloc précédent / début du bloc suivant.
// Les éléments navigables portent l'attribut data-nav ; l'ordre du document
// correspond à l'ordre visuel (titre de page, blocs, colonnes de gauche à droite).

import { focusStart, focusEnd } from "./utils";

function lineHeightOf(el) {
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  return Number.isFinite(lh) ? lh : 24;
}

// Rect du caret ; null si indéterminable (bloc vide → une seule ligne de toute façon)
function caretRect() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const rects = r.getClientRects();
  // au point de retour à la ligne le caret a deux rects : le dernier est la ligne visible
  if (rects.length) return rects[rects.length - 1];
  const rect = r.getBoundingClientRect();
  return rect.top || rect.bottom || rect.left ? rect : null;
}

function onEdgeLine(el, edge) {
  const rect = caretRect();
  if (!rect) return true;
  const elRect = el.getBoundingClientRect();
  const lh = lineHeightOf(el);
  return edge === "first"
    ? rect.top - elRect.top < lh * 0.9
    : elRect.bottom - rect.bottom < lh * 0.9;
}

function caretAtBoundary(el, boundary) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0);
  const probe = document.createRange();
  probe.selectNodeContents(el);
  if (boundary === "start") probe.setEnd(r.startContainer, r.startOffset);
  else probe.setStart(r.endContainer, r.endOffset);
  return probe.toString().length === 0;
}

function rangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (!p) return null;
    const r = document.createRange();
    r.setStart(p.offsetNode, p.offset);
    r.collapse(true);
    return r;
  }
  return null;
}

// Place le caret dans el, sur sa première ou dernière ligne, au plus près de x
function focusAtX(el, x, edge) {
  el.focus();
  const rect = el.getBoundingClientRect();
  const half = lineHeightOf(el) / 2;
  const y =
    edge === "first"
      ? Math.min(rect.top + half, rect.bottom - 1)
      : Math.max(rect.bottom - half, rect.top + 1);
  const cx = Math.min(Math.max(x, rect.left + 1), rect.right - 1);
  const r = rangeFromPoint(cx, y);
  if (r && el.contains(r.startContainer)) {
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } else if (edge === "first") {
    focusStart(el);
  } else {
    focusEnd(el);
  }
}

// À appeler depuis onKeyDown d'un bloc. Retourne true si l'événement est géré.
export function handleArrowNav(e, el) {
  const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  if (!el || !keys.includes(e.key)) return false;
  if (e.shiftKey || e.metaKey || e.altKey || e.ctrlKey) return false;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;

  // on laisse le caret bouger normalement tant qu'il n'est pas au bord du bloc
  if (e.key === "ArrowUp" && !onEdgeLine(el, "first")) return false;
  if (e.key === "ArrowDown" && !onEdgeLine(el, "last")) return false;
  if (e.key === "ArrowLeft" && !caretAtBoundary(el, "start")) return false;
  if (e.key === "ArrowRight" && !caretAtBoundary(el, "end")) return false;

  const all = Array.from(document.querySelectorAll("[data-nav]"));
  const idx = all.indexOf(el);
  if (idx === -1) return false;
  const target = all[idx + (e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1)];
  if (!target) return false;

  e.preventDefault();
  const x = (caretRect() || el.getBoundingClientRect()).left;
  if (e.key === "ArrowUp") focusAtX(target, x, "last");
  else if (e.key === "ArrowDown") focusAtX(target, x, "first");
  else if (e.key === "ArrowLeft") focusEnd(target);
  else focusStart(target);
  target.scrollIntoView({ block: "nearest" });
  return true;
}
