import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, FileText, Plus, GripVertical, Paperclip } from "lucide-react";
import { useStore } from "../store";
import { newBlock, stripHtml, MAX_COLUMNS } from "../utils";
import { registerTarget, startPointerDrag, claimZone, wasDrag } from "../dnd";
import { usePageUi } from "../pageUi";
import TextBlock from "./TextBlock";
import TableBlock from "./TableBlock";
import BlockMenu, { TURN_INTO_ITEMS } from "./BlockMenu";
import PageIcon from "./PageIcon";

const TEXT_TYPES = ["paragraph", "bullet", "heading1", "heading2", "heading3"];

// Ids du bloc et de tout son contenu (enfants de toggles, colonnes) : capturés
// au début du drag pour ne jamais proposer de déposer un bloc en lui-même.
function innerIdSet(block, acc = new Set()) {
  acc.add(block.id);
  if (block.type === "toggle") for (const c of block.children || []) innerIdSet(c, acc);
  if (block.type === "columns") {
    for (const col of block.columns) {
      acc.add(col.id);
      for (const c of col.blocks) innerIdSet(c, acc);
    }
  }
  return acc;
}

// parentType : null (racine de page), "toggle" ou "column" — sert au menu slash
export default function BlockList({ page, parentBlockId, parentType, blocks }) {
  // id du bloc texte précédent, pour re-focus après suppression au Backspace
  let lastTextId = null;
  return blocks.map((block, index) => {
    const prevId = lastTextId;
    if (TEXT_TYPES.includes(block.type) || block.type === "toggle") {
      lastTextId = block.id;
    }
    return (
      <BlockShell
        key={block.id}
        page={page}
        parentBlockId={parentBlockId}
        parentType={parentType}
        block={block}
        index={index}
      >
        <BlockRenderer
          page={page}
          parentBlockId={parentBlockId}
          parentType={parentType}
          block={block}
          prevId={prevId}
        />
      </BlockShell>
    );
  });
}

// Décalage vertical de la poignée pour suivre la première ligne du bloc
function handleTop(block) {
  if (block.type === "heading1") return "top-[34px]";
  if (block.type === "heading2") return "top-[28px]";
  if (block.type === "heading3") return "top-[22px]";
  if (block.type === "toggle") {
    return { 1: "top-[34px]", 2: "top-[28px]", 3: "top-[22px]" }[block.h] || "top-1";
  }
  if (block.type === "table") return "top-3";
  return "top-1";
}

// Enveloppe commune : poignée (menu + drag), cibles de dépôt, surbrillance de sélection
function BlockShell({ page, parentBlockId, parentType, block, index, children }) {
  const {
    state,
    moveBlock,
    moveBlocks,
    movePage,
    removeBlock,
    transformBlock,
    duplicateBlock,
    moveBlockToPage,
    createPage,
    updateBlock,
    setView,
    setFocusId,
  } = useStore();
  const { selectedIds } = usePageUi();
  const shellRef = useRef(null);
  const [zone, setZone] = useState(null); // "top" | "bottom" | "left" | "right"
  const [menu, setMenu] = useState(null); // { x, y }

  const isRoot = !parentBlockId;
  const selected = isRoot && selectedIds.has(block.id);
  // Ligne de texte vide : on masque la poignée ⠿ (ni menu ni glissé) pour ne
  // pas encombrer les lignes vides. Elle réapparaît dès qu'on y écrit.
  const isEmptyLine = TEXT_TYPES.includes(block.type) && !stripHtml(block.html || "").trim();
  const canTransform = TEXT_TYPES.includes(block.type) || block.type === "toggle";
  const currentType =
    block.type === "toggle" ? (block.h ? `toggle-h${block.h}` : "toggle") : block.type;
  const turnItems = canTransform ? TURN_INTO_ITEMS : [];

  // Une page déposée au centre d'une autre page devient sa sous-page (même
  // geste que dans la barre latérale). Un dépôt ne crée JAMAIS de colonnes :
  // celles-ci ne viennent que de la commande /colonnes.
  const canNestPage = (info) =>
    block.type === "page" &&
    info.type === "page" &&
    !!info.pageId &&
    !!block.pageId &&
    info.pageId !== block.pageId;

  const computeZone = (pt, info) => {
    const r = shellRef.current.getBoundingClientRect();
    if (canNestPage(info)) {
      const y = (pt.y - r.top) / Math.max(r.height, 1);
      if (y > 0.3 && y < 0.7) return "into";
    }
    return pt.y < r.top + r.height / 2 ? "top" : "bottom";
  };

  const clearMine = useCallback(() => setZone(null), []);

  // Cible de dépôt : la zone est recalculée au drop à partir du point de
  // dépôt (l'état React ne sert qu'à l'indicateur, jamais à la décision).
  useEffect(() =>
    registerTarget(shellRef.current, {
      hover: (pt, info) => {
        if (info.inner.has(block.id)) return false;
        claimZone(clearMine);
        setZone(computeZone(pt, info));
        return true;
      },
      drop: (pt, info) => {
        if (info.blockId === block.id && !info.ids) return;
        const z = computeZone(pt, info);
        if (z === "into") {
          movePage(info.pageId, block.pageId);
        } else if (info.ids) {
          moveBlocks(page.id, info.ids, parentBlockId, z === "top" ? index : index + 1);
        } else {
          moveBlock(page.id, info.blockId, parentBlockId, z === "top" ? index : index + 1);
        }
      },
    })
  );

  const openMenu = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.right + 4, y: r.top });
  };

  // Marge gauche/droite propre à un bloc — réservée aux TABLEAUX (les autres
  // blocs suivent la marge générale de la page). Pastilles au survol, double-clic
  // = remise à zéro ; en vraies marges CSS, un tableau racine peut passer en
  // négatif pour déborder de la marge générale, jusqu'à 8px du bord de la fenêtre.
  const canBlockMargin = block.type === "table";
  const ml = block.ml || 0;
  const mr = block.mr || 0;
  const startBlockMargin = (e, side) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = shellRef.current;
    const shellR = el.getBoundingClientRect();
    const hostR = el.closest("main")?.getBoundingClientRect() || {
      left: 0,
      right: window.innerWidth,
    };
    const w0 = shellR.width;
    // dépassement autorisé pour un bloc racine : jusqu'à 8px du bord de la page
    const minMl = isRoot ? ml - (shellR.left - hostR.left) + 8 : 0;
    const minMr = isRoot ? mr - (hostR.right - shellR.right) + 8 : 0;
    const startX = e.clientX;
    let nml = ml;
    let nmr = mr;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (side === "left") {
        nml = Math.round(Math.max(minMl, Math.min(ml + (w0 - 120), ml + dx)));
        el.style.marginLeft = nml + "px";
      } else {
        nmr = Math.round(Math.max(minMr, Math.min(mr + (w0 - 120), mr - dx)));
        el.style.marginRight = nmr + "px";
      }
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.documentElement.classList.remove("nf-col-resizing");
      updateBlock(page.id, parentBlockId, block.id, side === "left" ? { ml: nml } : { mr: nmr });
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.documentElement.classList.add("nf-col-resizing");
  };

  return (
    <div
      ref={shellRef}
      className={`group/blk relative rounded ${selected ? "bg-accent/10" : ""}`}
      data-root-block={isRoot ? block.id : undefined}
      style={canBlockMargin && (ml || mr) ? { marginLeft: ml, marginRight: mr } : undefined}
    >
      {!isEmptyLine && (
        <div
          role="button"
          data-block-handle="1"
          className={`icon-btn absolute -left-6 ${handleTop(
            block
          )} w-5 h-6 opacity-0 group-hover/blk:opacity-100 transition-opacity cursor-grab active:cursor-grabbing select-none z-10`}
          title="Cliquer pour le menu, glisser pour déplacer"
          onClick={(e) => {
            if (!wasDrag()) openMenu(e);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault(); // pas de sélection de texte pendant le glissé
            // Sélection multiple : glisser une poignée déplace tous les blocs
            // sélectionnés d'un bloc, en préservant leur ordre.
            const multi = isRoot && selectedIds.size > 1 && selectedIds.has(block.id);
            if (multi) {
              const ids = page.blocks.filter((b) => selectedIds.has(b.id)).map((b) => b.id);
              const inner = new Set();
              for (const b of page.blocks) if (selectedIds.has(b.id)) innerIdSet(b, inner);
              startPointerDrag(e, {
                blockId: block.id,
                ids,
                type: "multi",
                inner,
                el: shellRef.current,
              });
            } else {
              startPointerDrag(e, {
                blockId: block.id,
                type: block.type,
                pageId: block.pageId, // bloc « page » : permet l'imbrication
                inner: innerIdSet(block),
                el: shellRef.current,
              });
            }
          }}
        >
          <GripVertical size={15} />
        </div>
      )}

      {children}

      {/* Pastilles de marge — uniquement pour les tableaux */}
      {canBlockMargin && (
        <>
          <span
            className="nf-margin-handle"
            style={{ left: -5 }}
            data-col-resize="1"
            onPointerDown={(e) => startBlockMargin(e, "left")}
            onDoubleClick={(e) => {
              e.stopPropagation();
              updateBlock(page.id, parentBlockId, block.id, { ml: 0 });
            }}
            title="Marge gauche du tableau (négatif = déborde de la page) — double-clic : réinitialiser"
          />
          <span
            className="nf-margin-handle"
            style={{ right: -5 }}
            data-col-resize="1"
            onPointerDown={(e) => startBlockMargin(e, "right")}
            onDoubleClick={(e) => {
              e.stopPropagation();
              updateBlock(page.id, parentBlockId, block.id, { mr: 0 });
            }}
            title="Marge droite du tableau (négatif = déborde de la page) — double-clic : réinitialiser"
          />
        </>
      )}

      {zone === "top" && (
        <div className="absolute inset-x-0 -top-[2px] h-[3px] rounded bg-accent/70 pointer-events-none z-10" />
      )}
      {zone === "bottom" && (
        <div className="absolute inset-x-0 -bottom-[2px] h-[3px] rounded bg-accent/70 pointer-events-none z-10" />
      )}
      {zone === "into" && (
        <div className="absolute inset-0 rounded ring-2 ring-accent/70 bg-accent/10 pointer-events-none z-10" />
      )}

      {menu && (
        <BlockMenu
          pos={menu}
          current={currentType}
          items={turnItems}
          pages={Object.values(state.pages).map((p) => ({
            id: p.id,
            title: p.title,
            icon: p.icon,
          }))}
          currentPageId={page.id}
          onClose={() => setMenu(null)}
          onTransform={(type) => {
            setMenu(null);
            transformBlock(page.id, parentBlockId, block.id, type);
            setFocusId(block.id);
          }}
          onDuplicate={() => {
            setMenu(null);
            duplicateBlock(page.id, parentBlockId, block.id);
          }}
          onMoveTo={(toId) => {
            setMenu(null);
            moveBlockToPage(page.id, block.id, toId);
            setView({ type: "page", id: toId });
          }}
          onMoveToNew={() => {
            setMenu(null);
            const pid = createPage(null, "");
            moveBlockToPage(page.id, block.id, pid);
            setView({ type: "page", id: pid });
          }}
          onDelete={() => {
            setMenu(null);
            removeBlock(page.id, parentBlockId, block.id);
          }}
        />
      )}
    </div>
  );
}

function BlockRenderer({ page, parentBlockId, parentType, block, prevId }) {
  if (block.type === "toggle") {
    return (
      <ToggleBlock
        page={page}
        parentBlockId={parentBlockId}
        parentType={parentType}
        block={block}
        prevId={prevId}
      />
    );
  }
  if (block.type === "table") {
    return <TableBlock page={page} parentBlockId={parentBlockId} block={block} />;
  }
  if (block.type === "page") {
    return <PageLinkBlock block={block} />;
  }
  if (block.type === "image") {
    return <ImageBlock page={page} parentBlockId={parentBlockId} block={block} />;
  }
  if (block.type === "file") {
    return <FileBlock block={block} />;
  }
  if (block.type === "columns") {
    return <ColumnsBlock page={page} parentBlockId={parentBlockId} block={block} />;
  }
  return (
    <TextBlock
      page={page}
      parentBlockId={parentBlockId}
      parentType={parentType}
      block={block}
      prevId={prevId}
    />
  );
}

// Alignement du chevron sur la première ligne selon le niveau de titre du toggle
const CHEVRON_TOP = { 1: "mt-[30px]", 2: "mt-[24px]", 3: "mt-[18px]" };

// Un toggle est aussi une cible de dépôt « à l'intérieur » (comme Notion) :
// la moitié basse de son titre affiche une ligne indentée et le bloc déposé
// devient son premier enfant (le toggle s'ouvre) ; la zone de contenu ouverte
// accepte un dépôt en fin de liste. La moitié haute et la bande à gauche de
// l'indentation restent gérées par la coquille (dépôt avant / après).
function ToggleBlock({ page, parentBlockId, parentType, block, prevId }) {
  const { updateBlock, insertBlockAfter, moveBlock, moveBlocks, setFocusId } = useStore();
  const headRef = useRef(null);
  const zoneRef = useRef(null);
  const [overIn, setOverIn] = useState(false); // ligne indentée sous le titre
  const [overEnd, setOverEnd] = useState(false); // ligne en fin de contenu
  const clearIn = useCallback(() => setOverIn(false), []);
  const clearEnd = useCallback(() => setOverEnd(false), []);

  const refuses = (info) => info.type === "columns" || info.inner.has(block.id);

  const dropInside = (info, index) => {
    if (info.ids) moveBlocks(page.id, info.ids, block.id, index);
    else moveBlock(page.id, info.blockId, block.id, index);
    if (!block.open) updateBlock(page.id, parentBlockId, block.id, { open: true });
  };

  useEffect(() =>
    registerTarget(headRef.current, {
      hover: (pt, info) => {
        if (refuses(info)) return false;
        const r = headRef.current.getBoundingClientRect();
        // moitié haute, ou à gauche de l'indentation : la coquille gère (avant/après)
        if (pt.y < r.top + r.height / 2 || pt.x - r.left < 36) return false;
        claimZone(clearIn);
        setOverIn(true);
        return true;
      },
      drop: (pt, info) => dropInside(info, 0),
    })
  );

  useEffect(() =>
    registerTarget(zoneRef.current, {
      hover: (pt, info) => {
        if (refuses(info)) return false;
        claimZone(clearEnd);
        setOverEnd(true);
        return true;
      },
      drop: (pt, info) => dropInside(info, (block.children || []).length),
    })
  );

  const addChild = () => {
    const nb = newBlock("paragraph");
    insertBlockAfter(page.id, block.id, null, nb);
    setFocusId(nb.id);
  };

  return (
    <div className="py-0.5">
      <div ref={headRef} className="relative flex items-start gap-0.5">
        <button
          className={`icon-btn w-6 h-6 shrink-0 ${CHEVRON_TOP[block.h] || "mt-0.5"}`}
          onClick={() => updateBlock(page.id, parentBlockId, block.id, { open: !block.open })}
          title={block.open ? "Replier" : "Déplier"}
        >
          <ChevronRight
            size={block.h ? 18 : 16}
            className={`transition-transform duration-150 ${block.open ? "rotate-90" : ""}`}
          />
        </button>
        <div className="flex-1 min-w-0">
          <TextBlock
            page={page}
            parentBlockId={parentBlockId}
            parentType={parentType}
            block={block}
            prevId={prevId}
          />
        </div>
        {overIn && (
          <div className="absolute left-9 right-0 -bottom-[2px] h-[3px] rounded bg-accent/70 pointer-events-none z-10" />
        )}
      </div>
      {block.open && (
        <div ref={zoneRef} className="relative ml-7 pl-2 border-l border-line/80">
          {block.children?.length > 0 ? (
            <BlockList
              page={page}
              parentBlockId={block.id}
              parentType="toggle"
              blocks={block.children}
            />
          ) : (
            <button
              className="flex items-center gap-1.5 py-1 text-[13.5px] text-ink-faint hover:text-ink-light"
              onClick={addChild}
            >
              <Plus size={13} /> Ajouter du contenu
            </button>
          )}
          {overEnd && (
            <div className="absolute inset-x-0 -bottom-[2px] h-[3px] rounded bg-accent/70 pointer-events-none z-10" />
          )}
        </div>
      )}
    </div>
  );
}

// Colonnes façon Notion : des conteneurs côte à côte au contenu libre.
// Vider entièrement une colonne la supprime ; quand il n'en reste qu'une,
// le bloc se dissout et son contenu redevient des blocs normaux (cf. store).
function ColumnsBlock({ page, parentBlockId, block }) {
  const { addColumn, setFocusId } = useStore();
  // block.w : largeur épinglée en px lors d'un réglage de marge de page —
  // les colonnes gardent alors leur taille quelle que soit la place disponible.
  return (
    <div
      className="group/cols relative flex items-stretch py-1"
      style={block.w ? { width: block.w } : undefined}
    >
      {block.columns.map((col, i) => (
        <React.Fragment key={col.id}>
          {i > 0 && (
            <ColumnGap page={page} parentBlockId={parentBlockId} colsBlock={block} index={i} />
          )}
          <Column page={page} col={col} />
        </React.Fragment>
      ))}
      {block.columns.length < MAX_COLUMNS && (
        <div
          data-drag-inert="1"
          className="absolute -right-7 inset-y-1 flex opacity-0 group-hover/cols:opacity-100 transition-opacity"
        >
          <button
            className="icon-btn w-6"
            title="Ajouter une colonne"
            onClick={() => setFocusId(addColumn(page.id, parentBlockId, block.id))}
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Une colonne est elle-même une cible de dépôt : sa zone vide (sous le dernier
// bloc) accepte un bloc et l'insère en fin de colonne. Les blocs internes,
// plus profonds dans le DOM, gardent la priorité (hit-test au plus profond).
function Column({ page, col }) {
  const { moveBlock, moveBlocks } = useStore();
  const colRef = useRef(null);
  const [over, setOver] = useState(false);
  const clearMine = useCallback(() => setOver(false), []);
  useEffect(() =>
    registerTarget(colRef.current, {
      hover: (pt, info) => {
        if (info.type === "columns" || info.inner.has(col.id)) return false;
        claimZone(clearMine);
        setOver(true);
        return true;
      },
      drop: (pt, info) =>
        info.ids
          ? moveBlocks(page.id, info.ids, col.id, col.blocks.length)
          : moveBlock(page.id, info.blockId, col.id, col.blocks.length),
    })
  );
  return (
    <div
      ref={colRef}
      className="relative min-w-0"
      style={{ flexGrow: col.grow || 1, flexBasis: 0 }}
    >
      <BlockList page={page} parentBlockId={col.id} parentType="column" blocks={col.blocks} />
      {over && (
        <div className="absolute inset-x-0 -bottom-[2px] h-[3px] rounded bg-accent/70 pointer-events-none z-10" />
      )}
    </div>
  );
}

// L'interstice entre deux colonnes remplit deux rôles :
//  • cible de dépôt : y déposer un bloc crée une nouvelle colonne (comme Notion) ;
//  • poignée de redimensionnement : le glisser ajuste les proportions des deux
//    colonnes adjacentes (largeur écrite en direct sur le DOM, validée au relâchement).
function ColumnGap({ page, parentBlockId, colsBlock, index }) {
  const { insertColumnWith, setColumnGrow } = useStore();
  const gapRef = useRef(null);
  const [over, setOver] = useState(false);
  const clearMine = useCallback(() => setOver(false), []);
  useEffect(() =>
    registerTarget(gapRef.current, {
      hover: (pt, info) => {
        if (
          info.type === "columns" ||
          info.ids || // une sélection multiple ne crée pas de colonne
          info.inner.has(colsBlock.id) ||
          colsBlock.columns.length >= MAX_COLUMNS
        )
          return false;
        claimZone(clearMine);
        setOver(true);
        return true;
      },
      drop: (pt, info) =>
        insertColumnWith(page.id, parentBlockId, colsBlock.id, index, info.blockId),
    })
  );

  const startResize = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const gap = gapRef.current;
    const leftEl = gap?.previousElementSibling;
    const rightEl = gap?.nextElementSibling;
    const leftCol = colsBlock.columns[index - 1];
    const rightCol = colsBlock.columns[index];
    if (!leftEl || !rightEl || !leftCol || !rightCol) return;
    const startX = e.clientX;
    const leftStart = leftEl.getBoundingClientRect().width;
    const rightStart = rightEl.getBoundingClientRect().width;
    const pairPx = leftStart + rightStart;
    const min = Math.min(80, pairPx / 2);
    const sumGrow = (leftCol.grow || 1) + (rightCol.grow || 1);
    let lg = leftCol.grow || 1;
    let rg = rightCol.grow || 1;
    const onMove = (ev) => {
      const leftW = Math.max(min, Math.min(pairPx - min, leftStart + (ev.clientX - startX)));
      lg = (sumGrow * leftW) / pairPx;
      rg = sumGrow - lg;
      leftEl.style.flexGrow = lg;
      rightEl.style.flexGrow = rg;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.documentElement.classList.remove("nf-col-resizing");
      setColumnGrow(page.id, parentBlockId, colsBlock.id, {
        [leftCol.id]: lg,
        [rightCol.id]: rg,
      });
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.documentElement.classList.add("nf-col-resizing");
  };

  return (
    <div
      ref={gapRef}
      data-col-resize="1"
      onPointerDown={startResize}
      className="group/gap w-6 shrink-0 self-stretch flex justify-center cursor-col-resize"
      title="Glisser pour redimensionner les colonnes"
    >
      <div
        className={
          over
            ? "w-[3px] rounded bg-accent/70"
            : "w-px rounded bg-line opacity-0 group-hover/cols:opacity-60 group-hover/gap:!opacity-100 group-hover/gap:w-[3px] group-hover/gap:!bg-accent/60 transition-all"
        }
      />
    </div>
  );
}

// Image redimensionnable façon Notion : pilules sur les bords + poignées de
// coin. Le glissé ajuste la largeur (ratio conservé), écrite en direct sur le
// DOM puis validée dans l'état au relâchement — comme les colonnes.
function ImageBlock({ page, parentBlockId, block }) {
  const { updateBlock } = useStore();
  const imgRef = useRef(null);

  const startResize = (e, dir) => {
    // dir : 1 = poignée droite, -1 = gauche (glisser vers l'extérieur agrandit)
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = imgRef.current.getBoundingClientRect().width;
    const maxW =
      imgRef.current.closest("[data-img-bound]")?.getBoundingClientRect().width || 9999;
    let finalW = startW;
    const onMove = (ev) => {
      finalW = Math.round(Math.max(80, Math.min(maxW, startW + dir * (ev.clientX - startX))));
      imgRef.current.style.width = finalW + "px";
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.documentElement.classList.remove("nf-col-resizing");
      updateBlock(page.id, parentBlockId, block.id, { width: finalW });
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.documentElement.classList.add("nf-col-resizing");
  };

  return (
    <div className="py-1" data-img-bound="1">
      <span className="nf-img-wrap relative inline-block max-w-full leading-none">
        <img
          ref={imgRef}
          src={block.src}
          alt={block.name || ""}
          draggable={false}
          className="block max-w-full rounded-md select-none"
          style={block.width ? { width: block.width } : { maxHeight: 480 }}
        />
        <span className="nf-img-handle left" data-col-resize="1" onPointerDown={(e) => startResize(e, -1)} />
        <span className="nf-img-handle right" data-col-resize="1" onPointerDown={(e) => startResize(e, 1)} />
        <span className="nf-img-corner bl" data-col-resize="1" onPointerDown={(e) => startResize(e, -1)} />
        <span className="nf-img-corner br" data-col-resize="1" onPointerDown={(e) => startResize(e, 1)} />
      </span>
    </div>
  );
}

// Lien vers un fichier local : clic → ouverture avec l'application par défaut
// (commande Rust open_path ; indisponible en mode navigateur).
function FileBlock({ block }) {
  const isTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const openFile = async () => {
    if (!isTauri) return;
    const { invoke } = await import("@tauri-apps/api/core");
    invoke("open_path", { path: block.path }).catch(() => {});
  };
  return (
    <button
      className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 my-0.5 rounded-md border border-line bg-card hover:bg-hover transition-colors"
      onClick={openFile}
      title={
        isTauri
          ? "Ouvrir avec l'application par défaut"
          : "Ouverture disponible dans l'application Noteflow"
      }
    >
      <Paperclip size={16} className="text-ink-faint shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium truncate">{block.name || "Fichier"}</span>
        <span className="block text-[11.5px] text-ink-faint truncate">{block.path}</span>
      </span>
    </button>
  );
}

function PageLinkBlock({ block }) {
  const { state, setView } = useStore();
  const target = state.pages[block.pageId];
  if (!target) return null;
  return (
    <button
      className="flex items-center gap-2 w-full text-left px-1.5 py-1 my-0.5 rounded hover:bg-hover"
      onClick={() => setView({ type: "page", id: target.id })}
    >
      {target.icon ? (
        <PageIcon icon={target.icon} size={16} className="shrink-0" />
      ) : (
        <FileText size={16} className="text-ink-faint shrink-0" />
      )}
      <span className="font-medium border-b border-line">{target.title || "Sans titre"}</span>
    </button>
  );
}
