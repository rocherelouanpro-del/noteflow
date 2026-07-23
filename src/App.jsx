import React, { useEffect } from "react";
import { PanelLeft } from "lucide-react";
import { useStore } from "./store";
import Sidebar from "./components/Sidebar";
import PageView from "./components/PageView";
import HabitsPage from "./components/habits/HabitsPage";
import GlobalView from "./components/habits/GlobalView";
import FloatingToolbar from "./components/FloatingToolbar";

export default function App() {
  const { state, view, toggleSidebar } = useStore();

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

  return (
    <div className="relative flex h-full overflow-hidden">
      {!collapsed && <Sidebar />}
      {collapsed && (
        <button
          className="absolute left-2 top-2 z-40 flex items-center justify-center w-8 h-8 rounded-md bg-card/90 backdrop-blur border border-line shadow-sm text-ink-faint hover:text-ink hover:bg-hover transition-colors"
          onClick={toggleSidebar}
          title="Afficher la barre latérale"
        >
          <PanelLeft size={17} />
        </button>
      )}
      <main className={`flex-1 min-w-0 overflow-y-auto ${collapsed ? "pl-11" : ""}`}>
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
