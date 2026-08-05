import React, { useRef, useState } from "react";
import {
  ChevronRight,
  FileText,
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  NotebookPen,
  CheckCircle2,
  PieChart,
  Sun,
  Moon,
  PanelLeftClose,
  Pin,
  PinOff,
  SquareArrowOutUpRight,
} from "lucide-react";
import { useStore, childrenOf } from "../store";
import PageIcon from "./PageIcon";

const SIDEBAR_MIN = 190;
const SIDEBAR_MAX = 460;

export default function Sidebar() {
  const {
    state,
    view,
    setView,
    openInNewTab,
    createPage,
    movePage,
    toggleTheme,
    toggleSidebar,
    setSidebarWidth,
  } = useStore();
  const dark = state.theme === "dark";
  const asideRef = useRef(null);
  const width = state.ui?.sidebarWidth ?? 256;
  const [expanded, setExpanded] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [dropPageId, setDropPageId] = useState(null); // cible surlignée du glissé

  // Glisser une page SUR une autre → elle devient sa sous-page (comme Notion).
  // Événements souris purs (HTML5 DnD inopérant en WKWebView), seuil 5px pour
  // ne pas gêner le clic de navigation ; Échap annule.
  const beginPageDrag = (e, pg) => {
    if (e.button !== 0) return;
    if (e.target.closest("button, input")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    // cibles interdites : la page elle-même et tous ses descendants (cycle)
    const forbidden = new Set([pg.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of Object.values(state.pages)) {
        if (p.parentId && forbidden.has(p.parentId) && !forbidden.has(p.id)) {
          forbidden.add(p.id);
          grew = true;
        }
      }
    }
    let started = false;
    let ghost = null;
    let target = null;
    // Au doigt, la ligne est AUSSI la surface de défilement : un glissé
    // immédiat ferait donc bouger la page au lieu de défiler. On exige un
    // appui long (geste mobile habituel) ; tout mouvement avant la fin du
    // délai est interprété comme un défilement et annule le déplacement.
    const isTouch = e.pointerType === "touch";
    let armed = !isTouch;
    const longPress = isTouch
      ? setTimeout(() => {
          armed = true;
          // vibration légère : confirme que le déplacement est amorcé
          navigator.vibrate?.(15);
        }, 450)
      : null;
    const cleanup = () => {
      clearTimeout(longPress);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("keydown", onKey, true);
      ghost?.remove();
      document.body.style.userSelect = "";
      setDropPageId(null);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        target = null;
        cleanup();
      }
    };
    const onMove = (ev) => {
      if (!isTouch && !(ev.buttons & 1)) {
        target = null;
        cleanup();
        return;
      }
      const moved = Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY);
      if (!armed) {
        // le doigt bouge avant la fin de l'appui long → c'est un défilement
        if (moved > 10) {
          target = null;
          cleanup();
        }
        return;
      }
      if (!started) {
        if (moved < (isTouch ? 10 : 5)) return;
        started = true;
        document.body.style.userSelect = "none";
        ghost = document.createElement("div");
        ghost.className = "nf-drag-ghost";
        ghost.textContent = (pg.icon && !/^(data:|https?:|blob:)/.test(pg.icon) ? pg.icon + " " : "") + (pg.title || "Sans titre");
        document.body.appendChild(ghost);
      }
      ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 8}px)`;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el?.closest?.("[data-page-row]");
      const id = row?.dataset.pageRow || null;
      target = id && !forbidden.has(id) ? id : null;
      setDropPageId(target);
    };
    const onUp = () => {
      const t = started ? target : null;
      cleanup();
      if (t) {
        movePage(pg.id, t);
        setExpanded((x) => ({ ...x, [t]: true }));
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.addEventListener("keydown", onKey, true);
  };

  const addRootPage = () => {
    const id = createPage(null, "");
    setView({ type: "page", id });
    setEditingId(id);
  };

  // Cmd/Ctrl+clic et clic du milieu ouvrent dans un nouvel onglet, comme dans
  // un navigateur ; le clic simple navigue dans l'onglet courant.
  const openView = (e, v) => {
    if (e.metaKey || e.ctrlKey || e.button === 1) {
      e.preventDefault();
      openInNewTab(v);
    } else {
      setView(v);
    }
  };
  const openPage = (e, id) => openView(e, { type: "page", id });

  // Redimensionnement façon Notion/Excel : largeur appliquée en direct au DOM
  // pendant le glissé (pas de re-render), puis validée dans l'état au relâchement.
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let finalW = startW;
    const onMove = (ev) => {
      finalW = Math.max(
        SIDEBAR_MIN,
        Math.min(SIDEBAR_MAX, Math.round(startW + (ev.clientX - startX)))
      );
      if (asideRef.current) asideRef.current.style.width = finalW + "px";
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.documentElement.classList.remove("nf-col-resizing");
      setSidebarWidth(finalW);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.documentElement.classList.add("nf-col-resizing");
  };

  const treeProps = {
    expanded,
    setExpanded,
    editingId,
    setEditingId,
    menuId,
    setMenuId,
    beginPageDrag,
    dropPageId,
    openPage,
  };

  return (
    <aside
      ref={asideRef}
      className="relative shrink-0 bg-panel border-r border-line flex flex-col select-none"
      style={{ width }}
    >
      <div className="flex items-center gap-2 px-4 h-14 shrink-0">
        <NotebookPen size={18} className="text-ink-light" />
        <span className="font-semibold text-[15px] flex-1">Noteflow</span>
        <button
          className="icon-btn w-7 h-7"
          onClick={toggleTheme}
          title={dark ? "Passer en mode clair" : "Passer en mode sombre"}
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          className="icon-btn w-7 h-7"
          onClick={toggleSidebar}
          title="Replier la barre latérale"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <PinnedSection openPage={openPage} />

        <SectionLabel>Habitudes</SectionLabel>
        <NavItem
          active={view.type === "habits"}
          onClick={(e) => openView(e, { type: "habits" })}
          icon={<CheckCircle2 size={15} className="text-emerald-600" />}
          label="Suivi de mes habitudes"
        />
        <NavItem
          active={view.type === "global"}
          onClick={(e) => openView(e, { type: "global" })}
          icon={<PieChart size={15} className="text-violet-500" />}
          label="Vue globale"
        />

        <SectionLabel>
          <span className="flex-1">Pages</span>
          <button
            className="icon-btn w-5 h-5"
            onClick={addRootPage}
            title="Nouvelle page"
          >
            <Plus size={14} />
          </button>
        </SectionLabel>
        <PageTree parentId={null} depth={0} {...treeProps} />
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 mt-1 rounded text-[13.5px] text-ink-faint hover:bg-hover"
          onClick={addRootPage}
        >
          <Plus size={14} />
          Nouvelle page
        </button>
      </nav>

      {/* Poignée de redimensionnement (bord droit) */}
      <div className="nf-sidebar-resizer" onPointerDown={startResize} title="Redimensionner" />
    </aside>
  );
}

// Raccourcis vers les pages épinglées, en tête de barre latérale. Liste plate
// et volontairement sans arborescence : c'est un accès direct, pas une 2e vue
// de la hiérarchie. Masquée tant que rien n'est épinglé.
function PinnedSection({ openPage }) {
  const { state, view, togglePin } = useStore();
  const pinned = (state.ui?.pinned || [])
    .map((id) => state.pages[id])
    .filter(Boolean);
  if (pinned.length === 0) return null;

  return (
    <>
      <SectionLabel>Épinglés</SectionLabel>
      {pinned.map((p) => {
        const isActive = view.type === "page" && view.id === p.id;
        return (
          <div
            key={p.id}
            className={`group flex items-center gap-1.5 pl-2 pr-1 py-[3px] rounded cursor-pointer text-[13.5px] text-ink-light hover:bg-hover ${
              isActive ? "bg-hover font-medium text-ink" : ""
            }`}
            onClick={(e) => openPage(e, p.id)}
            onAuxClick={(e) => e.button === 1 && openPage(e, p.id)}
          >
            {p.icon ? (
              <PageIcon icon={p.icon} size={14} className="w-[15px] text-center shrink-0" />
            ) : (
              <FileText size={14} className="shrink-0 text-ink-faint" />
            )}
            <span className="flex-1 truncate">{p.title || "Sans titre"}</span>
            <button
              className="icon-btn w-5 h-5 shrink-0 hidden group-hover:flex"
              title="Ne plus épingler"
              onClick={(e) => {
                e.stopPropagation();
                togglePin(p.id);
              }}
            >
              <PinOff size={13} />
            </button>
          </div>
        );
      })}
    </>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center px-2 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
      {children}
    </div>
  );
}

function NavItem({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      onAuxClick={(e) => e.button === 1 && onClick(e)}
      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-[13.5px] text-ink-light hover:bg-hover ${
        active ? "bg-hover font-medium text-ink" : ""
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function PageTree({ parentId, depth, ...props }) {
  const { state } = useStore();
  const pages = childrenOf(state.pages, parentId);
  if (pages.length === 0 && parentId) {
    return (
      <div
        className="py-1 text-[12.5px] text-ink-faint italic"
        style={{ paddingLeft: depth * 14 + 26 }}
      >
        Aucune sous-page
      </div>
    );
  }
  return pages.map((p) => <PageNode key={p.id} page={p} depth={depth} {...props} />);
}

function PageNode({ page, depth, expanded, setExpanded, editingId, setEditingId, menuId, setMenuId, beginPageDrag, dropPageId, openPage }) {
  const { state, view, setView, createPage, renamePage, deletePage, togglePin, openInNewTab } =
    useStore();
  const isPinned = !!state.ui?.pinned?.includes(page.id);
  const isOpen = !!expanded[page.id];
  const isActive = view.type === "page" && view.id === page.id;
  const hasChildren = childrenOf(state.pages, page.id).length > 0;
  const isDropTarget = dropPageId === page.id;

  const addChild = (e) => {
    e.stopPropagation();
    const id = createPage(page.id, "");
    setExpanded((x) => ({ ...x, [page.id]: true }));
    setView({ type: "page", id });
    setEditingId(id);
  };

  return (
    <div>
      <div
        data-page-row={page.id}
        className={`group flex items-center gap-1 pr-1 py-[3px] rounded cursor-pointer text-[13.5px] text-ink-light hover:bg-hover relative ${
          isActive ? "bg-hover font-medium text-ink" : ""
        } ${isDropTarget ? "bg-accent/15 ring-1 ring-inset ring-accent/60" : ""}`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={(e) => openPage(e, page.id)}
        onAuxClick={(e) => e.button === 1 && openPage(e, page.id)}
        onPointerDown={(e) => beginPageDrag(e, page)}
      >
        <button
          className="icon-btn w-5 h-5 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => ({ ...x, [page.id]: !isOpen }));
          }}
          title={isOpen ? "Replier" : "Déplier"}
        >
          <ChevronRight
            size={13}
            className={`transition-transform ${isOpen ? "rotate-90" : ""} ${
              hasChildren ? "" : "opacity-40"
            }`}
          />
        </button>
        {page.icon ? (
          <PageIcon icon={page.icon} size={14} className="w-[15px] text-center shrink-0" />
        ) : (
          <FileText size={14} className="shrink-0 text-ink-faint" />
        )}
        {editingId === page.id ? (
          <input
            autoFocus
            defaultValue={page.title}
            placeholder="Sans titre"
            className="flex-1 min-w-0 bg-card border border-accent/50 rounded px-1 text-[13px] outline-none"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              renamePage(page.id, e.target.value.trim());
              setEditingId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.target.blur();
            }}
          />
        ) : (
          <span className="flex-1 truncate">{page.title || "Sans titre"}</span>
        )}

        <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <button
            className="icon-btn w-5 h-5"
            title="Options"
            onClick={(e) => {
              e.stopPropagation();
              setMenuId(menuId === page.id ? null : page.id);
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          <button className="icon-btn w-5 h-5" title="Ajouter une sous-page" onClick={addChild}>
            <Plus size={14} />
          </button>
        </span>

        {menuId === page.id && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setMenuId(null);
              }}
            />
            <div className="menu-panel absolute left-8 top-6 w-56">
              <button
                className="menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(null);
                  openInNewTab({ type: "page", id: page.id });
                }}
              >
                <SquareArrowOutUpRight size={14} /> Ouvrir dans un nouvel onglet
              </button>
              <button
                className="menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(null);
                  togglePin(page.id);
                }}
              >
                {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                {isPinned ? "Ne plus épingler" : "Épingler"}
              </button>
              <div className="my-1 border-t border-line" />
              <button
                className="menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(null);
                  setEditingId(page.id);
                }}
              >
                <Pencil size={14} /> Renommer
              </button>
              <button
                className="menu-item text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(null);
                  deletePage(page.id);
                }}
              >
                <Trash2 size={14} /> Supprimer
              </button>
            </div>
          </>
        )}
      </div>
      {isOpen && (
        <PageTree
          parentId={page.id}
          depth={depth + 1}
          expanded={expanded}
          setExpanded={setExpanded}
          editingId={editingId}
          setEditingId={setEditingId}
          menuId={menuId}
          setMenuId={setMenuId}
          beginPageDrag={beginPageDrag}
          dropPageId={dropPageId}
          openPage={openPage}
        />
      )}
    </div>
  );
}
