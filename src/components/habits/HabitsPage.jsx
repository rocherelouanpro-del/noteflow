import React, { useState } from "react";
import { CheckCircle2, Plus, Settings2, Check } from "lucide-react";
import { useStore } from "../../store";
import { useNarrow } from "../../useNarrow";
import WidgetCard from "./WidgetCard";
import HabitTable from "./HabitTable";
import HabitDayList from "./HabitDayList";
import { habitStats, periodDays } from "./stats";
import { useToday } from "./useToday";

// `short` : sur téléphone les cinq onglets ne tiennent pas en largeur et le
// dernier devient inatteignable — seul son libellé est abrégé.
const PERIODS = [
  { id: "week", label: "Semaine" },
  { id: "month", label: "Mois" },
  { id: "year", label: "Année" },
  { id: "all", label: "Tout" },
  { id: "custom", label: "Personnalisé", short: "Perso." },
];

export default function HabitsPage() {
  const { state, addHabit, setHabitPeriod } = useStore();
  useToday(); // re-rend widgets et stats quand le jour change
  const narrow = useNarrow();
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const habits = state.habits;
  const period = state.ui?.habitPeriod || { kind: "all" };
  const days = periodDays(state);

  // Complétion globale sur la période sélectionnée
  const totalPossible = days.length * habits.length;
  const totalDone = habits.reduce((sum, h) => sum + habitStats(state, h.id, days).done, 0);
  const overall = totalPossible ? Math.round((totalDone / totalPossible) * 100) : 0;

  const pickPeriod = (id) => {
    if (id === "custom") {
      setHabitPeriod({ kind: "custom", n: period.n || 2, unit: period.unit || "semaine" });
    } else {
      setHabitPeriod({ kind: id });
    }
  };

  const submitHabit = () => {
    const n = name.trim();
    if (n) addHabit(n);
    setName("");
    setAdding(false);
  };

  // Widgets (donuts sur la période choisie)
  const widgetsSection = (
    <section className={narrow ? "mt-10" : "mb-12"}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Mes widgets</h2>
        <button
          onClick={() => setEditMode(!editMode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border transition-colors ${
            editMode
              ? "bg-accent text-white border-accent"
              : "border-line text-ink-light hover:bg-hover"
          }`}
        >
          {editMode ? <Check size={14} /> : <Settings2 size={14} />}
          {editMode ? "Terminé" : "Personnaliser"}
        </button>
      </div>
      {habits.length === 0 && (
        <p className="text-sm text-ink-faint">
          Aucune habitude. Ajoutez-en une depuis le journal {narrow ? "ci-dessus" : "ci-dessous"}.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {habits.map((h) => (
          <WidgetCard key={h.id} habit={h} editMode={editMode} days={days} />
        ))}
      </div>
      {editMode && (
        <p className="text-xs text-ink-faint mt-3">
          Cliquez sur la corbeille pour supprimer définitivement une habitude (elle ne
          comptera plus dans les pourcentages).
        </p>
      )}
    </section>
  );

  // Journal quotidien (limité à la période). Au doigt, le tableau est
  // impraticable : il laisse la place à une liste de jours dépliables.
  const journalSection = (
    <section>
      <div className="flex flex-col items-stretch gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Journal</h2>
        {adding ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitHabit();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Nom de l'habitude…"
              className="flex-1 border border-line rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-accent/60 sm:flex-none sm:w-52"
            />
            <button
              onClick={submitHabit}
              className="shrink-0 px-3 py-1.5 rounded-md bg-accent text-white text-[13px] font-medium"
            >
              Ajouter
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border border-line text-ink-light hover:bg-hover"
          >
            <Plus size={14} /> Ajouter une habitude
          </button>
        )}
      </div>
      {narrow ? (
        <HabitDayList habits={habits} days={days} />
      ) : (
        <HabitTable habits={habits} days={days} />
      )}
    </section>
  );

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:px-10 sm:py-12">
      <h1 className="flex items-center gap-2.5 text-2xl font-bold mb-5 sm:gap-3 sm:text-4xl sm:mb-8">
        <CheckCircle2 size={narrow ? 24 : 32} className="shrink-0 text-emerald-600" />
        Suivi de mes habitudes
      </h1>

      {/* Période d'affichage : les taux de complétion s'y adaptent */}
      <div className="flex flex-wrap items-center gap-3 mb-6 sm:mb-10">
        <div className="nf-noscrollbar flex max-w-full items-center rounded-lg border border-line overflow-x-auto sm:overflow-hidden">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => pickPeriod(p.id)}
              className={`shrink-0 px-2.5 py-1.5 text-[13px] font-medium border-r border-line last:border-r-0 transition-colors sm:px-3 ${
                period.kind === p.id ? "bg-accent text-white" : "text-ink-light hover:bg-hover"
              }`}
            >
              {narrow && p.short ? p.short : p.label}
            </button>
          ))}
        </div>
        {period.kind === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="1"
              max="3650"
              value={period.n || 2}
              onChange={(e) => {
                const n = Math.max(1, Math.min(3650, parseInt(e.target.value, 10) || 1));
                setHabitPeriod({ ...period, n });
              }}
              className="w-16 border border-line rounded-md px-2 py-1 text-[13px] bg-transparent outline-none focus:border-accent text-center tabular-nums"
            />
            <select
              value={period.unit || "semaine"}
              onChange={(e) => setHabitPeriod({ ...period, unit: e.target.value })}
              className="border border-line rounded-md px-2 py-1 text-[13px] bg-card outline-none focus:border-accent"
            >
              <option value="jour">jours</option>
              <option value="semaine">semaines</option>
              <option value="mois">mois</option>
            </select>
          </div>
        )}
        <span className="text-[12.5px] text-ink-faint">
          {period.kind === "all"
            ? `Depuis le début · ${days.length} jour${days.length > 1 ? "s" : ""}`
            : `${days.length} dernier${days.length > 1 ? "s" : ""} jour${days.length > 1 ? "s" : ""}`}
          {" · "}complétion <span className="font-semibold text-ink-light">{overall}%</span>
        </span>
      </div>

      {/* Au doigt, cocher le jour prime : le journal passe avant les widgets. */}
      {narrow ? (
        <>
          {journalSection}
          {widgetsSection}
        </>
      ) : (
        <>
          {widgetsSection}
          {journalSection}
        </>
      )}
    </div>
  );
}
