import React, { useEffect, useRef } from "react";
import {
  Type,
  FileText,
  ChevronRight,
  Heading1,
  Heading2,
  Heading3,
  List,
  Table,
  Columns2,
  Columns3,
  Columns4,
  ListCollapse,
  Smile,
  Image as ImageIcon,
  Paperclip,
  Link2,
} from "lucide-react";

export const SLASH_ITEMS = [
  { id: "text", label: "Texte", desc: "Un simple paragraphe", icon: Type, kw: "texte paragraphe text" },
  { id: "bullet", label: "Liste à puces", desc: "Une liste simple à puces", icon: List, kw: "liste puces bullet list tiret -" },
  { id: "emoji", label: "Emoji", desc: "Insérer un emoji dans le texte", icon: Smile, kw: "emoji emoticone smiley symbole inserer" },
  { id: "image", label: "Image", desc: "Importer une image redimensionnable", icon: ImageIcon, kw: "image photo picture img capture" },
  { id: "file", label: "Fichier", desc: "Lien vers un fichier de l'ordinateur", icon: Paperclip, kw: "fichier file document pdf piece jointe lien attachement" },
  { id: "page", label: "Page", desc: "Créer une sous-page", icon: FileText, kw: "page sous-page subpage" },
  { id: "linkpage", label: "Lien vers une page existante", desc: "Afficher une page déjà créée ici aussi", icon: Link2, kw: "lien link page existante reference raccourci alias deux endroits" },
  { id: "toggle", label: "Liste dépliante", desc: "Contenu repliable", icon: ChevronRight, kw: "toggle depliante liste pliable" },
  { id: "heading1", label: "Titre 1", desc: "Grand titre de section", icon: Heading1, kw: "heading 1 h1 titre" },
  { id: "heading2", label: "Titre 2", desc: "Titre moyen", icon: Heading2, kw: "heading 2 h2 titre" },
  { id: "heading3", label: "Titre 3", desc: "Petit titre", icon: Heading3, kw: "heading 3 h3 titre" },
  { id: "toggle-h1", label: "Titre 1 dépliant", desc: "Grand titre repliable", icon: ListCollapse, kw: "toggle titre 1 depliant heading h1 pliable" },
  { id: "toggle-h2", label: "Titre 2 dépliant", desc: "Titre moyen repliable", icon: ListCollapse, kw: "toggle titre 2 depliant heading h2 pliable" },
  { id: "toggle-h3", label: "Titre 3 dépliant", desc: "Petit titre repliable", icon: ListCollapse, kw: "toggle titre 3 depliant heading h3 pliable" },
  { id: "table", label: "Tableau", desc: "Base de données : texte, nombre, date, tags", icon: Table, kw: "table tableau base de donnees database" },
  { id: "columns2", label: "2 colonnes", desc: "Deux colonnes côte à côte", icon: Columns2, kw: "colonne colonnes columns 2 deux" },
  { id: "columns3", label: "3 colonnes", desc: "Trois colonnes côte à côte", icon: Columns3, kw: "colonne colonnes columns 3 trois" },
  { id: "columns4", label: "4 colonnes", desc: "Quatre colonnes côte à côte", icon: Columns4, kw: "colonne colonnes columns 4 quatre" },
  { id: "columns5", label: "5 colonnes", desc: "Cinq colonnes côte à côte", icon: Columns4, kw: "colonne colonnes columns 5 cinq" },
];

// Menu « Transformer en » de la poignée de bloc (types de blocs texte)
export const TURN_INTO_ITEMS = [
  { type: "paragraph", label: "Texte", icon: Type },
  { type: "bullet", label: "Liste à puces", icon: List },
  { type: "heading1", label: "Titre 1", icon: Heading1 },
  { type: "heading2", label: "Titre 2", icon: Heading2 },
  { type: "heading3", label: "Titre 3", icon: Heading3 },
  { type: "toggle", label: "Liste dépliante", icon: ChevronRight },
  { type: "toggle-h1", label: "Titre 1 dépliant", icon: ListCollapse },
  { type: "toggle-h2", label: "Titre 2 dépliant", icon: ListCollapse },
  { type: "toggle-h3", label: "Titre 3 dépliant", icon: ListCollapse },
];

// context : null (racine), "toggle" ou "column"
export function filterSlashItems(query, context) {
  const q = query.trim().toLowerCase();
  let items = SLASH_ITEMS;
  // un toggle ou une colonne accepte tout type de bloc, sauf des colonnes (comme Notion)
  if (context === "toggle" || context === "column") {
    items = SLASH_ITEMS.filter((i) => !i.id.startsWith("columns"));
  }
  if (q) {
    items = items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.kw.includes(q)
    );
  }
  return items;
}

export default function SlashMenu({ pos, items, selected, onPick }) {
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current?.children[selected];
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const style = {
    left: Math.min(pos.x, window.innerWidth - 300),
    top: Math.min(pos.y, window.innerHeight - 300),
  };

  return (
    <div className="menu-panel fixed w-72 max-h-72 overflow-y-auto" style={style}>
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        Blocs
      </div>
      <div ref={listRef}>
        {items.length === 0 && (
          <div className="px-3 py-2 text-sm text-ink-faint">Aucun résultat</div>
        )}
        {items.map((item, i) => (
          <button
            key={item.id}
            className={`menu-item ${i === selected ? "bg-hover" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(item);
            }}
            onMouseEnter={() => {}}
          >
            <span className="w-9 h-9 flex items-center justify-center rounded border border-line bg-card shrink-0">
              <item.icon size={17} className="text-ink-light" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-ink">{item.label}</span>
              <span className="block text-xs text-ink-faint truncate">{item.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
