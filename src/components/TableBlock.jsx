import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Type,
  Hash,
  Calendar,
  Tag,
  Plus,
  Trash2,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  X,
  Check,
  GripVertical,
  GripHorizontal,
  FileText,
  ChevronLeft,
  WrapText,
  ArrowRight,
  CircleDot,
  Copy,
} from "lucide-react";
import { useStore } from "../store";
import { uid, TAG_PALETTE, tagStyle, tagColor } from "../utils";
import PageIcon from "./PageIcon";
import PagePicker from "./PagePicker";

const COL_TYPES = [
  { id: "text", label: "Texte", icon: Type },
  { id: "number", label: "Nombre", icon: Hash },
  { id: "date", label: "Date", icon: Calendar },
  { id: "selectone", label: "Choix unique", icon: CircleDot },
  { id: "select", label: "Choix multiple", icon: Tag },
];

const typeIcon = (t) => COL_TYPES.find((c) => c.id === t)?.icon || Type;

// Les deux colonnes à étiquettes partagent tout : mêmes `options` sur la
// colonne, même stockage (un tableau d'ids dans la cellule). « Choix unique »
// se contente de brider ce tableau à un seul élément — les tris, l'export
// texte et le rendu restent donc communs.
const isSelect = (t) => t === "select" || t === "selectone";

// Retour à la ligne d'une cellule texte. Réglage par COLONNE (`col.wrap`,
// actif par défaut), qu'une case peut surcharger individuellement
// (`row.wrap[colId]`). `undefined` = « suit la colonne ».
function cellWraps(col, row) {
  const perCell = row?.wrap?.[col.id];
  if (typeof perCell === "boolean") return perCell;
  return col.wrap !== false;
}

// Largeur des colonnes (façon Excel/Notion)
const DEFAULT_COL_W = 180; // colonne sans largeur définie
const MIN_COL_W = 60; // largeur minimale au glissé
const ACTIONS_W = 120; // colonne de fin (bouton + / suppression de ligne)
const HANDLE_W = 48; // colonne de gauche : poignée de déplacement + case à cocher

// Copie des cellules d'une ligne. Une cellule peut contenir un tableau d'ids
// d'étiquettes ou un objet « lien de page » : une copie plate partagerait la
// référence, et modifier la copie modifierait l'original.
function cloneCells(cells) {
  const out = {};
  for (const [k, v] of Object.entries(cells || {})) {
    out[k] = Array.isArray(v) ? [...v] : v && typeof v === "object" ? { ...v } : v;
  }
  return out;
}

export default function TableBlock({ page, parentBlockId, block }) {
  const { updateBlockWith, removeBlock } = useStore();
  // Menu unique, positionné en fixed (échappe à l'overflow-x du tableau) :
  // { kind: "col" | "addcol" | "tags" | "table", colId?, rowId?, x, y }
  const [menu, setMenu] = useState(null);
  const [selected, setSelected] = useState(() => new Set()); // ids de lignes cochées

  const mut = (fn, coalesceKey) =>
    updateBlockWith(page.id, parentBlockId, block.id, fn, coalesceKey);

  const wrapRef = useRef(null);
  const tableRef = useRef(null);
  const dropIndRef = useRef(null); // ligne d'insertion pendant un réordonnancement
  const colWidth = (col) => col.width || DEFAULT_COL_W;
  const tableWidth =
    HANDLE_W + block.columns.reduce((s, c) => s + colWidth(c), 0) + ACTIONS_W;

  // Redimensionnement d'une colonne (comme Excel/Notion) : la largeur est écrite
  // en direct sur le <col> pendant le glissé (aucun re-render, donc fluide), puis
  // validée dans l'état au relâchement. La largeur du <table> suit pour que la
  // barre de défilement horizontale reflète la nouvelle taille.
  const startColResize = (e, col, index) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidth(col);
    const baseTotal = tableWidth;
    // +1 : la 1re colonne du <colgroup> est la poignée de ligne
    const colEl = tableRef.current?.querySelectorAll("colgroup > col")[index + 1];
    let finalW = startW;
    const onMove = (ev) => {
      finalW = Math.max(MIN_COL_W, Math.round(startW + (ev.clientX - startX)));
      if (colEl) colEl.style.width = finalW + "px";
      if (tableRef.current) tableRef.current.style.width = baseTotal - startW + finalW + "px";
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.documentElement.classList.remove("nf-col-resizing");
      mut((b) => {
        const c = b.columns.find((x) => x.id === col.id);
        if (c) c.width = finalW;
      });
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.documentElement.classList.add("nf-col-resizing");
  };

  // ---- Réordonner colonnes / lignes en glissant (comme Notion) ----
  // La ligne d'insertion (dropIndRef) suit le curseur en direct ; au relâchement
  // on réordonne le tableau. Événements souris purs (WKWebView) façon reste de l'app.
  const moveColumn = (from, to) =>
    mut((b) => {
      if (from < 0 || from >= b.columns.length) return;
      const [c] = b.columns.splice(from, 1);
      const t = to > from ? to - 1 : to;
      b.columns.splice(Math.max(0, Math.min(t, b.columns.length)), 0, c);
    });

  const moveRow = (from, to) =>
    mut((b) => {
      if (b.sort) return; // ordre manuel indisponible tant qu'un tri est actif
      if (from < 0 || from >= b.rows.length) return;
      const [r] = b.rows.splice(from, 1);
      const t = to > from ? to - 1 : to;
      b.rows.splice(Math.max(0, Math.min(t, b.rows.length)), 0, r);
    });

  const startColDrag = (e, index) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const wrapR = wrapRef.current.getBoundingClientRect();
    const tableR = tableRef.current.getBoundingClientRect();
    const ind = dropIndRef.current;
    const dataThs = () =>
      [...tableRef.current.querySelectorAll("thead th")].slice(1, 1 + block.columns.length);
    let target = index;
    const place = (clientX) => {
      const ths = dataThs();
      let idx = ths.length;
      for (let i = 0; i < ths.length; i++) {
        const r = ths[i].getBoundingClientRect();
        if (clientX < r.left + r.width / 2) {
          idx = i;
          break;
        }
      }
      target = idx;
      const bx =
        idx < ths.length
          ? ths[idx].getBoundingClientRect().left
          : ths[ths.length - 1].getBoundingClientRect().right;
      ind.style.display = "block";
      ind.style.left = bx - wrapR.left - 1 + "px";
      ind.style.top = tableR.top - wrapR.top + "px";
      ind.style.width = "2px";
      ind.style.height = tableR.height + "px";
    };
    place(e.clientX);
    const onMove = (ev) => place(ev.clientX);
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.documentElement.classList.remove("nf-table-dragging");
      ind.style.display = "none";
      if (target !== index && target !== index + 1) moveColumn(index, target);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.documentElement.classList.add("nf-table-dragging");
  };

  const startRowDrag = (e, index) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const wrapR = wrapRef.current.getBoundingClientRect();
    const tableR = tableRef.current.getBoundingClientRect();
    const ind = dropIndRef.current;
    const rowEls = () => [...tableRef.current.querySelectorAll("tbody tr")];
    let target = index;
    const place = (clientY) => {
      const trs = rowEls();
      let idx = trs.length;
      for (let i = 0; i < trs.length; i++) {
        const r = trs[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) {
          idx = i;
          break;
        }
      }
      target = idx;
      const by =
        idx < trs.length
          ? trs[idx].getBoundingClientRect().top
          : trs[trs.length - 1].getBoundingClientRect().bottom;
      ind.style.display = "block";
      ind.style.top = by - wrapR.top - 1 + "px";
      ind.style.left = tableR.left - wrapR.left + "px";
      ind.style.width = tableR.width + "px";
      ind.style.height = "2px";
    };
    place(e.clientY);
    const onMove = (ev) => place(ev.clientY);
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.documentElement.classList.remove("nf-table-dragging");
      ind.style.display = "none";
      if (target !== index && target !== index + 1) moveRow(index, target);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.documentElement.classList.add("nf-table-dragging");
  };

  const openMenuAt = (kind, e, extra = {}) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu((m) =>
      m && m.kind === kind && m.colId === extra.colId && m.rowId === extra.rowId
        ? null
        : {
            kind,
            x: Math.min(r.left, window.innerWidth - 250),
            y: Math.min(r.bottom + 4, window.innerHeight - 320),
            ...extra,
          }
    );
  };

  // Clic droit (= Ctrl+clic sur Mac) sur une case : menu ancré sur le pointeur.
  const openCellMenu = (e, colId, rowId) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      kind: "cell",
      colId,
      rowId,
      x: Math.min(e.clientX, window.innerWidth - 260),
      y: Math.min(e.clientY, window.innerHeight - 250),
    });
  };

  // `null` retire la surcharge : la case suit de nouveau sa colonne.
  const setCellWrap = (rowId, colId, value) =>
    mut((b) => {
      const r = b.rows.find((x) => x.id === rowId);
      if (!r) return;
      if (value === null) {
        if (!r.wrap) return;
        delete r.wrap[colId];
        if (!Object.keys(r.wrap).length) delete r.wrap;
      } else {
        r.wrap = { ...(r.wrap || {}), [colId]: value };
      }
    });

  // Régler la colonne efface les surcharges de ses cases, sinon le choix
  // resterait sans effet visible là où une case a été réglée à la main.
  const setColWrap = (colId, value) =>
    mut((b) => {
      const c = b.columns.find((x) => x.id === colId);
      if (c) c.wrap = value;
      for (const r of b.rows) {
        if (r.wrap && colId in r.wrap) {
          delete r.wrap[colId];
          if (!Object.keys(r.wrap).length) delete r.wrap;
        }
      }
    });

  const sortedRows = useMemo(() => {
    const rows = [...block.rows];
    if (!block.sort) return rows;
    const col = block.columns.find((c) => c.id === block.sort.colId);
    if (!col) return rows;
    const dir = block.sort.dir === "asc" ? 1 : -1;
    const val = (row) => {
      const v = row.cells[col.id];
      if (v === undefined || v === null || v === "") return null;
      // une cellule « lien de page » n'a pas d'ordre naturel : reléguée en fin
      if (typeof v === "object" && !Array.isArray(v)) return null;
      if (col.type === "number") {
        const n = parseFloat(String(v).replace(",", "."));
        return Number.isNaN(n) ? null : n;
      }
      if (isSelect(col.type)) {
        const labels = (v || [])
          .map((id) => col.options?.find((o) => o.id === id)?.label || "")
          .sort();
        return labels[0] || null;
      }
      return v;
    };
    rows.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "fr", { numeric: true }) * dir;
    });
    return rows;
  }, [block]);

  const setSort = (colId, dir) => mut((b) => (b.sort = dir ? { colId, dir } : null));

  const addColumn = (type) => {
    mut((b) => {
      const def = COL_TYPES.find((c) => c.id === type);
      b.columns.push({
        id: uid(),
        name: def.label,
        type,
        ...(isSelect(type) ? { options: [] } : {}),
      });
    });
  };

  const removeColumn = (colId) =>
    mut((b) => {
      b.columns = b.columns.filter((c) => c.id !== colId);
      if (b.sort?.colId === colId) b.sort = null;
      for (const r of b.rows) delete r.cells[colId];
    });

  const menuCol = menu?.colId ? block.columns.find((c) => c.id === menu.colId) : null;

  // ---- Sélection de lignes (suppression / duplication groupées) ----
  // La sélection est recoupée avec les lignes réellement présentes : une
  // annulation ou une suppression ailleurs ne doit pas laisser de fantômes.
  const selectedIds = useMemo(
    () => block.rows.filter((r) => selected.has(r.id)).map((r) => r.id),
    [block.rows, selected]
  );
  const selCount = selectedIds.length;
  const allSelected = selCount > 0 && selCount === block.rows.length;

  const toggleRow = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(block.rows.map((r) => r.id)));

  const deleteSelected = () => {
    const kill = new Set(selectedIds);
    mut((b) => (b.rows = b.rows.filter((r) => !kill.has(r.id))));
    setSelected(new Set());
  };

  // Les copies sont insérées d'un bloc juste après la dernière ligne
  // sélectionnée, dans leur ordre d'origine.
  const duplicateSelected = () => {
    const pick = new Set(selectedIds);
    mut((b) => {
      const copies = [];
      let at = -1;
      b.rows.forEach((r, i) => {
        if (!pick.has(r.id)) return;
        at = i;
        copies.push({
          id: uid(),
          cells: cloneCells(r.cells),
          ...(r.wrap ? { wrap: { ...r.wrap } } : {}),
        });
      });
      if (copies.length) b.rows.splice(at + 1, 0, ...copies);
    });
    setSelected(new Set());
  };

  return (
    <div ref={wrapRef} className="my-3 group/table relative">
      {/* Barre du haut : options du tableau, et actions groupées dès qu'une
          ligne est cochée (elle reste alors visible sans survol). */}
      <div
        className={`flex items-center gap-1 min-h-6 transition-opacity ${
          selCount ? "" : "opacity-0 group-hover/table:opacity-100"
        }`}
      >
        {selCount > 0 && (
          <>
            <span className="text-[12px] text-ink-light tabular-nums">
              {selCount} ligne{selCount > 1 ? "s" : ""}
            </span>
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] text-ink-light hover:bg-hover"
              onClick={duplicateSelected}
              title="Dupliquer les lignes sélectionnées"
            >
              <Copy size={12} /> Dupliquer
            </button>
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] text-red-500 hover:bg-hover"
              onClick={deleteSelected}
              title="Supprimer les lignes sélectionnées"
            >
              <Trash2 size={12} /> Supprimer
            </button>
            <button
              className="icon-btn w-5 h-5"
              onClick={() => setSelected(new Set())}
              title="Tout désélectionner"
            >
              <X size={12} />
            </button>
          </>
        )}
        <button
          className="icon-btn w-6 h-6 ml-auto"
          onClick={(e) => openMenuAt("table", e)}
          title="Options du tableau"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table
          ref={tableRef}
          className="text-sm border-collapse"
          style={{ tableLayout: "fixed", width: tableWidth }}
        >
          <colgroup>
            <col style={{ width: HANDLE_W }} />
            {block.columns.map((col) => (
              <col key={col.id} style={{ width: colWidth(col) }} />
            ))}
            <col style={{ width: ACTIONS_W }} />
          </colgroup>
          <thead>
            <tr className="border-y border-line">
              <th className="p-0">
                <div className="flex items-center justify-end h-full pr-1.5">
                  <RowCheck
                    checked={allSelected}
                    partial={selCount > 0 && !allSelected}
                    onChange={toggleAll}
                    forceVisible={selCount > 0}
                    hoverGroup="table"
                    title={allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                  />
                </div>
              </th>
              {block.columns.map((col, index) => {
                const Icon = typeIcon(col.type);
                const sorted = block.sort?.colId === col.id ? block.sort.dir : null;
                return (
                  <th
                    key={col.id}
                    className="group/th relative text-left font-normal border-r border-line/60 last:border-r-0"
                  >
                    <div
                      className="nf-col-grip"
                      data-col-resize="1"
                      onPointerDown={(e) => startColDrag(e, index)}
                      title="Glisser pour déplacer la colonne"
                    >
                      <GripHorizontal size={12} />
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 text-ink-light">
                      <Icon size={13} className="shrink-0 text-ink-faint" />
                      <input
                        value={col.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          mut((b) => {
                            const c = b.columns.find((x) => x.id === col.id);
                            if (c) c.name = v;
                          }, `colname:${col.id}`);
                        }}
                        className="flex-1 min-w-0 bg-transparent text-[13px] font-medium outline-none"
                      />
                      {sorted &&
                        (sorted === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      <button
                        className="icon-btn w-5 h-5 shrink-0"
                        title="Options de la colonne"
                        onClick={(e) => openMenuAt("col", e, { colId: col.id })}
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>
                    <div
                      className="nf-col-resizer"
                      data-col-resize="1"
                      onPointerDown={(e) => startColResize(e, col, index)}
                      title="Redimensionner la colonne"
                    />
                  </th>
                );
              })}
              <th>
                <button
                  className="flex items-center gap-1 mx-auto px-2 py-1 rounded text-[12.5px] text-ink-faint hover:bg-hover hover:text-ink-light whitespace-nowrap"
                  title="Ajouter une colonne"
                  onClick={(e) => openMenuAt("addcol", e)}
                >
                  <Plus size={14} /> Colonne
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <tr key={row.id} className="group/row border-b border-line/70 hover:bg-panel/50">
                <td className="p-0 align-middle">
                  <div className="flex items-center gap-0.5 pr-1.5 py-1">
                    {!block.sort ? (
                      <div
                        className="nf-row-grip"
                        data-col-resize="1"
                        onPointerDown={(e) => startRowDrag(e, rowIndex)}
                        title="Glisser pour déplacer la ligne"
                      >
                        <GripVertical size={13} />
                      </div>
                    ) : (
                      // le tri désactive le déplacement manuel : on garde
                      // néanmoins la gouttière pour ne pas décaler les cases
                      <span className="w-[22px] shrink-0" />
                    )}
                    <RowCheck
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      forceVisible={selCount > 0}
                      title="Sélectionner la ligne"
                    />
                  </div>
                </td>
                {block.columns.map((col) => (
                  <Cell
                    key={col.id}
                    col={col}
                    row={row}
                    mut={mut}
                    openMenuAt={openMenuAt}
                    openCellMenu={openCellMenu}
                    pageId={page.id}
                  />
                ))}
                <td className="text-center">
                  <button
                    className="icon-btn w-6 h-6 mx-auto opacity-0 group-hover/row:opacity-100"
                    title="Supprimer la ligne"
                    onClick={() => mut((b) => (b.rows = b.rows.filter((r) => r.id !== row.id)))}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ligne d'insertion pendant un réordonnancement (colonne ou ligne) */}
      <div ref={dropIndRef} className="nf-table-drop" style={{ display: "none" }} />

      <div className="flex items-center border-b border-line/60">
        <button
          className="flex flex-1 items-center gap-1.5 px-2 py-1.5 text-[13px] text-ink-faint hover:bg-hover hover:text-ink-light"
          onClick={() => mut((b) => b.rows.push({ id: uid(), cells: {} }))}
        >
          <Plus size={14} /> Nouvelle ligne
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-ink-faint hover:bg-hover hover:text-ink-light whitespace-nowrap border-l border-line/60"
          title="Ajouter une colonne"
          onClick={(e) => openMenuAt("addcol", e)}
        >
          <Plus size={14} /> Nouvelle colonne
        </button>
      </div>

      {/* ---- Menus flottants (fixed : jamais rognés par l'overflow) ---- */}
      {menu && <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)} />}

      {menu?.kind === "table" && (
        <div className="menu-panel fixed w-52" style={{ left: menu.x, top: menu.y }}>
          <button
            className="menu-item text-red-500"
            onClick={() => removeBlock(page.id, parentBlockId, block.id)}
          >
            <Trash2 size={14} /> Supprimer le tableau
          </button>
        </div>
      )}

      {menu?.kind === "addcol" && (
        <div className="menu-panel fixed w-52" style={{ left: menu.x, top: menu.y }}>
          <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Type de colonne
          </div>
          {COL_TYPES.map((t) => (
            <button
              key={t.id}
              className="menu-item"
              onClick={() => {
                addColumn(t.id);
                setMenu(null);
              }}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      )}

      {menu?.kind === "col" && menuCol && (
        <div className="menu-panel fixed w-52" style={{ left: menu.x, top: menu.y }}>
          <button
            className="menu-item"
            onClick={() => {
              setSort(menuCol.id, "asc");
              setMenu(null);
            }}
          >
            <ArrowUp size={14} /> Tri croissant
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setSort(menuCol.id, "desc");
              setMenu(null);
            }}
          >
            <ArrowDown size={14} /> Tri décroissant
          </button>
          {block.sort?.colId === menuCol.id && (
            <button
              className="menu-item"
              onClick={() => {
                setSort(null, null);
                setMenu(null);
              }}
            >
              <X size={14} /> Effacer le tri
            </button>
          )}
          <div className="my-1 border-t border-line" />
          <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Type
          </div>
          {COL_TYPES.map((t) => (
            <button
              key={t.id}
              className="menu-item"
              onClick={() => {
                mut((b) => {
                  const c = b.columns.find((x) => x.id === menuCol.id);
                  if (!c || c.type === t.id) return;
                  c.type = t.id;
                  if (isSelect(t.id) && !c.options) c.options = [];
                  // Passage en choix unique : les cases qui portaient
                  // plusieurs étiquettes ne gardent que la première, sinon
                  // la colonne afficherait des valeurs impossibles à obtenir.
                  if (t.id === "selectone") {
                    for (const r of b.rows) {
                      const cur = r.cells[c.id];
                      if (Array.isArray(cur) && cur.length > 1) r.cells[c.id] = [cur[0]];
                    }
                  }
                });
                setMenu(null);
              }}
            >
              <t.icon size={14} />
              {t.label}
              {menuCol.type === t.id && <Check size={14} className="ml-auto text-accent" />}
            </button>
          ))}
          {menuCol.type === "text" && (
            <>
              <div className="my-1 border-t border-line" />
              <button
                className="menu-item justify-between"
                onClick={() => {
                  setColWrap(menuCol.id, menuCol.wrap === false);
                  setMenu(null);
                }}
              >
                <span className="flex items-center gap-2.5">
                  <WrapText size={14} /> Revenir à la ligne
                </span>
                {menuCol.wrap !== false && (
                  <Check size={14} className="text-accent shrink-0" />
                )}
              </button>
            </>
          )}
          <div className="my-1 border-t border-line" />
          <button
            className="menu-item text-red-500"
            onClick={() => {
              removeColumn(menuCol.id);
              setMenu(null);
            }}
          >
            <Trash2 size={14} /> Supprimer la colonne
          </button>
        </div>
      )}

      {menu?.kind === "tags" && menuCol && (
        <TagPopover
          menu={menu}
          col={menuCol}
          row={block.rows.find((r) => r.id === menu.rowId)}
          mut={mut}
          close={() => setMenu(null)}
        />
      )}

      {menu?.kind === "cell" && menuCol && (
        <CellMenu
          menu={menu}
          col={menuCol}
          row={block.rows.find((r) => r.id === menu.rowId)}
          setCellWrap={setCellWrap}
          setColWrap={setColWrap}
          close={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// Menu au clic droit (Ctrl+clic sur Mac) d'une case : réglage du retour à la
// ligne, pour la case seule ou pour toute sa colonne.
function CellMenu({ menu, col, row, setCellWrap, setColWrap, close }) {
  if (!row) return null;
  const effectif = cellWraps(col, row);
  const surcharge = typeof row.wrap?.[col.id] === "boolean";
  const colWrap = col.wrap !== false;

  const Ligne = ({ icon: Icon, label, actif, onClick }) => (
    <button
      className="menu-item justify-between"
      onClick={() => {
        onClick();
        close();
      }}
    >
      <span className="flex items-center gap-2.5">
        <Icon size={14} /> {label}
      </span>
      {actif && <Check size={14} className="text-accent shrink-0" />}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={close} />
      <div className="menu-panel fixed w-64 z-50" style={{ left: menu.x, top: menu.y }}>
        <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Cette case
        </div>
        <Ligne
          icon={WrapText}
          label="Revenir à la ligne"
          actif={effectif}
          onClick={() => setCellWrap(row.id, col.id, true)}
        />
        <Ligne
          icon={ArrowRight}
          label="Garder sur une ligne"
          actif={!effectif}
          onClick={() => setCellWrap(row.id, col.id, false)}
        />
        {surcharge && (
          <button
            className="menu-item text-ink-faint"
            onClick={() => {
              setCellWrap(row.id, col.id, null);
              close();
            }}
          >
            <ChevronLeft size={14} /> Suivre la colonne
          </button>
        )}

        <div className="my-1 border-t border-line" />
        <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Colonne « {col.name || "Sans titre"} »
        </div>
        <Ligne
          icon={WrapText}
          label="Revenir à la ligne"
          actif={colWrap}
          onClick={() => setColWrap(col.id, true)}
        />
        <Ligne
          icon={ArrowRight}
          label="Garder sur une ligne"
          actif={!colWrap}
          onClick={() => setColWrap(col.id, false)}
        />
      </div>
    </>
  );
}

// Case à cocher de sélection d'une ligne (et « tout sélectionner » en en-tête).
// Discrète : elle n'apparaît qu'au survol, sauf si elle est cochée ou si une
// sélection est déjà en cours — sinon on perdrait de vue ce qui est coché.
function RowCheck({ checked, partial, onChange, forceVisible, title, hoverGroup = "row" }) {
  const vis =
    forceVisible || checked
      ? "opacity-100"
      : hoverGroup === "table"
        ? "opacity-0 group-hover/table:opacity-100"
        : "opacity-0 group-hover/row:opacity-100";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      title={title}
      aria-pressed={!!checked}
      className={`shrink-0 flex items-center justify-center w-[18px] h-[18px] transition-opacity ${vis}`}
    >
      <span
        className={`flex w-[15px] h-[15px] items-center justify-center rounded-[4px] border-2 transition-colors ${
          checked || partial ? "bg-accent border-accent" : "border-ink-faint/70"
        }`}
      >
        {checked && <Check size={10} strokeWidth={4} className="text-white" />}
        {partial && !checked && <span className="w-[7px] h-[2px] rounded-full bg-white" />}
      </span>
    </button>
  );
}

function Cell({ col, row, mut, openMenuAt, openCellMenu, pageId }) {
  const { state, setView, createPage } = useStore();
  const [pmenu, setPmenu] = useState(null); // { x, y, query } — menu « /page »
  // Retour à la ligne : réglage de la colonne, qu'une case peut surcharger.
  const wrapOn = cellWraps(col, row);

  // `coalesce` : la frappe dans une case se fond en une seule annulation, mais
  // un clic (retirer une étiquette) doit rester une action à part entière.
  const setCell = (value, coalesce = true) =>
    mut((b) => {
      const r = b.rows.find((x) => x.id === row.id);
      if (r) r.cells[col.id] = value;
    }, coalesce ? `cell:${row.id}:${col.id}` : undefined);

  const v = row.cells[col.id];

  if (isSelect(col.type)) {
    const ids = Array.isArray(v) ? v : [];
    const options = col.options || [];
    return (
      <td className="border-r border-line/60 last:border-r-0 align-top">
        <div
          className="flex flex-wrap items-center gap-1 px-2 py-1.5 min-h-[34px] cursor-pointer"
          onClick={(e) => openMenuAt("tags", e, { colId: col.id, rowId: row.id })}
        >
          {ids.map((id) => {
            const o = options.find((x) => x.id === id);
            if (!o) return null;
            return (
              <span
                key={id}
                className="group/chip inline-flex items-center gap-0.5 pl-1.5 pr-1 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                style={tagStyle(o.color)}
              >
                {o.label}
                {/* La croix occupe sa place en permanence : elle n'apparaît
                    qu'au survol, mais sans faire sauter la largeur de la puce. */}
                <button
                  className="nf-chip-x opacity-0 group-hover/chip:opacity-100 focus:opacity-100"
                  title={`Retirer « ${o.label} »`}
                  onClick={(e) => {
                    e.stopPropagation(); // sinon le popover d'étiquettes s'ouvre
                    setCell(
                      ids.filter((x) => x !== id),
                      false
                    );
                  }}
                >
                  <X size={11} strokeWidth={3} />
                </button>
              </span>
            );
          })}
          {ids.length === 0 && <span className="text-ink-faint text-xs">—</span>}
        </div>
      </td>
    );
  }

  if (col.type === "date") {
    return (
      <td className="border-r border-line/60 last:border-r-0">
        <input
          type="date"
          value={typeof v === "string" ? v : ""}
          onChange={(e) => setCell(e.target.value)}
          className="w-full bg-transparent px-2 py-1.5 outline-none text-ink-light"
        />
      </td>
    );
  }

  if (col.type === "number") {
    return (
      <td className="border-r border-line/60 last:border-r-0">
        <input
          value={typeof v === "string" ? v : ""}
          inputMode="decimal"
          onChange={(e) => {
            const raw = e.target.value;
            if (/^-?\d*[.,]?\d*$/.test(raw)) setCell(raw);
          }}
          className="w-full bg-transparent px-2 py-1.5 outline-none text-right tabular-nums"
        />
      </td>
    );
  }

  // ---- Colonne texte : peut aussi contenir un lien de page (via « /page ») ----
  if (v && typeof v === "object" && v.t === "page") {
    const target = state.pages[v.pageId];
    return (
      <td className="border-r border-line/60 last:border-r-0">
        <div className="group/cellpage flex items-center gap-1 px-2 py-1.5">
          <button
            className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
            onClick={() => target && setView({ type: "page", id: v.pageId })}
            title={target ? "Ouvrir la page" : "Page supprimée"}
          >
            {target?.icon ? (
              <PageIcon icon={target.icon} size={14} className="shrink-0" />
            ) : (
              <FileText size={13} className="text-ink-faint shrink-0" />
            )}
            <span className="truncate border-b border-line">
              {target ? target.title || "Sans titre" : "Page supprimée"}
            </span>
          </button>
          <button
            className="icon-btn w-4 h-4 shrink-0 opacity-0 group-hover/cellpage:opacity-100"
            title="Retirer le lien"
            onClick={() => setCell("")}
          >
            <X size={12} />
          </button>
        </div>
      </td>
    );
  }

  const linkPage = (targetId) => {
    setCell({ t: "page", pageId: targetId });
    setPmenu(null);
  };

  return (
    <td
      className="relative border-r border-line/60 last:border-r-0 align-top"
      onContextMenu={(e) => openCellMenu(e, col.id, row.id)}
    >
      <CellText
        value={typeof v === "string" ? v : ""}
        wrap={wrapOn}
        onChange={(raw, el) => {
          setCell(raw);
          // « / » en début de cellule → menu d'insertion de lien de page
          if (raw.startsWith("/")) {
            const r = el.getBoundingClientRect();
            setPmenu({ x: r.left, y: r.bottom + 4, query: raw.slice(1) });
          } else {
            setPmenu(null);
          }
        }}
        onEscape={() => {
          if (pmenu) {
            setPmenu(null);
            return true; // Échap consommé par le menu
          }
          return false;
        }}
      />
      {pmenu && (
        <CellPageMenu
          pos={pmenu}
          query={pmenu.query}
          pages={Object.values(state.pages)}
          onPick={linkPage}
          onNew={() => linkPage(createPage(pageId, ""))}
          onClose={() => setPmenu(null)}
        />
      )}
    </td>
  );
}

// Champ d'une cellule texte. C'est un <textarea> et non un <input> : un input
// est mono-ligne par construction et ne peut PAS revenir à la ligne.
//
// Deux modes, selon `wrap` :
//  • true  — le texte revient à la ligne et la case grandit (hauteur = contenu) ;
//  • false — la case garde la hauteur d'une ligne quel que soit le texte. Au
//            clic, le champ se déploie PAR-DESSUS les cases voisines (façon
//            Excel) pour montrer l'intégralité du texte sans déformer la ligne.
function CellText({ value, wrap, onChange, onEscape }) {
  const ref = useRef(null);
  const [editing, setEditing] = useState(false);
  const [clipped, setClipped] = useState(false); // du texte est masqué à droite

  // Le déploiement montre tout ; sinon on suit le réglage.
  const expanded = wrap || editing;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (expanded) {
      // hauteur = contenu (remise à zéro d'abord, sinon scrollHeight ne rétrécit jamais)
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      setClipped(false);
    } else {
      el.style.height = "";
      setClipped(el.scrollWidth > el.clientWidth + 1);
    }
  }, [value, expanded]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value, e.target)}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (onEscape()) {
            e.preventDefault();
            return;
          }
          e.currentTarget.blur();
          return;
        }
        // Un retour à la ligne n'a de sens que là où il peut s'afficher :
        // dans une colonne qui ne s'agrandit pas, Entrée valide et sort.
        if (e.key === "Enter" && !e.shiftKey && !wrap) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={`block w-full px-2 py-1.5 outline-none resize-none overflow-hidden ${
        expanded ? "whitespace-pre-wrap break-words" : "whitespace-pre"
      } ${
        // Déployé au-dessus des cases voisines : le fond DOIT être opaque.
        // `bg-transparent` et `bg-card` ne peuvent pas cohabiter dans la liste
        // de classes — à spécificité égale c'est l'ordre du CSS généré qui
        // tranche, pas celui de la liste, et le texte du dessous transparaît.
        !wrap && editing
          ? "absolute left-0 right-0 top-0 z-30 bg-card rounded shadow-lg ring-1 ring-line"
          : "bg-transparent"
      }`}
      style={clipped ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
    />
  );
}

// Dégradé de fin de ligne : signale qu'il reste du texte au-delà du bord.
const FADE = "linear-gradient(to right, #000 calc(100% - 20px), transparent)";

// Menu déclenché par « / » dans une cellule texte : une commande « Lien vers une
// page » puis un sélecteur de page (recherche + liste). Sobre, en fixed.
function CellPageMenu({ pos, query, pages, onPick, onNew, onClose }) {
  const [mode, setMode] = useState("cmd"); // "cmd" | "pick"
  const style = {
    left: Math.max(8, Math.min(pos.x, window.innerWidth - 270)),
    top: Math.min(pos.y, window.innerHeight - 330),
  };
  const cmdShown = !query || "page lien vers une sous-page".includes(query.toLowerCase());

  if (mode === "pick") {
    return (
      <PagePicker
        pos={pos}
        heading="Lier une page"
        pages={pages}
        onPick={onPick}
        onNew={onNew}
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="menu-panel fixed z-50 w-60" style={style}>
        <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Insérer
        </div>
        {cmdShown ? (
          <button
            className="menu-item"
            onMouseDown={(e) => {
              e.preventDefault();
              setMode("pick");
            }}
          >
            <FileText size={15} className="text-ink-light shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm text-ink">Lien vers une page</span>
              <span className="block text-xs text-ink-faint">Insérer un lien cliquable</span>
            </span>
          </button>
        ) : (
          <div className="px-3 py-2 text-[13px] text-ink-faint">Aucune commande</div>
        )}
      </div>
    </>
  );
}

function TagPopover({ menu, col, row, mut, close }) {
  const single = col.type === "selectone";
  const [input, setInput] = useState("");
  const [editId, setEditId] = useState(null); // étiquette en cours de modification
  const origLabel = useRef(""); // nom d'avant l'édition (restauré si vidé)
  if (!row) return null;
  const raw = row.cells[col.id];
  const ids = Array.isArray(raw) ? raw : [];
  const options = col.options || [];

  // Modifie une étiquette DANS la colonne : le changement se propage
  // automatiquement à toutes les lignes qui la portent (elles ne stockent
  // qu'un id).
  const editOption = (optId, fn, coalesceKey) =>
    mut((b) => {
      const c = b.columns.find((x) => x.id === col.id);
      const o = c?.options?.find((x) => x.id === optId);
      if (o) fn(o);
    }, coalesceKey);

  const renameTag = (optId, label) =>
    editOption(optId, (o) => (o.label = label), `tag:${optId}`);

  const recolorTag = (optId, color) =>
    editOption(optId, (o) => (o.color = { ...color }));

  const openEdit = (o) => {
    origLabel.current = o.label;
    setEditId(o.id);
  };

  const closeEdit = () => {
    const cur = options.find((o) => o.id === editId);
    // Une étiquette sans nom serait invisible : on remet l'ancien.
    if (cur && !cur.label.trim()) renameTag(cur.id, origLabel.current);
    setEditId(null);
  };

  // En choix unique, sélectionner remplace au lieu d'ajouter (et re-cliquer
  // l'étiquette déjà posée la retire), puis le panneau se referme : il n'y a
  // plus rien à y faire.
  const toggleTag = (optId) => {
    mut((b) => {
      const r = b.rows.find((x) => x.id === row.id);
      if (!r) return;
      const cur = Array.isArray(r.cells[col.id]) ? r.cells[col.id] : [];
      if (single) {
        r.cells[col.id] = cur.includes(optId) ? [] : [optId];
      } else {
        r.cells[col.id] = cur.includes(optId)
          ? cur.filter((x) => x !== optId)
          : [...cur, optId];
      }
    });
    if (single) close();
  };

  const createTag = () => {
    const label = input.trim();
    if (!label) return;
    const existing = options.find((o) => o.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      if (!ids.includes(existing.id)) toggleTag(existing.id);
    } else {
      // Copie de la couleur (jamais la référence du module, qui serait alors
      // partagée par toutes les étiquettes de la même teinte).
      const opt = {
        id: uid(),
        label,
        color: { ...TAG_PALETTE[options.length % TAG_PALETTE.length] },
      };
      mut((b) => {
        const c = b.columns.find((x) => x.id === col.id);
        if (!c) return;
        c.options = [...(c.options || []), opt];
        const r = b.rows.find((x) => x.id === row.id);
        if (!r) return;
        const cur = Array.isArray(r.cells[col.id]) ? r.cells[col.id] : [];
        r.cells[col.id] = single ? [opt.id] : [...cur, opt.id];
      });
      if (single) close();
    }
    setInput("");
  };

  // Mode « modifier une étiquette » : renommage + choix de la couleur de fond.
  const editing = options.find((o) => o.id === editId);
  if (editing) {
    const curBg = tagColor(editing.color).bg;
    return (
      <div className="menu-panel fixed w-56" style={{ left: menu.x, top: menu.y }}>
        <button className="menu-item text-ink-light" onClick={closeEdit}>
          <ChevronLeft size={14} /> Retour
        </button>
        <div className="px-2 py-1.5">
          <input
            autoFocus
            value={editing.label}
            onChange={(e) => renameTag(editing.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") closeEdit();
            }}
            placeholder="Nom de l'étiquette"
            className="w-full border border-line rounded px-2 py-1 text-[13px] outline-none focus:border-accent bg-transparent"
          />
        </div>
        <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Couleur
        </div>
        <div className="grid grid-cols-4 gap-1.5 px-2 pb-2">
          {TAG_PALETTE.map((p) => (
            <button
              key={p.bg}
              title={p.name}
              onClick={() => recolorTag(editing.id, p)}
              className="h-7 rounded flex items-center justify-center ring-offset-1 ring-offset-card hover:ring-2 hover:ring-ink-faint"
              style={{ backgroundColor: p.bg }}
            >
              {curBg === p.bg && <Check size={14} color="#fff" />}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="menu-panel fixed w-56" style={{ left: menu.x, top: menu.y }}>
      <div className="px-2 pb-1.5 pt-0.5">
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createTag()}
          placeholder="Chercher ou créer…"
          className="w-full border border-line rounded px-2 py-1 text-[13px] outline-none focus:border-accent bg-transparent"
        />
      </div>
      {options
        .filter((o) => !input.trim() || o.label.toLowerCase().includes(input.toLowerCase()))
        .map((o) => (
          // Le « ⋯ » est posé PAR-DESSUS la ligne (et non dedans) : un bouton
          // ne peut pas en contenir un autre.
          <div key={o.id} className="relative group/tag">
            <button
              className="menu-item justify-between pr-14"
              onClick={() => toggleTag(o.id)}
            >
              <span
                className="px-1.5 py-0.5 rounded text-xs font-medium truncate"
                style={tagStyle(o.color)}
              >
                {o.label}
              </span>
              {ids.includes(o.id) && <Check size={14} className="text-accent shrink-0" />}
            </button>
            <button
              title="Modifier l'étiquette"
              onClick={() => openEdit(o)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-ink-faint opacity-0 group-hover/tag:opacity-100 hover:bg-hover hover:text-ink"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        ))}
      {input.trim() &&
        !options.some((o) => o.label.toLowerCase() === input.trim().toLowerCase()) && (
          <button className="menu-item" onClick={createTag}>
            <Plus size={14} /> Créer «&nbsp;{input.trim()}&nbsp;»
          </button>
        )}
    </div>
  );
}
