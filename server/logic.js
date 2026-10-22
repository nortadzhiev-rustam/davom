'use strict';
const D = require('./dates');

const round = (n) => Math.round(n * 100) / 100;

function itemApplies(item, member) {
  return !item.groupIds || item.groupIds.length === 0 || item.groupIds.includes(member.groupId);
}

function itemAppliesToGroup(item, groupId) {
  return !item.groupIds || item.groupIds.length === 0 || item.groupIds.includes(groupId);
}

function sortedItems(data) {
  return [...data.items].sort((a, b) => a.order - b.order);
}

function publicItem(it) {
  const { id, name, unit, type, entry, weeklyTarget, points, groupIds, color, active, description, order } = it;
  return { id, name, unit, type, entry, weeklyTarget, points, groupIds, color, active, description, order };
}

function publicMember(m) {
  return { id: m.id, name: m.name, groupId: m.groupId, active: m.active, note: m.note, hasPin: !!m.pin, createdAt: m.createdAt };
}

function sumDates(data, memberId, dates) {
  const mine = data.entries[memberId] || {};
  const totals = {};
  let activeDays = 0;
  for (const d of dates) {
    const day = mine[d];
    if (!day) continue;
    let any = false;
    for (const [itemId, v] of Object.entries(day)) {
      totals[itemId] = (totals[itemId] || 0) + v;
      if (v > 0) any = true;
    }
    if (any) activeDays++;
  }
  for (const k of Object.keys(totals)) totals[k] = round(totals[k]);
  return { totals, activeDays };
}

// ---------- personal goals ----------
// data.goals[memberId][itemId] is a list of { from: weekStart, value } sorted by `from`.
// The member's own goal on a day is the latest entry starting on or before it. Without
// one (or when its value is null) the admin's suggested goal (item.weeklyTarget) applies.

function ownGoalOn(data, memberId, item, day) {
  const hist = ((data.goals || {})[memberId] || {})[item.id];
  if (!hist) return null;
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i].from <= day) return hist[i].value;
  return null;
}

function goalOn(data, memberId, item, day) {
  const own = ownGoalOn(data, memberId, item, day);
  return own != null ? own : item.weeklyTarget || 0;
}

// Goal for a period: each day carries 1/7 of the weekly goal that applied on that day,
// so a goal changed mid-month only counts from the week it was set.
function targetFor(data, memberId, item, dates) {
  let sum = 0;
  for (const d of dates) sum += goalOn(data, memberId, item, d);
  return round(sum / 7);
}

// Weekly yes/no items are a single tick; members don't set goals for those.
const hasPersonalGoal = (it) => !(it.type === 'check' && it.entry === 'weekly');


function goalsList(data, member, weekStart) {
  return sortedItems(data)
    .filter((it) => it.active && itemApplies(it, member) && hasPersonalGoal(it))
    .map((it) => {
      const own = ownGoalOn(data, member.id, it, weekStart);
      return { ...publicItem(it), suggested: it.weeklyTarget || 0, goal: own != null ? own : it.weeklyTarget || 0, custom: own != null };
    });
}


// Completion = average over the member's goal items of min(total / goal, 1).
function score(data, items, member, totals, dates, periodEnd) {
  let compSum = 0;
  let compN = 0;
  let points = 0;
  const applicable = [];
  const targets = {};
  for (const it of items) {
    const applies = itemApplies(it, member);
    const total = totals[it.id] || 0;
    if (!applies && !total) continue;
    applicable.push(it.id);
    points += total * (it.points || 0);
    const target = applies ? targetFor(data, member.id, it, dates) : 0;
    targets[it.id] = target;
    if (applies && it.active && target > 0 && ((it.createdAt || '') <= periodEnd || total > 0)) {
      compSum += Math.min(total / target, 1);
      compN++;
    }
  }
  return { applicable, targets, points: round(points), completion: compN ? compSum / compN : null };
}

function rangeReport(data, from, to, groupId) {
  const dates = D.range(from, to);
  const factor = dates.length / 7;
  // Members added after the period only count if numbers were backfilled for them.
  const sums = data.members
    .filter((m) => m.active && (!groupId || m.groupId === groupId))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({ m, ...sumDates(data, m.id, dates) }))
    .filter(({ m, activeDays }) => (m.createdAt || '') <= to || activeDays > 0);
  const items = sortedItems(data).filter(
    (it) => (it.active && (!groupId || itemAppliesToGroup(it, groupId))) || sums.some((s) => s.totals[it.id]),
  );

  const rows = sums.map(({ m, totals, activeDays }) => {
    const s = score(data, items, m, totals, dates, to);
    return {
      memberId: m.id,
      name: m.name,
      groupId: m.groupId,
      totals,
      targets: s.targets,
      applicable: s.applicable,
      completion: s.completion,
      points: s.points,
      activeDays,
    };
  });

  const itemStats = items.map((it) => {
    const relevant = rows.filter((r) => r.applicable.includes(it.id));
    const total = round(relevant.reduce((a, r) => a + (r.totals[it.id] || 0), 0));
    const withGoal = relevant.filter((r) => r.targets[it.id] > 0);
    return {
      itemId: it.id,
      total,
      avg: relevant.length ? round(total / relevant.length) : 0,
      reached: withGoal.length ? withGoal.filter((r) => (r.totals[it.id] || 0) >= r.targets[it.id]).length : null,
      withGoal: withGoal.length,
      members: relevant.length,
    };
  });

  const comps = rows.map((r) => r.completion).filter((c) => c != null);
  return {
    from,
    to,
    days: dates.length,
    items: items.map((it) => ({ ...publicItem(it), suggested: round(it.weeklyTarget * factor) })),
    rows,
    itemStats,
    avgCompletion: comps.length ? comps.reduce((a, b) => a + b, 0) / comps.length : null,
    totalPoints: round(rows.reduce((a, r) => a + r.points, 0)),
    filled: rows.filter((r) => r.activeDays > 0).length,
  };
}

function weekRange(data, weekStart) {
  const ws = D.weekStartOf(weekStart, data.settings.weekStart);
  return { from: ws, to: D.addDays(ws, 6) };
}

function trend(data, groupId, weeks) {
  const cur = D.weekStartOf(D.today(), data.settings.weekStart);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = D.addDays(cur, -7 * i);
    const r = rangeReport(data, from, D.addDays(from, 6), groupId);
    out.push({ weekStart: from, avgCompletion: r.avgCompletion, totalPoints: r.totalPoints, filled: r.filled, members: r.rows.length });
  }
  return out;
}

function memberItems(data, member, totals) {
  return sortedItems(data).filter((it) => (it.active && itemApplies(it, member)) || totals[it.id]);
}

function sheet(data, member, weekStart) {
  const { from, to } = weekRange(data, weekStart);
  const days = D.range(from, to);
  const mine = data.entries[member.id] || {};
  const values = {};
  for (const d of days) if (mine[d]) values[d] = { ...mine[d] };
  const { totals } = sumDates(data, member.id, days);
  const items = memberItems(data, member, totals);
  const s = score(data, items, member, totals, days, to);
  return {
    weekStart: from,
    days,
    today: D.today(),
    items: items.map((it) => ({
      ...publicItem(it),
      goal: s.targets[it.id] || 0,
      customGoal: ownGoalOn(data, member.id, it, from) != null,
    })),
    values,
    totals,
    completion: s.completion,
    points: s.points,
  };
}

function history(data, member, weeks) {
  const cur = D.weekStartOf(D.today(), data.settings.weekStart);
  const first = D.addDays(cur, -7 * (weeks - 1));
  const all = sumDates(data, member.id, D.range(first, D.addDays(cur, 6)));
  const items = memberItems(data, member, all.totals);
  const rows = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = D.addDays(cur, -7 * i);
    const to = D.addDays(from, 6);
    const days = D.range(from, to);
    const { totals, activeDays } = sumDates(data, member.id, days);
    const s = score(data, items, member, totals, days, to);
    rows.push({ weekStart: from, totals, targets: s.targets, completion: s.completion, points: s.points, activeDays });
  }
  return { items: items.map(publicItem), weeks: rows };
}



// ---------- CSV ----------

function csvCell(v, delim) {
  // Excel in locales that use ';' as list separator also expects a decimal comma.
  const s = v == null ? '' : typeof v === 'number' && delim === ';' ? String(v).replace('.', ',') : String(v);
  return /["\n\r]/.test(s) || s.includes(delim) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows, delim) {
  // BOM so Excel opens UTF-8 (Turkish / Uzbek letters) correctly.
  return '﻿' + rows.map((r) => r.map((c) => csvCell(c, delim)).join(delim)).join('\r\n') + '\r\n';
}

function summaryCsv(data, report, labels) {
  const delim = data.settings.csvDelimiter || ',';
  const groupName = (id) => (data.groups.find((g) => g.id === id) || {}).name || '';
  const head = [labels.member, labels.group];
  const hasGoal = (it) => report.rows.some((r) => r.targets[it.id] > 0);
  for (const it of report.items) {
    head.push(it.unit ? `${it.name} (${it.unit})` : it.name);
    if (hasGoal(it)) head.push(`${it.name} – ${labels.goal}`);
  }
  head.push(labels.points, labels.completion, labels.activeDays);
  const rows = [[`${report.from} – ${report.to}`], head];
  for (const r of report.rows) {
    const line = [r.name, groupName(r.groupId)];
    for (const it of report.items) {
      const applies = r.applicable.includes(it.id);
      line.push(applies ? r.totals[it.id] || 0 : '');
      if (hasGoal(it)) line.push(applies ? r.targets[it.id] || 0 : '');
    }
    line.push(r.points, r.completion == null ? '' : Math.round(r.completion * 100) + '%', r.activeDays);
    rows.push(line);
  }
  return toCsv(rows, delim);
}

function entriesCsv(data, from, to, groupId, labels) {
  const delim = data.settings.csvDelimiter || ',';
  const groupName = (id) => (data.groups.find((g) => g.id === id) || {}).name || '';
  const itemById = Object.fromEntries(data.items.map((it) => [it.id, it]));
  const dates = D.range(from, to);
  const rows = [[labels.date, labels.member, labels.group, labels.item, labels.value, labels.unit]];
  const members = data.members
    .filter((m) => !groupId || m.groupId === groupId)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const d of dates) {
    for (const m of members) {
      const day = (data.entries[m.id] || {})[d];
      if (!day) continue;
      for (const it of sortedItems(data)) {
        if (day[it.id] == null) continue;
        rows.push([d, m.name, groupName(m.groupId), it.name, day[it.id], itemById[it.id].unit || '']);
      }
    }
  }
  return toCsv(rows, delim);
}

module.exports = {
  publicItem,
  publicMember,
  rangeReport,
  weekRange,
  trend,
  sheet,
  history,
  goalsList,
  hasPersonalGoal,
  summaryCsv,
  entriesCsv,
};
