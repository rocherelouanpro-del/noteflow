import React, { useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { useStore } from "../store";
import { uid, TAG_PALETTE, tagStyle, tagColor } from "../utils";
import PageIcon from "./PageIcon";
import PagePicker from "./PagePicker";

const COL_TYPES = [
  { id: "text", label: "Texte", icon: Type },
  { id: "number", label: "Nombre", icon: Hash },
  { id: "date", label: "Date", icon: Calendar },
  { id: "select", label: "Choix multiple", icon: Tag },
];

const typeIcon = (t) => COL_TYPES.find((c) => c.id === t)?.icon || Type;

// Largeur des colonnes (façon Excel/Notion)
const DEFAULT_COL_W = 180; // colonne sans largeur définie
const MIN_COL_W = 60; // largeur minimale au glissé
const ACTIONS_W = 120; // colonne de fin (bouton + / suppression de ligne)
const HANDLE_W = 26; // colonne de gauche : poignée de déplacement de ligne

export default function TableBlock({ page, parentBlockId, block }) {
  const { updateBlockWith, removeBlock } = useStore();
  // Menu unique, positionné en fixed (échappe à l'overflow-x du tableau) :
  // { kind: "col" | "addcol" | "tags" | "table", colId?, rowId?, x, y }
  const [menu, setMenu] = useState(null);

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
      if (col.type === "select") {
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
        ...(type === "select" ? { options: [] } : {}),
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

  return (
    <div ref={wrapRef} className="my-3 group/table relative">
      <div className="flex items-center justify-end h-6 opacity-0 group-hover/table:opacity-100 transition-opacity">
        <button
          className="icon-btn w-6 h-6"
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
              <th className="p-0" />
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
                  {!block.sort && (
                    <div
                      className="nf-row-grip"
                      data-col-resize="1"
                      onPointerDown={(e) => startRowDrag(e, rowIndex)}
                      title="Glisser pour déplacer la ligne"
                    >
                      <GripVertical size={13} />
                    </div>
                  )}
                </td>
                {block.columns.map((col) => (
                  <Cell
                    key={col.id}
                    col={col}
                    row={row}
                    mut={mut}
                    openMenuAt={openMenuAt}
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
                  if (t.id === "select" && !c.options) c.options = [];
                });
                setMenu(null);
              }}
            >
              <t.icon size={14} />
              {t.label}
              {menuCol.type === t.id && <Check size={14} className="ml-auto text-accent" />}
            </button>
          ))}
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
        />
      )}
    </div>
  );
}

function Cell({ col, row, mut, openMenuAt, pageId }) {
  const { state, setView, createPage } = useStore();
  const [pmenu, setPmenu] = useState(null); // { x, y, query } — menu « /page »

  const setCell = (value) =>
    mut((b) => {
      const r = b.rows.find((x) => x.id === row.id);
      if (r) r.cells[col.id] = value;
    }, `cell:${row.id}:${col.id}`);

  const v = row.cells[col.id];

  if (col.type === "select") {
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
                className="px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                style={tagStyle(o.color)}
              >
                {o.label}
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
    <td className="relative border-r border-line/60 last:border-r-0">
      <input
        value={typeof v === "string" ? v : ""}
        onChange={(e) => {
          const raw = e.target.value;
          setCell(raw);
          // « / » en début de cellule → menu d'insertion de lien de page
          if (raw.startsWith("/")) {
            const r = e.target.getBoundingClientRect();
            setPmenu({ x: r.left, y: r.bottom + 4, query: raw.slice(1) });
          } else {
            setPmenu(null);
          }
        }}
        onKeyDown={(e) => {
          if (pmenu && e.key === "Escape") {
            e.preventDefault();
            setPmenu(null);
          }
        }}
        className="w-full bg-transparent px-2 py-1.5 outline-none"
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

function TagPopover({ menu, col, row, mut }) {
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

  const toggleTag = (optId) =>
    mut((b) => {
      const r = b.rows.find((x) => x.id === row.id);
      if (!r) return;
      const cur = Array.isArray(r.cells[col.id]) ? r.cells[col.id] : [];
      r.cells[col.id] = cur.includes(optId)
        ? cur.filter((x) => x !== optId)
        : [...cur, optId];
    });

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
        r.cells[col.id] = [...cur, opt.id];
      });
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
