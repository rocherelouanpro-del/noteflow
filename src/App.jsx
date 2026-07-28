import React, { useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";
import { useStore } from "./store";
import { useNarrow } from "./useNarrow";
import Sidebar from "./components/Sidebar";
import PageView from "./components/PageView";
import HabitsPage from "./components/habits/HabitsPage";
import GlobalView from "./components/habits/GlobalView";
import FloatingToolbar from "./components/FloatingToolbar";

export default function App() {
  const { state, view, toggleSidebar } = useStore();

  // Écran étroit (téléphone) : la barre latérale fixe mangerait la moitié de
  // la largeur. Elle passe donc en panneau superposé, masqué par défaut et
  // refermé après navigation. On n'écrit PAS dans `ui.sidebarCollapsed` :
  // la préférence de l'utilisateur sur ordinateur doit rester intacte.
  const narrow = useNarrow();
  const [mobileOpen, setMobileOpen] = useState(false);

  // changement de page sur mobile → on referme le panneau
  useEffect(() => {
    if (narrow) setMobileOpen(false);
  }, [view.type, view.id, narrow]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state?.theme === "dark");
  }, [state?.theme]);

  if (!state) {
    return (
      <div className="h-full flex items-center justify-center text-ink-faint">
        Chargement…
      </div>
    );
  }

  const collapsed = !!state.ui?.sidebarCollapsed;
  const showSidebar = narrow ? mobileOpen : !collapsed;
  const showOpenButton = narrow ? !mobileOpen : collapsed;
  const openSidebar = () => (narrow ? setMobileOpen(true) : toggleSidebar());

  return (
    <div className="relative flex h-full overflow-hidden">
      {showSidebar &&
        (narrow ? (
          // superposition : voile cliquable + panneau au-dessus du contenu
          <>
            <div
              className="absolute inset-0 z-40 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 z-50 flex">
              <Sidebar />
            </div>
          </>
        ) : (
          <Sidebar />
        ))}
      {showOpenButton && (
        <button
          className="absolute left-2 top-2 z-40 flex items-center justify-center w-8 h-8 rounded-md bg-card/90 backdrop-blur border border-line shadow-sm text-ink-faint hover:text-ink hover:bg-hover transition-colors"
          onClick={openSidebar}
          title="Afficher la barre latérale"
        >
          <PanelLeft size={17} />
        </button>
      )}
      <main
        className={`flex-1 min-w-0 overflow-y-auto ${showOpenButton ? "pl-11" : ""}`}
      >
        {view.type === "page" && state.pages[view.id] && (
          <PageView key={view.id} page={state.pages[view.id]} />
        )}
        {view.type === "habits" && <HabitsPage />}
        {view.type === "global" && <GlobalView />}
      </main>
      <FloatingToolbar />
    </div>
  );
}
