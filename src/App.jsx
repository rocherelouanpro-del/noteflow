import React, { useEffect, useState } from "react";
import { useStore } from "./store";
import { useNarrow } from "./useNarrow";
import { applyZoom, DEFAULT_ZOOM } from "./zoom";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
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

  // Zoom appliqué à la fenêtre elle-même, et réappliqué au démarrage : le
  // webview repart toujours à 100 %.
  useEffect(() => {
    if (state) applyZoom(state.ui?.zoom ?? DEFAULT_ZOOM);
  }, [state?.ui?.zoom, !!state]);

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
      {/* Le bouton d'ouverture de la barre latérale vit désormais DANS la barre
          d'onglets : plus de bouton flottant, donc plus de gouttière `pl-11`
          à réserver dans le contenu. */}
      <div className="flex flex-1 min-w-0 flex-col">
        <TabBar showOpenSidebar={showOpenButton} onOpenSidebar={openSidebar} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {view.type === "page" && state.pages[view.id] && (
            <PageView key={view.id} page={state.pages[view.id]} />
          )}
          {view.type === "habits" && <HabitsPage />}
          {view.type === "global" && <GlobalView />}
        </main>
      </div>
      <FloatingToolbar />
    </div>
  );
}
