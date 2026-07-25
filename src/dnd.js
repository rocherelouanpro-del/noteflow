// Glisser-déposer de blocs aux événements souris — PAS de HTML5 drag & drop :
// la WKWebView de l'app Tauri ne délivre pas ces événements de façon fiable,
// alors que les événements souris se comportent partout comme dans Chrome
// (c'est aussi l'approche de Notion). Un seul drag à la fois, un seul
// indicateur de dépôt visible à la fois.

let dragInfo = null; // { blockId, type, inner: Set<id> } — bloc déplacé + son contenu
let clearZone = null; // efface l'indicateur de la zone qui l'a « réclamé »
let didDrag = false; // un vrai déplacement vient d'avoir lieu (inhibe le clic menu)

// Cibles de dépôt : élément DOM → { hover(pt, info): bool, drop(pt, info) }.
// hover renvoie true si la cible accepte le point (et affiche son indicateur) ;
// sinon on remonte à l'ancêtre enregistré suivant (équivalent du bubbling).
const targets = new Map();

export function registerTarget(el, handlers) {
  if (!el) return () => {};
  targets.set(el, handlers);
  return () => targets.delete(el);
}

export function getDrag() {
  return dragInfo;
}

// vrai juste après un drag : le clic qui suit le mouseup ne doit pas ouvrir le menu
export function wasDrag() {
  return didDrag;
}

export function claimZone(fn) {
  if (clearZone && clearZone !== fn) clearZone();
  clearZone = fn;
}

function clearCurrent() {
  if (clearZone) clearZone();
  clearZone = null;
}

// Conteneur scrollable le plus proche (zone centrale de l'app)
function findScroller(el) {
  let n = el;
  while (n && n !== document.body) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return null;
}

// Défilement automatique près des bords pendant le drag (pas à pas au mousemove ;
// la molette reste utilisable, le drag souris ne la bloque pas)
function autoScroll(scroller, y) {
  if (!scroller) return;
  const r = scroller.getBoundingClientRect();
  const M = 70;
  if (y < r.top + M) scroller.scrollTop -= Math.min(24, (r.top + M - y) * 0.4);
  else if (y > r.bottom - M) scroller.scrollTop += Math.min(24, (y - (r.bottom - M)) * 0.4);
}

// Fantôme translucide du bloc qui suit le curseur (comme Notion)
function makeGhost(sourceEl) {
  const g = document.createElement("div");
  g.className = "nf-drag-ghost";
  if (sourceEl) {
    const clone = sourceEl.cloneNode(true);
    clone.style.margin = "0";
    // neutralise les attributs qui feraient passer le clone pour un vrai bloc
    for (const el of [clone, ...clone.querySelectorAll("[data-root-block],[data-block-handle],[data-nav],[contenteditable]")]) {
      el.removeAttribute("data-root-block");
      el.removeAttribute("data-block-handle");
      el.removeAttribute("data-nav");
      el.removeAttribute("contenteditable");
    }
    g.appendChild(clone);
  }
  document.body.appendChild(g);
  return g;
}

function hitTest(x, y) {
  let el = document.elementFromPoint(x, y);
  while (el) {
    const h = targets.get(el);
    if (h && h.hover({ x, y }, dragInfo)) return h;
    el = el.parentElement;
  }
  return null;
}

// Amorce un drag potentiel au pointerdown sur une poignée. Le drag ne devient
// effectif qu'au-delà du seuil de mouvement — en deçà c'est un simple clic
// (le menu du bloc reste accessible). Échap annule.
//
// Événements POINTEUR (et non souris) : un seul chemin de code couvre la
// souris, le doigt et le stylet — indispensable sur Android. Les poignées
// portent `touch-action: none` (cf. index.css) sans quoi le navigateur
// confisquerait le geste pour faire défiler la page.
export function startPointerDrag(e, info) {
  const startX = e.clientX;
  const startY = e.clientY;
  const pointerId = e.pointerId;
  const isTouch = e.pointerType === "touch";
  // un doigt tremble plus qu'une souris : seuil de déclenchement plus large
  const THRESHOLD = isTouch ? 10 : 4;
  let active = false;
  let ghost = null;
  const scroller = findScroller(info.el);
  didDrag = false;

  const activate = () => {
    active = true;
    didDrag = true;
    dragInfo = info;
    // rend poignées et boutons flottants transparents aux hit-tests (cf. index.css)
    document.documentElement.setAttribute("data-dragging", "1");
    document.body.style.userSelect = "none";
    ghost = makeGhost(info.el);
  };

  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return; // un 2e doigt ne pilote pas le drag
    // bouton relâché hors fenêtre (pointerup manqué) : on annule proprement.
    // Ne vaut que pour la souris — au doigt, `buttons` retombe parfois à 0
    // entre deux événements, et c'est `pointercancel` qui fait foi.
    if (!isTouch && !(ev.buttons & 1)) return finish(false, ev);
    if (!active) {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < THRESHOLD) return;
      activate();
    }
    ev.preventDefault();
    // au doigt, on décale davantage le fantôme pour qu'il ne soit pas masqué
    const dx = isTouch ? 18 : 14;
    const dy = isTouch ? -28 : 10;
    ghost.style.transform = `translate(${ev.clientX + dx}px, ${ev.clientY + dy}px)`;
    autoScroll(scroller, ev.clientY);
    if (!hitTest(ev.clientX, ev.clientY)) clearCurrent();
  };

  const finish = (drop, ev) => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("keydown", onKey, true);
    if (!active) return;
    const tgt = drop ? hitTest(ev.clientX, ev.clientY) : null;
    const pt = ev ? { x: ev.clientX, y: ev.clientY } : null;
    const info2 = dragInfo;
    clearCurrent();
    dragInfo = null;
    document.documentElement.removeAttribute("data-dragging");
    document.body.style.userSelect = "";
    if (ghost) ghost.remove();
    if (tgt) tgt.drop(pt, info2);
    // le clic consécutif au mouseup part avant ce timer : wasDrag() le bloque
    setTimeout(() => {
      didDrag = false;
    }, 0);
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    finish(true, ev);
  };
  // Le système reprend la main sur le geste (appel entrant, geste système
  // Android, doigt sorti de l'écran…) : on annule sans rien déposer.
  const onCancel = (ev) => {
    if (ev.pointerId !== pointerId) return;
    finish(false, ev);
  };
  const onKey = (ev) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      finish(false, ev);
    }
  };
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
  window.addEventListener("keydown", onKey, true);
}
