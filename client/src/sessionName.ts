import { tr } from './i18n.js';

function timeOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return tr.sessionName.morning;
  if (hour >= 12 && hour < 17) return tr.sessionName.afternoon;
  if (hour >= 17 && hour < 21) return tr.sessionName.evening;
  return tr.sessionName.night;
}

/** "Thursday Evening" / "חמישי בערב" — a table's name, picked automatically from the host's local day/time and language. */
export function autoSessionName(date = new Date()): string {
  return tr.sessionName.format(tr.sessionName.days[date.getDay()]!, timeOfDay(date.getHours()));
}
