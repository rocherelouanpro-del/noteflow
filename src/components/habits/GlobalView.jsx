import React from "react";
import { PieChart, Flame, CalendarDays, Target } from "lucide-react";
import { useStore } from "../../store";
import { useNarrow } from "../../useNarrow";
import { daysSince } from "../../utils";
import WidgetCard from "./WidgetCard";
import HabitTable from "./HabitTable";
import HabitDayList from "./HabitDayList";
import { habitStats } from "./stats";
import { useToday } from "./useToday";

// Historique complet : tous les jours, toutes les habitudes, tous les graphiques
export default function GlobalView() {
  const { state } = useStore();
  useToday(); // re-rend stats et graphiques quand le jour change
  const narrow = useNarrow();
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
    <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:px-10 sm:py-12">
      <h1 className="flex items-center gap-2.5 text-2xl font-bold mb-6 sm:gap-3 sm:text-4xl sm:mb-10">
        <PieChart size={narrow ? 24 : 32} className="shrink-0 text-violet-500" />
        Vue globale
      </h1>

      <div className="grid grid-cols-3 gap-2 mb-8 sm:gap-4 sm:mb-12">
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
        {narrow ? (
          <HabitDayList habits={state.habits} days={days} />
        ) : (
          <HabitTable habits={state.habits} />
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-light mb-1 sm:gap-2 sm:text-[13px]">
        <span className="shrink-0">{icon}</span>
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums sm:text-2xl">{value}</div>
    </div>
  );
}
