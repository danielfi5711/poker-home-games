const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

/** "Thursday Evening" — a table's name, picked automatically from the host's local day/time. */
export function autoSessionName(date = new Date()): string {
  return `${DAY_NAMES[date.getDay()]} ${timeOfDay(date.getHours())}`;
}
