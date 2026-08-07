import React, { useState } from "react";
import { X, Plus, CheckCircle2, PieChart, FileText, PanelLeft, Minus } from "lucide-react";
import { useStore } from "../store";
import { ZOOM_STEPS, DEFAULT_ZOOM, ZOOM_SUPPORTED } from "../zoom";
import PageIcon from "./PageIcon";
import PagePicker from "./PagePicker";

// Titre et icône affichés par un onglet, d'après la vue qu'il porte. Rien
// n'est recopié dans l'onglet : renommer une page renomme son onglet.
function tabInfo(view, pages) {
  if (view.type === "habits") {
    return {
      title: "Suivi de mes habitudes",
      icon: <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />,
    };
  }
  if (view.type === "global") {
    return {
      title: "Vue globale",
      icon: <PieChart size={13} className="shrink-0 text-violet-500" />,
    };
  }
  const p = pages[view.id];
  return {
    title: p?.title || "Sans titre",
    icon: p?.icon ? (
      <PageIcon icon={p.icon} size={13} className="shrink-0" />
    ) : (
      <FileText size={13} className="shrink-0 text-ink-faint" />
    ),
  };
}

// Zoom général, à droite de la barre d'onglets : toujours atteignable, même
// barre latérale repliée. Cliquer le pourcentage revient à 100 %.
function ZoomControl() {
  const { state, setZoom, stepZoom } = useStore();
  if (!ZOOM_SUPPORTED) return null;
  const zoom = state.ui?.zoom ?? DEFAULT_ZOOM;
  const min = zoom <= ZOOM_STEPS[0];
  const max = zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];

  return (
    <div className="flex shrink-0 items-center gap-0.5 pl-1 pr-1.5 border-l border-line">
      <button
        className="icon-btn w-6 h-6 disabled:opacity-30"
        onClick={() => stepZoom(-1)}
        disabled={min}
        title="Réduire (Cmd -)"
      >
        <Minus size={14} />
      </button>
      <button
        className={`px-1 rounded text-[12px] tabular-nums hover:bg-hover ${
          zoom === DEFAULT_ZOOM ? "text-ink-faint" : "text-ink font-medium"
        }`}
        onClick={() => setZoom(DEFAULT_ZOOM)}
        title="Revenir à 100 % (Cmd 0)"
      >
        {Math.round(zoom * 100)} %
      </button>
      <button
        className="icon-btn w-6 h-6 disabled:opacity-30"
        onClick={() => stepZoom(1)}
        disabled={max}
        title="Agrandir (Cmd +)"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default function TabBar({ showOpenSidebar, onOpenSidebar }) {
  const { state, tabs, activeTabId, selectTab, closeTab, openInNewTab, createPage } =
    useStore();
  const [picker, setPicker] = useState(null); // { x, y } — choix de la page à ouvrir

  const openPicker = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPicker({ x: r.left, y: r.bottom + 4 });
  };

  return (
    <div className="flex items-stretch shrink-0 h-9 bg-panel border-b border-line select-none">
      {showOpenSidebar && (
        <button
          className="shrink-0 flex items-center justify-center w-9 border-r border-line text-ink-faint hover:text-ink hover:bg-hover"
          onClick={onOpenSidebar}
          title="Afficher la barre latérale"
        >
          <PanelLeft size={16} />
        </button>
      )}

      <div className="nf-noscrollbar flex items-stretch min-w-0 flex-1 overflow-x-auto">
        {tabs.map((t) => {
          const { title, icon } = tabInfo(t.view, state.pages);
          const active = t.id === activeTabId;
          return (
            <div
              key={t.id}
              onClick={() => selectTab(t.id)}
              // clic du milieu = fermer, comme dans un navigateur
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  closeTab(t.id);
                }
              }}
              title={title}
              className={`group/tab flex shrink-0 items-center gap-1.5 pl-2.5 pr-1.5 max-w-[190px] border-r border-line cursor-pointer text-[13px] transition-colors ${
                active
                  ? "bg-paper text-ink font-medium"
                  : "text-ink-light hover:bg-hover"
              }`}
            >
              {icon}
              <span className="truncate">{title}</span>
              {/* Le dernier onglet ne se ferme pas : plus rien ne s'afficherait. */}
              {tabs.length > 1 && (
                <button
                  className={`icon-btn w-4 h-4 shrink-0 ${
                    active ? "" : "opacity-0 group-hover/tab:opacity-100"
                  }`}
                  title="Fermer l'onglet"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
        <button
          className="shrink-0 flex items-center justify-center w-8 text-ink-faint hover:text-ink hover:bg-hover"
          onClick={openPicker}
          title="Ouvrir une page dans un nouvel onglet"
        >
          <Plus size={15} />
        </button>
      </div>

      <ZoomControl />

      {picker && (
        <PagePicker
          pos={picker}
          pages={Object.values(state.pages)}
          heading="Ouvrir dans un nouvel onglet"
          onPick={(id) => {
            openInNewTab({ type: "page", id });
            setPicker(null);
          }}
          onNew={() => {
            openInNewTab({ type: "page", id: createPage(null, "") });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
