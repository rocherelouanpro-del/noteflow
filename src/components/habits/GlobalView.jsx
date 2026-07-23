import React from "react";
import { PieChart, Flame, CalendarDays, Target } from "lucide-react";
import { useStore } from "../../store";
import { daysSince } from "../../utils";
import WidgetCard from "./WidgetCard";
import HabitTable from "./HabitTable";
import { habitStats } from "./stats";
import { useToday } from "./useToday";

// Historique complet : tous les jours, toutes les habitudes, tous les graphiques
export default function GlobalView() {
  const { state } = useStore();
  useToday(); // re-rend stats et graphiques quand le jour change
  const days = daysSince(state.habitStart);

  const totalPossible = days.length * state.habits.length;
  const totalDone = state.habits.reduce(
    (sum, h) => sum + habitStats(state, h.id).done,
    0
  );
  const globalRate = totalPossible ? Math.round((totalDone / totalPossible) * 100) : 0;
  const bestStreak = state.habits.reduce(
    (max, h) => Math.max(max, habitStats(state, h.id).streak),
    0
  );

  return (
    <div className="w-full max-w-5xl mx-auto px-10 py-12">
      <h1 className="flex items-center gap-3 text-4xl font-bold mb-10">
        <PieChart size={32} className="text-violet-500" />
        Vue globale
      </h1>

      <div className="grid grid-cols-3 gap-4 mb-12">
        <StatCard
          icon={<CalendarDays size={18} className="text-sky-600" />}
          label="Jours suivis"
          value={days.length}
        />
        <StatCard
          icon={<Target size={18} className="text-emerald-600" />}
          label="Complétion globale"
          value={`${globalRate}%`}
        />
        <StatCard
          icon={<Flame size={18} className="text-orange-500" />}
          label="Meilleure série en cours"
          value={`${bestStreak} j`}
        />
      </div>

      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4">Toutes les habitudes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {state.habits.map((h) => (
            <WidgetCard key={h.id} habit={h} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Historique complet</h2>
        <HabitTable habits={state.habits} />
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[13px] text-ink-light mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
