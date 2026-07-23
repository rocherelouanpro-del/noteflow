import React from "react";
import { Check } from "lucide-react";
import { useStore } from "../../store";
import { daysSince, formatDateFr, pctColor, pctBgColor } from "../../utils";
import { dayPct } from "./stats";
import { useToday } from "./useToday";

// Tableau de suivi : une ligne par jour, une colonne par habitude,
// dernière colonne = % du jour coloré en dégradé continu rouge -> vert.
// useToday fait apparaître la nouvelle ligne au passage de minuit.
export default function HabitTable({ habits, days: daysProp }) {
  const { state, toggleHabitLog } = useStore();
  const today = useToday();
  const days = daysProp || daysSince(state.habitStart);

  return (
    <div className="overflow-x-auto border-y border-line">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-line text-[12.5px] text-ink-light">
            <th className="text-left font-medium px-3 py-2 min-w-[130px]">Date</th>
            {habits.map((h) => (
              <th key={h.id} className="font-medium px-2 py-2 min-w-[92px]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: h.color }} />
                  {h.name}
                </span>
              </th>
            ))}
            <th className="font-medium px-3 py-2 w-24">Complété</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const pct = dayPct(state, day);
            const isToday = day === today;
            return (
              <tr
                key={day}
                className={`border-b border-line/60 last:border-b-0 ${
                  isToday ? "bg-panel/70" : "hover:bg-panel/40"
                }`}
              >
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className={isToday ? "font-semibold" : "text-ink-light"}>
                    {isToday ? "Aujourd'hui" : formatDateFr(day)}
                  </span>
                </td>
                {habits.map((h) => {
                  const checked = !!state.habitLog[day]?.[h.id];
                  return (
                    <td key={h.id} className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => toggleHabitLog(day, h.id)}
                        title={`${h.name} — ${formatDateFr(day)}`}
                        className="w-[18px] h-[18px] rounded-[5px] border-2 inline-flex items-center justify-center align-middle transition-colors"
                        style={
                          checked
                            ? { backgroundColor: h.color, borderColor: h.color }
                            : { borderColor: "var(--line-strong)" }
                        }
                      >
                        {checked && <Check size={12} strokeWidth={3.5} className="text-white" />}
                      </button>
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-center">
                  <span
                    className="inline-block min-w-[52px] px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums"
                    style={{ backgroundColor: pctBgColor(pct), color: pctColor(pct) }}
                  >
                    {Math.round(pct)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
