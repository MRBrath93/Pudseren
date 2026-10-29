// Datoer og tekster om, hvornår en kunde skal pudses.

const weekdayFormat = new Intl.DateTimeFormat('da-DK', { weekday: 'long' });
const longDateFormat = new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Fx "Torsdag 29. oktober".
export function todayText(now = new Date()) {
  return capitalize(longDateFormat.format(now));
}

// Antal dage til og med søndag i denne uge (mandag = 6, søndag = 0).
export function daysLeftInWeek(now = new Date()) {
  return (7 - now.getDay()) % 7;
}

// daysOverdue kommer fra databasen: positiv = over tid, negativ = om så mange dage.
export function dueText(daysOverdue, nextDue, now = new Date()) {
  const daysUntil = -daysOverdue;
  // Det mest sandsynlige først: kunder, der skal pudses senere i denne uge.
  if (daysUntil > 1 && daysUntil <= daysLeftInWeek(now)) return capitalize(weekdayFormat.format(new Date(nextDue)));
  if (daysUntil > 1) return `Om ${daysUntil} dage`;
  if (daysUntil === 1) return 'I morgen';
  if (daysUntil === 0) return 'I dag';
  if (daysUntil === -1) return '1 dag over';
  return `${-daysUntil} dage over`;
}
