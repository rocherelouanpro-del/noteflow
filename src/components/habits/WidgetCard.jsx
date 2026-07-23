import React from "react";
import { Flame, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import Donut from "./Donut";
import { habitStats } from "./stats";

// Widget façon iPhone : donut de complétion (sur la période choisie) + série.
// En mode édition : suppression définitive (plus de « masquage »).
export default function WidgetCard({ habit, editMode, days }) {
  const { state, removeHabit } = useStore();
  const { rate, streak } = habitStats(state, habit.id, days);

  return (
    <div
      className={`relative flex flex-col items-center gap-2 rounded-2xl border border-line bg-card p-4 shadow-sm ${
        editMode ? "wiggle" : ""
      }`}
    >
      {editMode && (
        <button
          onClick={() => {
            if (window.confirm(`Supprimer l'habitude « ${habit.name} » et tout son historique ?`)) {
              removeHabit(habit.id);
            }
          }}
          title="Supprimer l'habitude"
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
        >
          <Trash2 size={12} />
        </button>
      )}
      <Donut pct={rate} color={habit.color} />
      <div className="text-center">
        <div className="text-[13.5px] font-semibold leading-tight">{habit.name}</div>
        <div className="flex items-center justify-center gap-1 text-xs text-ink-light mt-0.5">
          <Flame size={13} className="text-orange-500" />
          {streak > 0 ? (
            <span>
              {streak} jour{streak > 1 ? "s" : ""} de suite
            </span>
          ) : (
            <span>Pas de série en cours</span>
          )}
        </div>
      </div>
    </div>
  );
}
