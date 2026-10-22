// Date helpers on 'YYYY-MM-DD' strings (UTC math, same as the server).
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s, n) => fmt(parse(s) + n * DAY);
export const dow = (s) => new Date(parse(s)).getUTCDay();
export const weekStartOf = (s, ws) => addDays(s, -((dow(s) - ws + 7) % 7));
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const monthStart = (s) => s.slice(0, 8) + '01';
export const monthEnd = (s) => {
  const [y, m] = s.split('-').map(Number);
  return fmt(Date.UTC(y, m, 0));
};
export const addMonths = (s, n) => {
  const [y, m] = s.split('-').map(Number);
  return fmt(Date.UTC(y, m - 1 + n, 1));
};
export const dayNum = (s) => Number(s.slice(8, 10));
export const monthIdx = (s) => Number(s.slice(5, 7)) - 1;
export const year = (s) => Number(s.slice(0, 4));
// Most recent fill day (weekday 0-6) on or before `day`.
export const lastFillDay = (day, fillDay) => addDays(day, -((dow(day) - fillDay + 7) % 7));
// The week members are asked to fill in on a given fill date: the week containing it,
// or the week before when the fill day is the first day of the week.
export const dueWeekFor = (fillDate, ws) => {
  const w = weekStartOf(fillDate, ws);
  return w === fillDate ? addDays(w, -7) : w;
};
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
