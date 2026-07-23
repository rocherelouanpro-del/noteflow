import React, { useState } from "react";
import {
  Check,
  Trash2,
  Copy,
  CornerUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  FileText,
} from "lucide-react";
import { TURN_INTO_ITEMS } from "./SlashMenu";
import PageIcon from "./PageIcon";

// Menu ouvert au clic sur la poignée d'un bloc : Transformer en, Dupliquer,
// Déplacer vers (une autre page), Supprimer. items est déjà filtré selon le
// contexte (pas de toggle dans un toggle).
export default function BlockMenu({
  pos,
  current,
  items,
  pages = [],
  currentPageId,
  onTransform,
  onDuplicate,
  onMoveTo,
  onMoveToNew,
  onDelete,
  onClose,
}) {
  const [mode, setMode] = useState("main"); // "main" | "move"
  const [q, setQ] = useState("");

  const style = {
    left: Math.max(8, Math.min(pos.x, window.innerWidth - 260)),
    top: Math.min(pos.y, window.innerHeight - 360),
  };

  // ---- Sous-menu « Déplacer vers » : recherche + liste des pages ----
  if (mode === "move") {
    const list = pages
      .filter((p) => p.id !== currentPageId)
      .filter((p) => (p.title || "Sans titre").toLowerCase().includes(q.trim().toLowerCase()));
    return (
      <>
        <div className="fixed inset-0 z-40" onMouseDown={onClose} />
        <div
          className="menu-panel fixed z-50 w-64 max-h-80 overflow-hidden flex flex-col"
          style={style}
        >
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-line shrink-0">
            <button
              className="icon-btn w-6 h-6 shrink-0"
              onClick={() => setMode("main")}
              title="Retour"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Déplacer vers
            </span>
          </div>
          <div className="px-2 py-1.5 shrink-0">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher une page…"
              className="w-full border border-line rounded px-2 py-1 text-[13px] bg-transparent outline-none focus:border-accent"
            />
          </div>
          <div className="overflow-y-auto pb-1">
            <button className="menu-item text-accent" onClick={onMoveToNew}>
              <Plus size={15} className="shrink-0" /> Nouvelle page
            </button>
            {list.length === 0 && (
              <div className="px-3 py-2 text-[13px] text-ink-faint">Aucune autre page</div>
            )}
            {list.map((p) => (
              <button key={p.id} className="menu-item" onClick={() => onMoveTo(p.id)}>
                {p.icon ? (
                  <PageIcon icon={p.icon} size={16} className="shrink-0" />
                ) : (
                  <FileText size={15} className="text-ink-faint shrink-0" />
                )}
                <span className="flex-1 truncate text-left">{p.title || "Sans titre"}</span>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ---- Menu principal ----
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="menu-panel fixed z-50 w-56 max-h-80 overflow-y-auto" style={style}>
        {items.length > 0 && (
          <>
            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Transformer en
            </div>
            {items.map((it) => (
              <button key={it.type} className="menu-item" onClick={() => onTransform(it.type)}>
                <it.icon size={15} className="text-ink-light shrink-0" />
                <span className="flex-1 text-left">{it.label}</span>
                {current === it.type && <Check size={14} className="text-accent shrink-0" />}
              </button>
            ))}
            <div className="h-px bg-line my-1.5" />
          </>
        )}
        <button className="menu-item" onClick={onDuplicate}>
          <Copy size={15} className="shrink-0 text-ink-light" /> Dupliquer
        </button>
        <button className="menu-item" onClick={() => setMode("move")}>
          <CornerUpRight size={15} className="shrink-0 text-ink-light" />
          <span className="flex-1 text-left">Déplacer vers</span>
          <ChevronRight size={14} className="text-ink-faint shrink-0" />
        </button>
        <div className="h-px bg-line my-1.5" />
        <button className="menu-item text-red-600" onClick={onDelete}>
          <Trash2 size={15} className="shrink-0" /> Supprimer
        </button>
      </div>
    </>
  );
}

export { TURN_INTO_ITEMS };
