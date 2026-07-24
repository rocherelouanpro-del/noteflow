import React, { useState } from "react";
import { FileText, Plus } from "lucide-react";
import PageIcon from "./PageIcon";

// Sélecteur de page réutilisable (recherche + liste), en fixed pour ne jamais
// être rogné. Utilisé par le slash « Lien vers une page existante » et par les
// cellules de tableau. `onNew` est optionnel : sans lui, pas de création.
export default function PagePicker({
  pos,
  pages,
  excludeId,
  onPick,
  onNew,
  onClose,
  heading = "Lier une page",
}) {
  const [q, setQ] = useState("");

  const style = {
    left: Math.max(8, Math.min(pos.x, window.innerWidth - 270)),
    top: Math.min(pos.y, window.innerHeight - 330),
  };

  const list = pages
    .filter((p) => p.id !== excludeId)
    .filter((p) => (p.title || "Sans titre").toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div
        className="menu-panel fixed z-50 w-64 max-h-72 overflow-hidden flex flex-col"
        style={style}
      >
        <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint shrink-0">
          {heading}
        </div>
        <div className="px-2 pb-1.5 shrink-0">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Chercher une page…"
            className="w-full border border-line rounded px-2 py-1 text-[13px] bg-transparent outline-none focus:border-accent"
          />
        </div>
        <div className="overflow-y-auto pb-1">
          {onNew && (
            <button
              className="menu-item text-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onNew}
            >
              <Plus size={15} className="shrink-0" /> Nouvelle page
            </button>
          )}
          {list.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-ink-faint">Aucune page</div>
          )}
          {list.map((p) => (
            <button
              key={p.id}
              className="menu-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(p.id)}
            >
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
