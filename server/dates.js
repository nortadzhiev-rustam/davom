'use strict';
// All dates are plain 'YYYY-MM-DD' strings. Math is done in UTC so that
// daylight-saving changes never shift a day.

const DAY = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fmt(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function isDate(s) {
  return typeof s === 'string' && DATE_RE.test(s) && fmt(parse(s)) === s;
}

function addDays(s, n) {
  return fmt(parse(s) + n * DAY);
}

function dayOfWeek(s) {
  return new Date(parse(s)).getUTCDay();
}

function weekStartOf(s, weekStart) {
  return addDays(s, -((dayOfWeek(s) - weekStart + 7) % 7));
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function range(from, to) {
  const out = [];
  for (let t = parse(from), end = parse(to); t <= end; t += DAY) out.push(fmt(t));
  return out;
}

function weeksBetween(fromWeekStart, toWeekStart) {
  return Math.round((parse(toWeekStart) - parse(fromWeekStart)) / (7 * DAY));
}

// Most recent fill day (weekday 0-6) on or before `day`.
function lastFillDay(day, fillDay) {
  return addDays(day, -((dayOfWeek(day) - fillDay + 7) % 7));
}

// The week members are asked to fill in on a given fill date: the week containing it,
// or the week before when the fill day is the first day of the week.
function dueWeekFor(fillDate, weekStart) {
  const ws = weekStartOf(fillDate, weekStart);
  return ws === fillDate ? addDays(ws, -7) : ws;
}

module.exports = { isDate, addDays, dayOfWeek, weekStartOf, today, range, weeksBetween, lastFillDay, dueWeekFor };
