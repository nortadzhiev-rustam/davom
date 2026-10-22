import { html, useState, useEffect, useContext, useRef } from './vendor/preact-htm.js';
import { api } from './api.js';
import { t, fmtPct, fmtDayMonth, fmtRange, dayLong } from './i18n.js';
import { AppCtx } from './ctx.js';
import { Logo, Icon, LangSwitch, ThemeToggle, WeekNav, Sheet, SheetSummary, BarChart, GoalsCard, toastError } from './ui.js';
import * as D from './dates.js';

const IDLE_MS = 3 * 60 * 1000;

// Where the member stands relative to the admin's fill-in day (null when none is set).
function fillState(status) {
  if (status.fillDay == null) return null;
  const today = D.today();
  const lastFill = D.lastFillDay(today, status.fillDay);
  return { isToday: lastFill === today, due: D.dueWeekFor(lastFill, status.weekStart) };
}

export function MemberApp() {
  const { me, status, logout } = useContext(AppCtx);
  const current = D.weekStartOf(D.today(), status.weekStart);
  const fill = fillState(status);
  // On fill-in day, open the week that is due.
  const [week, setWeek] = useState(() => (fill && fill.isToday ? fill.due : current));
  const [sheet, setSheet] = useState(null);
  const [hist, setHist] = useState(null);
  const [goalsMissing, setGoalsMissing] = useState(0);
  const histTimer = useRef(null);

  const loadSheet = () => api('GET', '/api/sheet?week=' + week).then(setSheet).catch(toastError);
  const loadHistory = () => api('GET', '/api/history?weeks=12').then(setHist).catch(() => {});

  useEffect(() => {
    loadSheet();
  }, [week]);
  useEffect(() => {
    loadHistory();
  }, []);

  // On the shared computer, sign the member out after a few idle minutes.
  useEffect(() => {
    if (!status.isLocal) return;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, IDLE_MS);
    };
    const evs = ['mousemove', 'keydown', 'pointerdown', 'scroll'];
    evs.forEach((e) => addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      evs.forEach((e) => removeEventListener(e, reset));
    };
  }, []);

  function refreshHistorySoon() {
    clearTimeout(histTimer.current);
    histTimer.current = setTimeout(loadHistory, 800);
  }

  async function save(itemId, date, value) {
    setSheet(await api('PUT', '/api/entry', { itemId, date, value }));
    refreshHistorySoon();
  }

  function onGoalsChanged() {
    loadSheet();
    refreshHistorySoon();
  }

  function goToGoals() {
    const el = document.getElementById('my-goals');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const empty = [...el.querySelectorAll('input')].find((i) => !i.value) || el.querySelector('input');
    if (empty) setTimeout(() => empty.focus({ preventScroll: true }), 400);
  }

  const m = me.member;
  const dueRange = fill ? fmtRange(fill.due, D.addDays(fill.due, 6)) : '';
  const canEditDue = fill && D.isDate(fill.due) && Math.round((D.parse(current) - D.parse(fill.due)) / (7 * 86400000)) <= me.memberEditWeeks;
  const dueWeekRow = fill && hist ? hist.weeks.find((w) => w.weekStart === fill.due) : null;
  const dueMissing = fill && !fill.isToday && canEditDue && dueWeekRow && dueWeekRow.activeDays === 0
    && (m.createdAt || '') <= D.addDays(fill.due, 6);

  let fillNotice = null;
  if (fill && fill.isToday) {
    fillNotice = html`<div class="notice notice-accent"><${Icon} name="calendar" size=${16} />
      <span>${t('fill_today', { range: dueRange })}</span>
      ${week !== fill.due && html`<button class="btn btn-sm" onClick=${() => setWeek(fill.due)}>${t('open_week')}</button>`}
    </div>`;
  } else if (dueMissing) {
    fillNotice = html`<div class="notice"><${Icon} name="info" size=${16} />
      <span>${t('fill_missing', { range: dueRange })}</span>
      ${week !== fill.due && html`<button class="btn btn-sm" onClick=${() => setWeek(fill.due)}>${t('open_week')}</button>`}
    </div>`;
  }

  return html`<div class="member-shell">
    <header class="topbar">
      <div class="brand">
        <${Logo} size=${30} />
        <div>
          <div class="brand-name">${status.orgName || t('app_name')}</div>
          <div class="brand-sub">${t('my_sheet')}</div>
        </div>
      </div>
      <div class="topbar-right">
        <div class="me-chip">
          <span class="avatar">${m.name.slice(0, 1).toLocaleUpperCase()}</span>
          <span class="me-text"><strong>${m.name}</strong>${me.groupName && html`<span class="muted">${me.groupName}</span>`}</span>
        </div>
        <${LangSwitch} compact />
        <${ThemeToggle} />
        <button class="btn btn-primary" onClick=${logout}><${Icon} name="check" size=${16} />${t('finish')}</button>
      </div>
    </header>

    <main class="member-main">
      ${fillNotice}
      ${goalsMissing > 0 && html`<div class="notice notice-soft notice-row"><${Icon} name="info" size=${16} />
        <span>${t('set_goals_notice')}</span>
        <button class="btn btn-sm btn-primary" onClick=${goToGoals}>${t('set_goals')}</button>
      </div>`}

      <div class="card">
        <div class="card-head">
          <${WeekNav} weekStart=${week} weekStartDay=${status.weekStart} onChange=${setWeek} />
          ${fill && html`<span class="badge"><${Icon} name="calendar" size=${12} />${t('fill_day_is', { day: dayLong(status.fillDay) })}</span>`}
        </div>
        ${sheet && sheet.weekStart === week
          ? html`
            ${!sheet.editable && html`<div class="notice"><${Icon} name="lock" size=${16} />
              ${week > current ? t('week_future') : t('week_locked')}</div>`}
            <${SheetSummary} sheet=${sheet} />
            <${Sheet} sheet=${sheet} isAdmin=${false} onSave=${save} />`
          : html`<div class="loading-block"></div>`}
      </div>

      <${GoalsCard} id="my-goals" isAdmin=${false} onChange=${onGoalsChanged}
        onLoaded=${(g) => setGoalsMissing(g.items.filter((it) => !it.custom).length)} />

      ${hist && html`<div class="card">
        <div class="card-head"><h2>${t('my_last_weeks', { n: hist.weeks.length })}</h2><span class="muted small">${t('completion')}</span></div>
        <${BarChart} max=${1} format=${fmtPct} ariaLabel=${t('my_last_weeks', { n: hist.weeks.length })}
          data=${hist.weeks.map((w) => ({ label: fmtDayMonth(w.weekStart), title: fmtRange(w.weekStart, D.addDays(w.weekStart, 6)), value: w.completion }))} />
      </div>`}
    </main>
  </div>`;
}
