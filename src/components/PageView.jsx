import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, SmilePlus } from "lucide-react";
import { useStore } from "../store";
import { newBlock, stripHtml, blockToText, copyText } from "../utils";
import { registerTarget, claimZone } from "../dnd";
import { handleArrowNav } from "../keynav";
import { PageUiContext } from "../pageUi";
import BlockList from "./BlockList";
import EmojiPicker from "./EmojiPicker";
import PageIcon from "./PageIcon";

export default function PageView({ page }) {
  const {
    state,
    renamePage,
    setPageIcon,
    setPageMargins,
    appendBlock,
    removeBlocks,
    moveBlock,
    moveBlocks,
    setFocusId,
    setView,
  } = useStore();
  const titleRef = useRef(null);
  const containerRef = useRef(null);
  const [picker, setPicker] = useState(null); // { x, y }
  // dépôt d'un bloc dans la zone libre sous le contenu → fin de page (comme Notion)
  const endZoneRef = useRef(null);
  const [dropEnd, setDropEnd] = useState(false);
  const clearDropEnd = useCallback(() => setDropEnd(false), []);
  useEffect(() =>
    registerTarget(endZoneRef.current, {
      hover: () => {
        claimZone(clearDropEnd);
        setDropEnd(true);
        return true;
      },
      drop: (pt, info) =>
        info.ids
          ? moveBlocks(pageRef.current.id, info.ids, null, pageRef.current.blocks.length)
          : moveBlock(pageRef.current.id, info.blockId, null, pageRef.current.blocks.length),
    })
  );

  // ---- Sélection multiple de blocs racine (rectangle ou glissé de texte) ----
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [marquee, setMarquee] = useState(null); // { x1, y1, x2, y2 }
  const dragSel = useRef(null); // { mode: "marquee"|"maybe"|"blocks", ... }
  const justDragged = useRef(false); // évite le clic parasite après un drag

  // refs stables pour les listeners globaux
  const pageRef = useRef(page);
  pageRef.current = page;
  const stateRef = useRef(state);
  stateRef.current = state;
  const selRef = useRef(selectedIds);
  selRef.current = selectedIds;

  const setSel = useCallback((ids) => {
    setSelectedIds((prev) => {
      if (prev.size === ids.size && [...ids].every((i) => prev.has(i))) return prev;
      return ids;
    });
  }, []);

  // Titre non contrôlé : on ne touche au DOM que si le titre change ailleurs
  // (renommage via la sidebar), pour ne pas perdre le caret pendant la frappe.
  useEffect(() => {
    if (titleRef.current && titleRef.current.textContent !== (page.title || "")) {
      titleRef.current.textContent = page.title || "";
    }
  });

  const onMouseDownCapture = (e) => {
    if (e.button !== 0) return;
    const t = e.target;
    if (t.closest(".menu-panel, [data-block-handle], [data-col-resize], button, input, textarea, select"))
      return;
    const shell = t.closest("[data-root-block]");
    const inEditable = !!t.closest("[contenteditable]");
    if (shell && inEditable) {
      // départ dans du texte : sélection native d'abord,
      // bascule en sélection de blocs si le pointeur sort du bloc d'origine
      dragSel.current = { mode: "maybe", anchorId: shell.dataset.rootBlock };
      if (selRef.current.size) setSel(new Set());
    } else if (!inEditable) {
      // départ dans le vide : rectangle de sélection
      dragSel.current = { mode: "marquee", startX: e.clientX, startY: e.clientY, active: false };
      if (selRef.current.size) setSel(new Set());
    } else if (selRef.current.size) {
      setSel(new Set());
    }
  };

  // Suivi souris global : rectangle + bascule texte → blocs
  useEffect(() => {
    const rootShells = () =>
      containerRef.current
        ? Array.from(containerRef.current.querySelectorAll("[data-root-block]"))
        : [];
    const clearNative = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) sel.removeAllRanges();
    };
    const end = () => {
      dragSel.current = null;
      setMarquee(null);
      document.body.style.userSelect = "";
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
    };

    const onMove = (e) => {
      const st = dragSel.current;
      if (!st) return;
      if (!(e.buttons & 1)) {
        end();
        return;
      }
      if (st.mode === "marquee") {
        if (!st.active && Math.abs(e.clientX - st.startX) + Math.abs(e.clientY - st.startY) < 6)
          return;
        if (!st.active) {
          st.active = true;
          document.body.style.userSelect = "none";
        }
        justDragged.current = true;
        const rect = {
          x1: Math.min(st.startX, e.clientX),
          y1: Math.min(st.startY, e.clientY),
          x2: Math.max(st.startX, e.clientX),
          y2: Math.max(st.startY, e.clientY),
        };
        setMarquee(rect);
        const ids = new Set();
        for (const el of rootShells()) {
          const r = el.getBoundingClientRect();
          if (r.right > rect.x1 && r.left < rect.x2 && r.bottom > rect.y1 && r.top < rect.y2) {
            ids.add(el.dataset.rootBlock);
          }
        }
        setSel(ids);
        clearNative();
      } else {
        // Bloc survolé déterminé par la position VERTICALE du curseur, PAS par
        // elementFromPoint : pendant une sélection de texte native (capricieuse
        // sous WebKit/WKWebView) elementFromPoint peut rester bloqué sur le bloc
        // de départ → la bascule en sélection de blocs ne se déclenchait jamais
        // dans l'app installée (surtout depuis un bloc long de plusieurs lignes).
        const shells = rootShells();
        let overId = null;
        for (const shell of shells) {
          const r = shell.getBoundingClientRect();
          if (e.clientY >= r.top && e.clientY <= r.bottom) {
            overId = shell.dataset.rootBlock;
            break;
          }
        }
        // curseur au-dessus du premier / sous le dernier bloc → on borne aux extrémités
        if (!overId && shells.length) {
          const firstR = shells[0].getBoundingClientRect();
          const lastR = shells[shells.length - 1].getBoundingClientRect();
          if (e.clientY < firstR.top) overId = shells[0].dataset.rootBlock;
          else if (e.clientY > lastR.bottom)
            overId = shells[shells.length - 1].dataset.rootBlock;
        }
        if (overId && overId !== st.anchorId) {
          st.mode = "blocks";
          justDragged.current = true;
          document.body.style.userSelect = "none";
          e.preventDefault(); // stoppe l'extension de la sélection de texte native
          const order = shells.map((x) => x.dataset.rootBlock);
          const a = order.indexOf(st.anchorId);
          const b = order.indexOf(overId);
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSel(new Set(order.slice(lo, hi + 1)));
          clearNative();
          if (document.activeElement?.blur) document.activeElement.blur();
        } else if (st.mode === "blocks") {
          // rester en mode blocs : on bloque et on efface toute sélection native
          // que WebKit tenterait de rétablir à chaque déplacement
          e.preventDefault();
          clearNative();
          if (overId === st.anchorId) setSel(new Set([st.anchorId]));
        }
      }
    };
    const onUp = () => {
      if (dragSel.current) {
        dragSel.current = null;
        setMarquee(null);
        document.body.style.userSelect = "";
        setTimeout(() => {
          justDragged.current = false;
        }, 0);
      }
    };
    // En mode sélection de blocs, empêcher WebKit de (re)lancer une sélection de
    // texte native — sinon un surlignage de texte parasite se superpose aux blocs.
    const onSelectStart = (e) => {
      if (dragSel.current?.mode === "blocks") e.preventDefault();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.addEventListener("selectstart", onSelectStart);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("selectstart", onSelectStart);
      document.body.style.userSelect = "";
    };
  }, [setSel]);

  // Clavier + presse-papiers quand des blocs sont sélectionnés
  useEffect(() => {
    const selectedBlocks = () =>
      pageRef.current.blocks.filter((b) => selRef.current.has(b.id));
    const copySelection = () => {
      const text = selectedBlocks()
        .map((b) => blockToText(b, stateRef.current.pages))
        .join("\n");
      copyText(text);
    };
    const deleteSelection = () => {
      removeBlocks(pageRef.current.id, [...selRef.current]);
      setSel(new Set());
    };

    const onKeyDown = (e) => {
      if (!selRef.current.size) return;
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        setSel(new Set());
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelection();
      } else if (meta && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
      } else if (meta && e.key.toLowerCase() === "x") {
        e.preventDefault();
        copySelection();
        deleteSelection();
      } else if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSel(new Set(pageRef.current.blocks.map((b) => b.id)));
      }
    };
    // Cmd+A depuis un bloc dont tout le texte est déjà sélectionné (cf. TextBlock)
    const onSelectAll = () => {
      setSel(new Set(pageRef.current.blocks.map((b) => b.id)));
      const sel = window.getSelection();
      if (sel && sel.rangeCount) sel.removeAllRanges();
      if (document.activeElement?.blur) document.activeElement.blur();
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("nf-select-all", onSelectAll);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("nf-select-all", onSelectAll);
    };
  }, [removeBlocks, setSel]);

  // Fil d'ariane : ancêtres de la page
  const crumbs = [];
  let p = page;
  while (p) {
    crumbs.unshift(p);
    p = p.parentId ? state.pages[p.parentId] : null;
  }

  const clickBelow = () => {
    if (justDragged.current) return;
    const last = page.blocks[page.blocks.length - 1];
    if (last && last.type === "paragraph" && !stripHtml(last.html).trim()) {
      setFocusId(last.id);
      return;
    }
    const nb = newBlock("paragraph");
    appendBlock(page.id, nb);
    setFocusId(nb.id);
  };

  const openPicker = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPicker({ x: r.left, y: r.bottom + 6 });
  };

  // ---- Marges de la page (glisser les bandes latérales ; double-clic = défaut) ----
  // Pendant le glissé, SEULE la ligne indicatrice suit le curseur : le contenu
  // reste figé et ne bouge qu'au relâchement. À ce moment-là, la largeur des
  // blocs colonnes est épinglée en pixels (mesurée avant le changement) pour
  // qu'ils ne profitent pas de l'espace gagné ni ne rétrécissent : la marge
  // ajoute ou reprend seulement de l'espace libre.
  const margins = page.margins || null;

  const startPageMargin = (e, side) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const strip = e.currentTarget;
    const wrap = containerRef.current;
    const host = wrap.parentElement;
    const hostR = host.getBoundingClientRect();
    const r = wrap.getBoundingClientRect();
    const cs = getComputedStyle(wrap);
    // position réelle des marges (relatives à la pleine largeur de la page)
    let left = Math.round(r.left - hostR.left + parseFloat(cs.paddingLeft));
    let right = Math.round(hostR.right - r.right + parseFloat(cs.paddingRight));
    // décalage entre coordonnées « pleine largeur » et le conteneur actuel
    // (encore centré tant qu'aucune marge custom n'existe)
    const offLeft = r.left - hostR.left;
    const offRight = hostR.right - r.right;
    const startX = e.clientX;
    const startLeft = left;
    const startRight = right;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (side === "left") {
        left = Math.round(
          Math.max(16, Math.min(hostR.width - startRight - 320, startLeft + dx))
        );
        strip.style.left = left - offLeft - 7 + "px";
      } else {
        right = Math.round(
          Math.max(16, Math.min(hostR.width - startLeft - 320, startRight - dx))
        );
        strip.style.right = right - offRight - 7 + "px";
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.documentElement.classList.remove("nf-col-resizing");
      // largeur actuelle des blocs colonnes racine, mesurée AVANT le
      // changement de marge (le rendu est encore figé à cet instant)
      const pins = {};
      wrap.querySelectorAll("[data-root-block]").forEach((shell) => {
        const row = shell.querySelector(".group\\/cols");
        if (row) pins[shell.dataset.rootBlock] = row.getBoundingClientRect().width;
      });
      setPageMargins(page.id, { left, right }, pins);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.documentElement.classList.add("nf-col-resizing");
  };

  const resetPageMargins = () => {
    const wrap = containerRef.current;
    for (const p of ["maxWidth", "marginLeft", "marginRight", "paddingLeft", "paddingRight"]) {
      wrap.style[p] = "";
    }
    setPageMargins(page.id, null);
  };

  const uiValue = useMemo(() => ({ selectedIds }), [selectedIds]);

  return (
    <PageUiContext.Provider value={uiValue}>
      <div className="min-h-full flex flex-col" onMouseDownCapture={onMouseDownCapture}>
        <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur px-6 h-12 flex items-center gap-1 text-[13px] text-ink-light shrink-0">
          {crumbs.map((c, i) => (
            <React.Fragment key={c.id}>
              {i > 0 && <ChevronRight size={13} className="text-ink-faint" />}
              <button
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-hover max-w-48 ${
                  i === crumbs.length - 1 ? "text-ink font-medium" : ""
                }`}
                onClick={() => setView({ type: "page", id: c.id })}
              >
                {c.icon && <PageIcon icon={c.icon} size={14} className="shrink-0" />}
                <span className="truncate">{c.title || "Sans titre"}</span>
              </button>
            </React.Fragment>
          ))}
        </header>

        <div
          ref={containerRef}
          className={`group/head relative w-full pt-8 pb-4 flex-1 flex flex-col ${
            margins ? "" : "max-w-3xl mx-auto px-10"
          }`}
          style={margins ? { paddingLeft: margins.left, paddingRight: margins.right } : undefined}
        >
          {/* Réglage des marges de la page (glisser ; double-clic : disposition par défaut) */}
          <div
            className="nf-page-margin"
            style={{ left: (margins ? margins.left : 40) - 7 }}
            data-col-resize="1"
            onMouseDown={(e) => startPageMargin(e, "left")}
            onDoubleClick={resetPageMargins}
            title="Marge gauche de la page — double-clic : réinitialiser"
          />
          <div
            className="nf-page-margin"
            style={{ right: (margins ? margins.right : 40) - 7 }}
            data-col-resize="1"
            onMouseDown={(e) => startPageMargin(e, "right")}
            onDoubleClick={resetPageMargins}
            title="Marge droite de la page — double-clic : réinitialiser"
          />
          {page.icon ? (
            <button
              className="w-fit -ml-1.5 mb-3 px-1.5 py-1 rounded-lg hover:bg-hover leading-none transition-colors"
              title="Changer l'icône"
              onClick={openPicker}
            >
              <PageIcon icon={page.icon} size={64} />
            </button>
          ) : (
            <button
              className="w-fit opacity-0 group-hover/head:opacity-100 transition-opacity flex items-center gap-1.5 -ml-1 mb-2 px-1.5 py-1 rounded text-[13px] text-ink-faint hover:bg-hover hover:text-ink-light"
              onClick={openPicker}
            >
              <SmilePlus size={14} /> Ajouter une icône
            </button>
          )}

          <h1
            ref={titleRef}
            contentEditable
            suppressContentEditableWarning
            className="ph-always text-4xl font-bold mb-6 outline-none"
            data-placeholder="Sans titre"
            data-nav="1"
            onInput={(e) => renamePage(page.id, e.currentTarget.textContent)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const first = page.blocks[0];
                if (first) setFocusId(first.id);
                return;
              }
              handleArrowNav(e, titleRef.current);
            }}
            onPaste={(e) => {
              e.preventDefault();
              document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            }}
          />

          <BlockList page={page} parentBlockId={null} parentType={null} blocks={page.blocks} />

          {/* Zone cliquable sous le contenu pour continuer à écrire ;
              pendant un drag, cible de dépôt « fin de page » */}
          <div ref={endZoneRef} className="relative flex-1 min-h-24 cursor-text" onClick={clickBelow}>
            {dropEnd && (
              <div className="absolute inset-x-0 top-0 h-[3px] rounded bg-accent/70 pointer-events-none" />
            )}
          </div>
        </div>

        {marquee && (
          <div
            className="fixed z-40 bg-accent/10 border border-accent/40 pointer-events-none"
            style={{
              left: marquee.x1,
              top: marquee.y1,
              width: marquee.x2 - marquee.x1,
              height: marquee.y2 - marquee.y1,
            }}
          />
        )}

        {picker && (
          <EmojiPicker
            pos={picker}
            allowImage
            onPick={(emoji) => {
              setPageIcon(page.id, emoji);
              setPicker(null);
            }}
            onRemove={
              page.icon
                ? () => {
                    setPageIcon(page.id, null);
                    setPicker(null);
                  }
                : null
            }
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </PageUiContext.Provider>
  );
}
