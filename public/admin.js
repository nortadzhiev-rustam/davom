import { html, useState, useEffect, useContext, useMemo, useCallback } from './vendor/preact-htm.js';
import { api, download } from './api.js';
import { t, fmtNum, fmtPct, fmtRange, fmtDayMonth, fmtMonth, fmtDate, dayLong, LANGS, LANG_NAMES } from './i18n.js';
import { AppCtx } from './ctx.js';
import {
  Logo, Icon, LangSwitch, ThemeToggle, Modal, Field, Seg, Switch, ColorPicker, Meter, Empty, PageHead, Dot,
  WeekNav, Sheet, SheetSummary, BarChart, ItemLabel, GoalsCard, toast, toastError, confirmDialog, useRoute, go, SWATCHES,
} from './ui.js';
import * as D from './dates.js';

const NAV = [
  ['dashboard', 'dashboard', 'nav_dashboard'],
  ['report', 'chart', 'nav_reports'],
  ['fill', 'pencil', 'nav_fill'],
  ['members', 'users', 'nav_members'],
  ['items', 'list', 'nav_items'],
  ['groups', 'layers', 'nav_groups'],
  ['settings', 'sliders', 'nav_settings'],
];

export function AdminApp() {
  const { status, logout } = useContext(AppCtx);
  const route = useRoute();
  const [config, setConfig] = useState(null);
  const reload = useCallback(() => api('GET', '/api/admin/config').then(setConfig).catch(toastError), []);
  useEffect(() => {
    reload();
  }, []);

  const parts = route.split('/').filter(Boolean);
  const page = parts[0] === 'admin' && parts[1] ? parts[1] : 'dashboard';
  const arg = parts[2] ? decodeURIComponent(parts[2]) : null;
  const arg2 = parts[3] ? decodeURIComponent(parts[3]) : null;
  const navKey = page === 'member' ? 'members' : page;

  let content = html`<div class="loading-block"></div>`;
  if (config) {
    const p = { config, reload };
    content = {
      dashboard: html`<${Dashboard} ...${p} />`,
      report: html`<${Reports} ...${p} />`,
      fill: html`<${FillPage} ...${p} memberId=${arg} weekParam=${arg2} />`,
      members: html`<${MembersPage} ...${p} />`,
      member: html`<${MemberDetail} ...${p} memberId=${arg} />`,
      items: html`<${ItemsPage} ...${p} />`,
      groups: html`<${GroupsPage} ...${p} />`,
      settings: html`<${SettingsPage} ...${p} />`,
    }[page] || html`<${Dashboard} ...${p} />`;
  }

  return html`<div class="shell">
    <aside class="sidebar no-print">
      <div class="brand">
        <${Logo} size=${32} />
        <div class="brand-text">
          <div class="brand-name">${(config && config.settings.orgName) || status.orgName || t('app_name')}</div>
          <div class="brand-sub">${t('admin_panel')}</div>
        </div>
      </div>
      <nav class="nav">
        ${NAV.map(([key, icon, label]) => html`<a href=${'#/admin/' + key} class=${'nav-link' + (navKey === key ? ' on' : '')}
          aria-current=${navKey === key ? 'page' : undefined}>
          <${Icon} name=${icon} size=${18} /><span>${t(label)}</span>
        </a>`)}
      </nav>
      <div class="sidebar-foot">
        <div class="sidebar-tools"><${LangSwitch} compact /><${ThemeToggle} /></div>
        <button class="nav-link" onClick=${logout}><${Icon} name="logout" size=${18} /><span>${t('logout')}</span></button>
      </div>
    </aside>
    <main class="main" key=${page + (arg || '') + (arg2 || '')}>${content}</main>
  </div>`;
}

// ---------- shared helpers ----------

function GroupFilter({ groups, value, onChange }) {
  if (!groups.length) return null;
  return html`<select class="select" value=${value} onChange=${(e) => onChange(e.target.value)} aria-label=${t('group')}>
    <option value="">${t('all_groups')}</option>
    ${groups.map((g) => html`<option value=${g.id}>${g.name}</option>`)}
  </select>`;
}

const groupName = (config, id) => (config.groups.find((g) => g.id === id) || {}).name || '';

function heatLevel(v, target) {
  if (!(target > 0) || !v) return 0;
  const r = v / target;
  return r >= 1 ? 5 : r >= 0.75 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1;
}

function Stat({ label, value, sub, children }) {
  return html`<div class="stat">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    ${sub && html`<div class="stat-sub">${sub}</div>`}
    ${children}
  </div>`;
}

// ---------- dashboard ----------

function Dashboard({ config }) {
  const [group, setGroup] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => {
    api('GET', '/api/admin/dashboard' + (group ? '?group=' + group : '')).then(setD).catch(toastError);
  }, [group]);

  const noItems = !config.items.some((it) => it.active);
  const noMembers = !config.members.some((m) => m.active);
  if (noItems || noMembers) {
    return html`<${PageHead} title=${t('nav_dashboard')} />
      <div class="card onboarding">
        <h2>${t('getting_started')}</h2>
        <ol class="steps">
          <li class=${noItems ? '' : 'done'}>
            <span class="step-num">${noItems ? '1' : html`<${Icon} name="check" size=${14} />`}</span>
            <div><strong>${t('step_items')}</strong><p class="muted">${t('step_items_text')}</p>
            ${noItems && html`<a class="btn btn-primary btn-sm" href="#/admin/items">${t('add_item')}</a>`}</div>
          </li>
          <li class=${noMembers ? '' : 'done'}>
            <span class="step-num">${noMembers ? '2' : html`<${Icon} name="check" size=${14} />`}</span>
            <div><strong>${t('step_members')}</strong><p class="muted">${t('step_members_text')}</p>
            ${noMembers && html`<a class="btn btn-primary btn-sm" href="#/admin/members">${t('add_members')}</a>`}</div>
          </li>
          <li>
            <span class="step-num">3</span>
            <div><strong>${t('step_fill')}</strong><p class="muted">${t('step_fill_text')}</p></div>
          </li>
        </ol>
      </div>`;
  }

  if (!d) return html`<${PageHead} title=${t('nav_dashboard')} /><div class="loading-block"></div>`;
  const w = d.week;
  const hasPoints = w.items.some((it) => it.points > 0);
  const top = [...w.rows].filter((r) => r.completion != null || r.points > 0)
    .sort((a, b) => (b.completion ?? -1) - (a.completion ?? -1) || b.points - a.points).slice(0, 5);
  const due = d.due;
  const fillDay = config.settings.fillDay;
  const sub = [t('this_week') + ' · ' + fmtRange(w.from, w.to)];
  if (fillDay != null) sub.push(t('fill_day_is', { day: dayLong(fillDay) }));

  return html`
    <${PageHead} title=${t('nav_dashboard')} sub=${sub.join(' · ')}>
      <${GroupFilter} groups=${config.groups} value=${group} onChange=${setGroup} />
    <//>
    <div class="stats">
      <${Stat} label=${t('avg_completion')} value=${fmtPct(w.avgCompletion)}><${Meter} value=${w.avgCompletion} /><//>
      <${Stat} label=${t('filled_this_week')} value=${`${w.filled} / ${w.rows.length}`} sub=${t('members_with_entries')} />
      ${hasPoints && html`<${Stat} label=${t('total_points')} value=${fmtNum(w.totalPoints)} sub=${t('all_members')} />`}
    </div>

    <div class="grid-main">
      <div class="card">
        <div class="card-head"><h2>${t('items_this_week')}</h2><a class="link" href="#/admin/report">${t('full_report')}</a></div>
        <div class="item-stats">
          ${w.items.map((it, i) => {
            const s = w.itemStats[i];
            return html`<div class="item-stat">
              <${ItemLabel} it=${it} />
              <div class="item-stat-nums">
                <span class="item-stat-total">${fmtNum(s.total)}<small>${it.type === 'check' ? '' : ' ' + (it.unit || '')}</small></span>
                <span class="muted small">${t('avg_per_member', { n: fmtNum(s.avg) })}</span>
              </div>
              ${s.reached != null && html`<div class="item-stat-goal">
                <${Meter} value=${s.withGoal ? s.reached / s.withGoal : 0} size="sm" />
                <span class="muted small">${t('reached_goal', { a: s.reached, b: s.withGoal })}</span>
              </div>`}
            </div>`;
          })}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>${t('top_this_week')}</h2></div>
        ${top.length ? html`<ol class="leader">
          ${top.map((r, i) => html`<li>
            <span class="rank">${i + 1}</span>
            <a class="leader-name" href=${'#/admin/member/' + r.memberId}>${r.name}</a>
            ${hasPoints && html`<span class="muted small num">${fmtNum(r.points)} ${t('pts')}</span>`}
            <span class="leader-pct num">${fmtPct(r.completion)}</span>
          </li>`)}
        </ol>` : html`<p class="muted">${t('no_entries_yet')}</p>`}
        ${due.missing.length > 0 && html`<div class="missing">
          <h3>${due.fillDate
            ? t('not_filled_for', { range: fmtRange(due.from, due.to), n: due.missing.length })
            : t('not_filled_yet', { n: due.missing.length })}</h3>
          <div class="chips">${due.missing.map((r) => html`<a class="chip" href=${`#/admin/fill/${r.memberId}/${due.from}`}>${r.name}</a>`)}</div>
        </div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>${t('avg_completion_trend')}</h2><span class="muted small">${t('last_n_weeks', { n: d.trend.length })}</span></div>
      <${BarChart} max=${1} format=${fmtPct} ariaLabel=${t('avg_completion_trend')}
        data=${d.trend.map((x) => ({ label: fmtDayMonth(x.weekStart), title: fmtRange(x.weekStart, D.addDays(x.weekStart, 6)), value: x.avgCompletion }))} />
    </div>`;
}

// ---------- reports ----------

function Reports({ config }) {
  const ws = config.settings.weekStart;
  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(D.today());
  const [custom, setCustom] = useState({ from: D.addDays(D.today(), -29), to: D.today() });
  const [group, setGroup] = useState('');
  const [sort, setSort] = useState({ key: 'completion', dir: -1 });
  const [rep, setRep] = useState(null);

  const period = useMemo(() => {
    if (mode === 'week') {
      const f = D.weekStartOf(anchor, ws);
      return { from: f, to: D.addDays(f, 6) };
    }
    if (mode === 'month') return { from: D.monthStart(anchor), to: D.monthEnd(anchor) };
    return custom;
  }, [mode, anchor, custom, ws]);

  const valid = D.isDate(period.from) && D.isDate(period.to) && period.from <= period.to;
  const qs = `from=${period.from}&to=${period.to}${group ? '&group=' + group : ''}`;
  useEffect(() => {
    if (!valid) return;
    api('GET', '/api/admin/report?' + qs).then(setRep).catch(toastError);
  }, [qs]);

  const shift = (dir) => setAnchor(mode === 'week' ? D.addDays(anchor, 7 * dir) : D.addMonths(anchor, dir));
  const label = mode === 'month' ? fmtMonth(period.from) : fmtRange(period.from, period.to);

  const sortBy = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'name' ? 1 : -1 }));
  const val = (r) => {
    if (sort.key === 'name') return r.name;
    if (sort.key === 'points') return r.points;
    if (sort.key === 'completion') return r.completion;
    return r.applicable.includes(sort.key) ? r.totals[sort.key] || 0 : null;
  };
  const rows = rep ? [...rep.rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va === vb) return a.name.localeCompare(b.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    return (typeof va === 'string' ? va.localeCompare(vb) : va < vb ? -1 : 1) * sort.dir;
  }) : [];

  const hasPoints = rep && rep.items.some((it) => it.points > 0);
  const showGroup = !group && config.groups.length > 0;
  const SortTh = ({ k, children, cls }) => html`<th class=${(cls || '') + ' sortable'} aria-sort=${sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
    <button onClick=${() => sortBy(k)}>${children}${sort.key === k && html`<${Icon} name=${sort.dir > 0 ? 'chevron-up' : 'chevron-down'} size=${14} />`}</button>
  </th>`;

  return html`
    <${PageHead} title=${t('nav_reports')} sub=${label}>
      <button class="btn" onClick=${() => download('/api/admin/export/summary?' + qs).catch(toastError)} disabled=${!valid}>
        <${Icon} name="download" size=${16} />${t('export_summary')}
      </button>
      <button class="btn" onClick=${() => download('/api/admin/export/entries?' + qs).catch(toastError)} disabled=${!valid}>
        <${Icon} name="download" size=${16} />${t('export_entries')}
      </button>
      <button class="btn" onClick=${() => window.print()}><${Icon} name="printer" size=${16} />${t('print')}</button>
    <//>
    <div class="print-only print-title">
      <h1>${config.settings.orgName || t('app_name')}</h1>
      <p>${label}${group ? ' · ' + groupName(config, group) : ''}</p>
    </div>

    <div class="toolbar no-print">
      <${Seg} value=${mode} onChange=${setMode} label=${t('period')}
        options=${[{ value: 'week', label: t('week') }, { value: 'month', label: t('month') }, { value: 'custom', label: t('custom') }]} />
      ${mode === 'custom'
        ? html`<div class="date-range">
            <input class="input" type="date" value=${custom.from} onChange=${(e) => setCustom({ ...custom, from: e.target.value })} aria-label=${t('from')} />
            <span class="muted">–</span>
            <input class="input" type="date" value=${custom.to} onChange=${(e) => setCustom({ ...custom, to: e.target.value })} aria-label=${t('to')} />
          </div>`
        : html`<div class="period-nav">
            <button class="icon-btn" onClick=${() => shift(-1)} aria-label=${t('previous')}><${Icon} name="chevron-left" /></button>
            <div class="period-label">${label}</div>
            <button class="icon-btn" onClick=${() => shift(1)} aria-label=${t('next')}><${Icon} name="chevron-right" /></button>
            <button class="btn btn-sm" onClick=${() => setAnchor(D.today())}>${mode === 'week' ? t('go_this_week') : t('this_month')}</button>
          </div>`}
      <div class="toolbar-spacer"></div>
      <${GroupFilter} groups=${config.groups} value=${group} onChange=${setGroup} />
    </div>

    ${!valid && html`<div class="notice">${t('err_invalid_date')}</div>`}
    ${rep && valid && (rep.rows.length === 0
      ? html`<div class="card"><${Empty} icon="users" title=${t('no_members_period')} /></div>`
      : html`<div class="card card-flush">
        <div class="table-scroll">
          <table class="table report">
            <thead><tr>
              <th class="rank-col">#</th>
              <${SortTh} k="name" cls="name-col">${t('member')}<//>
              ${showGroup && html`<th>${t('group')}</th>`}
              ${rep.items.map((it) => html`<${SortTh} k=${it.id} cls="num">
                <span class="th-stack"><span class="th-name"><${Dot} color=${it.color} />${it.name}</span>
                <span class="th-sub">${it.unit || ' '}</span></span>
              <//>`)}
              ${hasPoints && html`<${SortTh} k="points" cls="num">${t('points')}<//>`}
              <${SortTh} k="completion" cls="comp-col">${t('completion')}<//>
            </tr></thead>
            <tbody>
              ${rows.map((r, i) => html`<tr key=${r.memberId}>
                <td class="rank-col muted">${i + 1}</td>
                <td class="name-col"><a href=${'#/admin/member/' + r.memberId}>${r.name}</a></td>
                ${showGroup && html`<td class="muted nowrap">${groupName(config, r.groupId)}</td>`}
                ${rep.items.map((it) => {
                  if (!r.applicable.includes(it.id)) return html`<td class="num muted">–</td>`;
                  const v = r.totals[it.id] || 0;
                  const goal = r.targets[it.id] || 0;
                  const lvl = heatLevel(v, goal);
                  return html`<td class=${'num heat heat-' + lvl} title=${goal > 0 ? `${fmtNum(v)} / ${fmtNum(goal)}` : ''}>
                    ${v ? fmtNum(v) : html`<span class="muted">0</span>`}${goal > 0 && html`<span class="cell-goal">/${fmtNum(goal)}</span>`}${lvl === 5 && html`<span class="done-mark" aria-label=${t('goal_reached')}>✓</span>`}
                  </td>`;
                })}
                ${hasPoints && html`<td class="num">${fmtNum(r.points)}</td>`}
                <td class="comp-col"><div class="comp"><${Meter} value=${r.completion} size="sm" /><span class="num">${fmtPct(r.completion)}</span></div></td>
              </tr>`)}
            </tbody>
            <tfoot>
              <tr>
                <td></td><td>${t('total')}</td>${showGroup && html`<td></td>`}
                ${rep.itemStats.map((s) => html`<td class="num">${fmtNum(s.total)}</td>`)}
                ${hasPoints && html`<td class="num">${fmtNum(rep.totalPoints)}</td>`}
                <td></td>
              </tr>
              <tr>
                <td></td><td>${t('average')}</td>${showGroup && html`<td></td>`}
                ${rep.itemStats.map((s) => html`<td class="num">${fmtNum(s.avg)}</td>`)}
                ${hasPoints && html`<td class="num">${rep.rows.length ? fmtNum(rep.totalPoints / rep.rows.length) : 0}</td>`}
                <td class="comp-col"><div class="comp"><${Meter} value=${rep.avgCompletion} size="sm" /><span class="num">${fmtPct(rep.avgCompletion)}</span></div></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`)}
    ${rep && rep.days > 7 && html`<p class="muted small">${t('goals_scaled', { n: rep.days })}</p>`}`;
}

// ---------- fill in for a member ----------

function FillPage({ config, memberId, weekParam }) {
  const members = config.members.filter((m) => m.active);
  const mid = memberId && members.some((m) => m.id === memberId) ? memberId : '';
  const [week, setWeek] = useState(() => D.weekStartOf(D.isDate(weekParam) ? weekParam : D.today(), config.settings.weekStart));
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    if (!mid) return;
    setSheet(null);
    api('GET', `/api/sheet?member=${mid}&week=${week}`).then(setSheet).catch(toastError);
  }, [mid, week]);

  async function save(itemId, date, value) {
    setSheet(await api('PUT', '/api/entry', { memberId: mid, itemId, date, value }));
  }

  const idx = members.findIndex((m) => m.id === mid);
  const pick = (id) => go(`/admin/fill/${id}/${week}`);

  if (!members.length) {
    return html`<${PageHead} title=${t('nav_fill')} />
      <div class="card"><${Empty} icon="users" title=${t('no_members_title')} text=${t('no_members_text')}>
        <a class="btn btn-primary" href="#/admin/members">${t('add_members')}</a><//></div>`;
  }

  return html`
    <${PageHead} title=${t('nav_fill')} sub=${t('fill_sub')} />
    <div class="toolbar">
      <div class="member-picker">
        <button class="icon-btn" disabled=${idx <= 0} onClick=${() => pick(members[idx - 1].id)} aria-label=${t('previous_member')}>
          <${Icon} name="chevron-left" />
        </button>
        <select class="select" value=${mid} onChange=${(e) => pick(e.target.value)} aria-label=${t('member')}>
          <option value="" disabled>${t('choose_member')}</option>
          ${members.map((m) => html`<option value=${m.id}>${m.name}${m.groupId ? ' · ' + groupName(config, m.groupId) : ''}</option>`)}
        </select>
        <button class="icon-btn" disabled=${idx < 0 || idx >= members.length - 1} onClick=${() => pick(members[idx + 1].id)} aria-label=${t('next_member')}>
          <${Icon} name="chevron-right" />
        </button>
      </div>
      <div class="toolbar-spacer"></div>
      <${WeekNav} weekStart=${week} weekStartDay=${config.settings.weekStart} onChange=${setWeek} />
    </div>
    ${!mid
      ? html`<div class="card"><${Empty} icon="pencil" title=${t('choose_member')} text=${t('fill_choose_text')} /></div>`
      : sheet
        ? html`<div class="card">
            <${SheetSummary} sheet=${sheet} />
            <${Sheet} sheet=${sheet} isAdmin=${true} onSave=${save} />
            <p class="muted small sheet-tip">${t('keyboard_tip')}</p>
          </div>
          <${GoalsCard} memberId=${mid} isAdmin=${true}
            onChange=${() => api('GET', `/api/sheet?member=${mid}&week=${week}`).then(setSheet).catch(toastError)} />`
        : html`<div class="loading-block"></div>`}`;
}

// ---------- members ----------

function MemberModal({ config, member, onClose, onSaved }) {
  const isNew = !member;
  const [name, setName] = useState(member ? member.name : '');
  const [groupId, setGroupId] = useState(member ? member.groupId || '' : '');
  const [note, setNote] = useState(member ? member.note || '' : '');
  const [active, setActive] = useState(member ? member.active : true);
  const [pinMode, setPinMode] = useState(member && member.hasPin ? 'keep' : 'none');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const body = { name, groupId: groupId || null, note, active };
    if (pinMode === 'set') {
      if (!/^\d{4,8}$/.test(pin)) return toast(t('err_pin_format'), 'error');
      body.pin = pin;
    } else if (pinMode === 'none' && member && member.hasPin) body.pin = null;
    setBusy(true);
    try {
      if (isNew) await api('POST', '/api/admin/members', body);
      else await api('PUT', '/api/admin/members/' + member.id, body);
      toast(t('saved'));
      onSaved();
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: t('delete_member'), text: t('delete_member_text', { name: member.name }), danger: true, okLabel: t('delete'),
    });
    if (!ok) return;
    try {
      await api('DELETE', '/api/admin/members/' + member.id);
      toast(t('deleted'));
      onSaved(true);
    } catch (err) {
      toastError(err);
    }
  }

  return html`<${Modal} title=${isNew ? t('add_member') : t('edit_member')} onClose=${onClose}
    footer=${html`
      ${!isNew && html`<button type="button" class="btn btn-danger-ghost" onClick=${remove}><${Icon} name="trash" size=${16} />${t('delete')}</button>`}
      <div class="toolbar-spacer"></div>
      <button type="button" class="btn" onClick=${onClose}>${t('cancel')}</button>
      <button class="btn btn-primary" form="member-form" disabled=${busy || !name.trim()}>${t('save')}</button>`}>
    <form id="member-form" class="stack" onSubmit=${submit}>
      <${Field} label=${t('name')}>
        <input class="input" value=${name} maxlength="80" onInput=${(e) => setName(e.target.value)} data-autofocus />
      <//>
      ${config.groups.length > 0 && html`<${Field} label=${t('group')}>
        <select class="select" value=${groupId} onChange=${(e) => setGroupId(e.target.value)}>
          <option value="">${t('no_group')}</option>
          ${config.groups.map((g) => html`<option value=${g.id}>${g.name}</option>`)}
        </select>
      <//>`}
      <${Field} label=${t('pin')} as="div" hint=${t('pin_hint')}>
        <${Seg} value=${pinMode} onChange=${setPinMode} label=${t('pin')}
          options=${[
            ...(member && member.hasPin ? [{ value: 'keep', label: t('pin_keep') }] : []),
            { value: 'none', label: t('pin_none') },
            { value: 'set', label: member && member.hasPin ? t('pin_change') : t('pin_set') },
          ]} />
        ${pinMode === 'set' && html`<input class="input input-pin" inputmode="numeric" maxlength="8" placeholder="1234"
          value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label=${t('new_pin')} />`}
      <//>
      <${Field} label=${t('note')}>
        <input class="input" value=${note} maxlength="200" onInput=${(e) => setNote(e.target.value)} placeholder=${t('note_placeholder')} />
      <//>
      ${!isNew && html`<${Switch} checked=${active} onChange=${setActive} label=${t('active')} hint=${t('member_active_hint')} />`}
    </form>
  <//>`;
}

function BulkModal({ config, onClose, onSaved }) {
  const [text, setText] = useState('');
  const [groupId, setGroupId] = useState('');
  const names = text.split('\n').map((s) => s.trim()).filter(Boolean);
  async function submit(e) {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/admin/members/bulk', { names, groupId: groupId || null });
      toast(t('members_added', { n: r.added }));
      onSaved();
    } catch (err) {
      toastError(err);
    }
  }
  return html`<${Modal} title=${t('bulk_add')} onClose=${onClose}
    footer=${html`<button type="button" class="btn" onClick=${onClose}>${t('cancel')}</button>
      <button class="btn btn-primary" form="bulk-form" disabled=${!names.length}>${t('add_n', { n: names.length })}</button>`}>
    <form id="bulk-form" class="stack" onSubmit=${submit}>
      <${Field} label=${t('names_one_per_line')}>
        <textarea class="input" rows="10" value=${text} onInput=${(e) => setText(e.target.value)} data-autofocus></textarea>
      <//>
      ${config.groups.length > 0 && html`<${Field} label=${t('group')}>
        <select class="select" value=${groupId} onChange=${(e) => setGroupId(e.target.value)}>
          <option value="">${t('no_group')}</option>
          ${config.groups.map((g) => html`<option value=${g.id}>${g.name}</option>`)}
        </select>
      <//>`}
    </form>
  <//>`;
}

function MembersPage({ config, reload }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState(null);

  const list = config.members.filter((m) => (showArchived || m.active) && (!group || m.groupId === group)
    && m.name.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()));
  const archivedCount = config.members.filter((m) => !m.active).length;
  const done = () => {
    setModal(null);
    reload();
  };

  return html`
    <${PageHead} title=${t('nav_members')} sub=${t('n_active_members', { n: config.members.filter((m) => m.active).length })}>
      <button class="btn" onClick=${() => setModal({ bulk: true })}><${Icon} name="users" size=${16} />${t('bulk_add')}</button>
      <button class="btn btn-primary" onClick=${() => setModal({})}><${Icon} name="plus" size=${16} />${t('add_member')}</button>
    <//>
    ${config.members.length === 0
      ? html`<div class="card"><${Empty} icon="users" title=${t('no_members_title')} text=${t('no_members_text')}>
          <button class="btn btn-primary" onClick=${() => setModal({})}>${t('add_member')}</button><//></div>`
      : html`
        <div class="toolbar">
          <div class="search"><${Icon} name="search" size=${16} />
            <input class="input" placeholder=${t('search')} value=${q} onInput=${(e) => setQ(e.target.value)} aria-label=${t('search')} /></div>
          <${GroupFilter} groups=${config.groups} value=${group} onChange=${setGroup} />
          <div class="toolbar-spacer"></div>
          ${archivedCount > 0 && html`<${Switch} checked=${showArchived} onChange=${setShowArchived} label=${t('show_archived', { n: archivedCount })} />`}
        </div>
        <div class="card card-flush">
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>${t('name')}</th>${config.groups.length > 0 && html`<th>${t('group')}</th>`}<th>${t('pin')}</th><th>${t('joined')}</th><th></th></tr></thead>
              <tbody>
                ${list.map((m) => html`<tr key=${m.id} class=${m.active ? '' : 'inactive'}>
                  <td>
                    <a class="strong" href=${'#/admin/member/' + m.id}>${m.name}</a>
                    ${!m.active && html` <span class="badge">${t('archived')}</span>`}
                    ${m.note && html`<div class="muted small">${m.note}</div>`}
                  </td>
                  ${config.groups.length > 0 && html`<td>${m.groupId ? html`<span class="badge"><${Dot} color=${(config.groups.find((g) => g.id === m.groupId) || {}).color} />${groupName(config, m.groupId)}</span>` : html`<span class="muted">—</span>`}</td>`}
                  <td>${m.hasPin ? html`<span class="badge badge-accent"><${Icon} name="lock" size=${12} />${t('pin_on')}</span>` : html`<span class="muted">—</span>`}</td>
                  <td class="muted">${fmtDate(m.createdAt)}</td>
                  <td class="row-actions">
                    ${m.active && html`<a class="btn btn-sm btn-ghost" href=${'#/admin/fill/' + m.id}><${Icon} name="pencil" size=${14} />${t('fill')}</a>`}
                    <button class="btn btn-sm" onClick=${() => setModal({ member: m })}>${t('edit')}</button>
                  </td>
                </tr>`)}
              </tbody>
            </table>
            ${!list.length && html`<p class="muted pad">${t('no_match')}</p>`}
          </div>
        </div>`}
    ${modal && (modal.bulk
      ? html`<${BulkModal} config=${config} onClose=${() => setModal(null)} onSaved=${done} />`
      : html`<${MemberModal} config=${config} member=${modal.member} onClose=${() => setModal(null)} onSaved=${done} />`)}`;
}

function MemberDetail({ config, reload, memberId }) {
  const member = config.members.find((m) => m.id === memberId);
  const [weeks, setWeeks] = useState(12);
  const [metric, setMetric] = useState('completion');
  const [hist, setHist] = useState(null);
  const [edit, setEdit] = useState(false);

  const loadHistory = () => api('GET', `/api/history?member=${memberId}&weeks=${weeks}`).then(setHist).catch(toastError);
  useEffect(() => {
    if (member) loadHistory();
  }, [memberId, weeks]);

  if (!member) return html`<div class="card"><${Empty} title=${t('err_not_found')}><a class="btn" href="#/admin/members">${t('nav_members')}</a><//></div>`;

  const item = hist && hist.items.find((it) => it.id === metric);
  const chartData = hist ? hist.weeks.map((w) => ({
    label: fmtDayMonth(w.weekStart),
    title: fmtRange(w.weekStart, D.addDays(w.weekStart, 6)),
    value: metric === 'completion' ? w.completion : metric === 'points' ? w.points : w.totals[metric] || 0,
  })) : [];
  const hasPoints = hist && hist.items.some((it) => it.points > 0);

  return html`
    <a class="back-link" href="#/admin/members"><${Icon} name="chevron-left" size=${16} />${t('nav_members')}</a>
    <${PageHead} title=${member.name} sub=${[groupName(config, member.groupId), member.note, !member.active && t('archived')].filter(Boolean).join(' · ')}>
      <button class="btn" onClick=${() => setEdit(true)}>${t('edit')}</button>
      ${member.active && html`<a class="btn btn-primary" href=${'#/admin/fill/' + member.id}><${Icon} name="pencil" size=${16} />${t('fill_sheet')}</a>`}
    <//>
    ${hist && html`
      <div class="card">
        <div class="card-head">
          <select class="select" value=${metric} onChange=${(e) => setMetric(e.target.value)} aria-label=${t('show')}>
            <option value="completion">${t('completion')}</option>
            ${hasPoints && html`<option value="points">${t('points')}</option>`}
            ${hist.items.map((it) => html`<option value=${it.id}>${it.name}${it.unit ? ` (${it.unit})` : ''}</option>`)}
          </select>
          <${Seg} value=${weeks} onChange=${setWeeks} label=${t('period')}
            options=${[{ value: 8, label: t('n_weeks', { n: 8 }) }, { value: 12, label: t('n_weeks', { n: 12 }) }, { value: 26, label: t('n_weeks', { n: 26 }) }]} />
        </div>
        <${BarChart} max=${metric === 'completion' ? 1 : undefined} format=${metric === 'completion' ? fmtPct : fmtNum}
          ariaLabel=${metric === 'completion' ? t('completion') : metric === 'points' ? t('points') : item ? item.name : ''} data=${chartData} />
      </div>
      ${member.active && html`<${GoalsCard} memberId=${member.id} isAdmin=${true} onChange=${loadHistory} />`}
      <div class="card card-flush">
        <div class="table-scroll">
          <table class="table report">
            <thead><tr>
              <th>${t('week')}</th>
              ${hist.items.map((it) => html`<th class="num"><span class="th-stack"><span class="th-name"><${Dot} color=${it.color} />${it.name}</span>
                <span class="th-sub">${it.unit || ' '}</span></span></th>`)}
              ${hasPoints && html`<th class="num">${t('points')}</th>`}
              <th class="comp-col">${t('completion')}</th>
            </tr></thead>
            <tbody>
              ${[...hist.weeks].reverse().map((w) => html`<tr>
                <td class="nowrap"><a href=${`#/admin/fill/${member.id}/${w.weekStart}`}>${fmtRange(w.weekStart, D.addDays(w.weekStart, 6))}</a></td>
                ${hist.items.map((it) => {
                  const v = w.totals[it.id] || 0;
                  const goal = w.targets[it.id] || 0;
                  const lvl = heatLevel(v, goal);
                  return html`<td class=${'num heat heat-' + lvl}>${v ? fmtNum(v) : html`<span class="muted">0</span>`}${goal > 0 && html`<span class="cell-goal">/${fmtNum(goal)}</span>`}${lvl === 5 && html`<span class="done-mark">✓</span>`}</td>`;
                })}
                ${hasPoints && html`<td class="num">${fmtNum(w.points)}</td>`}
                <td class="comp-col"><div class="comp"><${Meter} value=${w.completion} size="sm" /><span class="num">${fmtPct(w.completion)}</span></div></td>
              </tr>`)}
            </tbody>
          </table>
        </div>
      </div>`}
    ${edit && html`<${MemberModal} config=${config} member=${member} onClose=${() => setEdit(false)}
      onSaved=${(deleted) => { setEdit(false); reload(); if (deleted) go('/admin/members'); }} />`}`;
}

// ---------- items ----------

function ItemModal({ config, item, onClose, onSaved }) {
  const isNew = !item;
  const [f, setF] = useState(() => item ? { ...item, groupIds: [...(item.groupIds || [])] } : {
    name: '', unit: '', type: 'number', entry: 'daily', weeklyTarget: '', points: '', groupIds: [], description: '',
    color: SWATCHES[config.items.length % SWATCHES.length], active: true,
  });
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v }));
  const onInput = (k) => (e) => set(k)(e.target.value);
  const [busy, setBusy] = useState(false);

  const target = Number(String(f.weeklyTarget).replace(',', '.')) || 0;
  const unitWord = f.unit || t('unit_fallback');
  let explain;
  if (f.type === 'check' && f.entry === 'daily') explain = t('explain_check_daily');
  else if (f.type === 'check') explain = t('explain_check_weekly');
  else if (f.entry === 'daily') explain = t('explain_num_daily', { unit: unitWord });
  else explain = t('explain_num_weekly', { unit: unitWord });
  // Weekly yes/no items have no personal goals; everything else does.
  if (!(f.type === 'check' && f.entry === 'weekly')) {
    explain += ' ' + (target > 0
      ? t('explain_goal', { n: fmtNum(target), unit: f.type === 'check' ? t('days') : unitWord })
      : t('explain_goal_none'));
  }

  async function submit(e) {
    e.preventDefault();
    const body = {
      ...f,
      weeklyTarget: Number(String(f.weeklyTarget).replace(',', '.')) || 0,
      points: Number(String(f.points).replace(',', '.')) || 0,
    };
    setBusy(true);
    try {
      if (isNew) await api('POST', '/api/admin/items', body);
      else await api('PUT', '/api/admin/items/' + item.id, body);
      toast(t('saved'));
      onSaved();
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirmDialog({ title: t('delete_item'), text: t('delete_item_text', { name: item.name }), danger: true, okLabel: t('delete') });
    if (!ok) return;
    try {
      await api('DELETE', '/api/admin/items/' + item.id);
      toast(t('deleted'));
      onSaved();
    } catch (err) {
      toastError(err);
    }
  }

  const toggleGroup = (id) => set('groupIds')(f.groupIds.includes(id) ? f.groupIds.filter((g) => g !== id) : [...f.groupIds, id]);

  return html`<${Modal} title=${isNew ? t('add_item') : t('edit_item')} onClose=${onClose} wide
    footer=${html`
      ${!isNew && html`<button type="button" class="btn btn-danger-ghost" onClick=${remove}><${Icon} name="trash" size=${16} />${t('delete')}</button>`}
      <div class="toolbar-spacer"></div>
      <button type="button" class="btn" onClick=${onClose}>${t('cancel')}</button>
      <button class="btn btn-primary" form="item-form" disabled=${busy || !String(f.name).trim()}>${t('save')}</button>`}>
    <form id="item-form" class="stack" onSubmit=${submit}>
      <${Field} label=${t('item_name')}>
        <input class="input" value=${f.name} maxlength="80" onInput=${onInput('name')} placeholder=${t('item_name_placeholder')} data-autofocus />
      <//>
      <div class="grid-2">
        <${Field} label=${t('what_to_record')} as="div">
          <${Seg} value=${f.type} onChange=${set('type')} label=${t('what_to_record')}
            options=${[{ value: 'number', label: t('type_number') }, { value: 'check', label: t('type_check') }]} />
        <//>
        <${Field} label=${t('how_often')} as="div">
          <${Seg} value=${f.entry} onChange=${set('entry')} label=${t('how_often')}
            options=${[{ value: 'daily', label: t('every_day') }, { value: 'weekly', label: t('once_a_week') }]} />
        <//>
      </div>
      <div class="grid-3">
        ${f.type === 'number' && html`<${Field} label=${t('unit')}>
          <input class="input" value=${f.unit} maxlength="20" onInput=${onInput('unit')} placeholder=${t('unit_placeholder')} />
        <//>`}
        <${Field} label=${t('suggested_goal')} hint=${t('suggested_goal_hint')}>
          <input class="input" inputmode="decimal" value=${f.weeklyTarget} onInput=${onInput('weeklyTarget')}
            placeholder=${f.type === 'check' ? (f.entry === 'daily' ? '5' : '1') : '140'} />
        <//>
        <${Field} label=${t('points_per_unit')} hint=${t('points_hint')}>
          <input class="input" inputmode="decimal" value=${f.points} onInput=${onInput('points')} placeholder="0" />
        <//>
      </div>
      <div class="explain"><${Icon} name="info" size=${16} /><span>${explain}</span></div>
      <${Field} label=${t('description')}>
        <input class="input" value=${f.description} maxlength="200" onInput=${onInput('description')} placeholder=${t('description_placeholder')} />
      <//>
      ${config.groups.length > 0 && html`<${Field} label=${t('applies_to')} as="div">
        <div class="chips">
          <button type="button" class=${'chip' + (!f.groupIds.length ? ' on' : '')} onClick=${() => set('groupIds')([])}>${t('everyone')}</button>
          ${config.groups.map((g) => html`<button type="button" class=${'chip' + (f.groupIds.includes(g.id) ? ' on' : '')} onClick=${() => toggleGroup(g.id)}>
            <${Dot} color=${g.color} />${g.name}</button>`)}
        </div>
      <//>`}
      <${Field} label=${t('color')} as="div"><${ColorPicker} value=${f.color} onChange=${set('color')} /><//>
      ${!isNew && html`<${Switch} checked=${f.active} onChange=${set('active')} label=${t('active')} hint=${t('item_active_hint')} />`}
    </form>
  <//>`;
}

function ItemsPage({ config, reload }) {
  const [modal, setModal] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const items = config.items.filter((it) => showArchived || it.active);
  const archivedCount = config.items.filter((it) => !it.active).length;

  async function move(it, dir) {
    const ids = config.items.map((x) => x.id);
    const i = ids.indexOf(it.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api('POST', '/api/admin/items/order', { ids });
      reload();
    } catch (e) {
      toastError(e);
    }
  }

  const done = () => {
    setModal(null);
    reload();
  };

  return html`
    <${PageHead} title=${t('nav_items')} sub=${t('items_sub')}>
      <button class="btn btn-primary" onClick=${() => setModal({})}><${Icon} name="plus" size=${16} />${t('add_item')}</button>
    <//>
    ${config.items.length === 0
      ? html`<div class="card"><${Empty} icon="list" title=${t('no_items_title')} text=${t('no_items_admin')}>
          <button class="btn btn-primary" onClick=${() => setModal({})}>${t('add_item')}</button><//></div>`
      : html`
        ${archivedCount > 0 && html`<div class="toolbar"><div class="toolbar-spacer"></div>
          <${Switch} checked=${showArchived} onChange=${setShowArchived} label=${t('show_archived', { n: archivedCount })} /></div>`}
        <div class="item-list">
          ${items.map((it) => {
            const gi = config.items.indexOf(it);
            return html`<div class=${'item-row card' + (it.active ? '' : ' inactive')} key=${it.id}>
              <div class="order-btns">
                <button class="icon-btn icon-btn-sm" disabled=${gi === 0} onClick=${() => move(it, -1)} aria-label=${t('move_up')}><${Icon} name="chevron-up" size=${16} /></button>
                <button class="icon-btn icon-btn-sm" disabled=${gi === config.items.length - 1} onClick=${() => move(it, 1)} aria-label=${t('move_down')}><${Icon} name="chevron-down" size=${16} /></button>
              </div>
              <div class="item-row-main">
                <div class="item-row-title"><${Dot} color=${it.color} /><strong>${it.name}</strong>${!it.active && html`<span class="badge">${t('archived')}</span>`}</div>
                <div class="item-row-meta">
                  <span class="badge">${it.type === 'check' ? t('type_check') : t('type_number') + (it.unit ? ' · ' + it.unit : '')}</span>
                  <span class="badge">${it.entry === 'weekly' ? t('once_a_week') : t('every_day')}</span>
                  ${it.weeklyTarget > 0 && html`<span class="badge badge-accent">${t('suggested_per_week', { n: fmtNum(it.weeklyTarget) })}</span>`}
                  ${it.points > 0 && html`<span class="badge">${t('n_points_each', { n: fmtNum(it.points) })}</span>`}
                  ${it.groupIds.length > 0 && html`<span class="badge">${it.groupIds.map((g) => groupName(config, g)).join(', ')}</span>`}
                </div>
                ${it.description && html`<div class="muted small">${it.description}</div>`}
              </div>
              <button class="btn btn-sm" onClick=${() => setModal({ item: it })}>${t('edit')}</button>
            </div>`;
          })}
        </div>`}
    ${modal && html`<${ItemModal} config=${config} item=${modal.item} onClose=${() => setModal(null)} onSaved=${done} />`}`;
}

// ---------- groups ----------

function GroupsPage({ config, reload }) {
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const count = (id) => config.members.filter((m) => m.groupId === id && m.active).length;

  function open(g) {
    setEditing(g || {});
    setName(g ? g.name : '');
    setColor(g ? g.color : SWATCHES[config.groups.length % SWATCHES.length]);
  }

  async function submit(e) {
    e.preventDefault();
    try {
      if (editing.id) await api('PUT', '/api/admin/groups/' + editing.id, { name, color });
      else await api('POST', '/api/admin/groups', { name, color });
      setEditing(null);
      toast(t('saved'));
      reload();
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(g) {
    const ok = await confirmDialog({ title: t('delete_group'), text: t('delete_group_text', { name: g.name }), danger: true, okLabel: t('delete') });
    if (!ok) return;
    try {
      await api('DELETE', '/api/admin/groups/' + g.id);
      setEditing(null);
      reload();
    } catch (err) {
      toastError(err);
    }
  }

  return html`
    <${PageHead} title=${t('nav_groups')} sub=${t('groups_sub')}>
      <button class="btn btn-primary" onClick=${() => open(null)}><${Icon} name="plus" size=${16} />${t('add_group')}</button>
    <//>
    ${config.groups.length === 0
      ? html`<div class="card"><${Empty} icon="layers" title=${t('no_groups_title')} text=${t('no_groups_text')}>
          <button class="btn btn-primary" onClick=${() => open(null)}>${t('add_group')}</button><//></div>`
      : html`<div class="card card-flush"><table class="table">
          <thead><tr><th>${t('name')}</th><th class="num">${t('nav_members')}</th><th></th></tr></thead>
          <tbody>${config.groups.map((g) => html`<tr key=${g.id}>
            <td><span class="item-name"><${Dot} color=${g.color} /> ${g.name}</span></td>
            <td class="num">${count(g.id)}</td>
            <td class="row-actions"><button class="btn btn-sm" onClick=${() => open(g)}>${t('edit')}</button></td>
          </tr>`)}</tbody>
        </table></div>`}
    ${editing && html`<${Modal} title=${editing.id ? t('edit_group') : t('add_group')} small onClose=${() => setEditing(null)}
      footer=${html`
        ${editing.id && html`<button type="button" class="btn btn-danger-ghost" onClick=${() => remove(editing)}><${Icon} name="trash" size=${16} />${t('delete')}</button>`}
        <div class="toolbar-spacer"></div>
        <button type="button" class="btn" onClick=${() => setEditing(null)}>${t('cancel')}</button>
        <button class="btn btn-primary" form="group-form" disabled=${!name.trim()}>${t('save')}</button>`}>
      <form id="group-form" class="stack" onSubmit=${submit}>
        <${Field} label=${t('name')}><input class="input" value=${name} maxlength="60" onInput=${(e) => setName(e.target.value)} data-autofocus /><//>
        <${Field} label=${t('color')} as="div"><${ColorPicker} value=${color} onChange=${setColor} /><//>
      </form>
    <//>`}`;
}

// ---------- settings ----------

function SettingsPage({ config, reload }) {
  const { status, changeLang, refreshStatus, logout } = useContext(AppCtx);
  const s = config.settings;
  const [f, setF] = useState({
    orgName: s.orgName, language: s.language, weekStart: s.weekStart, memberEditWeeks: s.memberEditWeeks,
    csvDelimiter: s.csvDelimiter, fillDay: s.fillDay ?? null,
  });
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v }));
  const [net, setNet] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });

  const loadNet = () => api('GET', '/api/admin/network').then(setNet).catch(toastError);
  useEffect(() => {
    loadNet();
  }, []);

  async function saveGeneral(e) {
    e.preventDefault();
    try {
      await api('PUT', '/api/admin/settings', { ...f, memberEditWeeks: Number(f.memberEditWeeks) });
      changeLang(f.language);
      await refreshStatus();
      reload();
      toast(t('saved'));
    } catch (err) {
      toastError(err);
    }
  }

  async function toggleLan(enabled) {
    try {
      await api('POST', '/api/admin/network', { enabled });
      setTimeout(loadNet, 700);
    } catch (err) {
      toastError(err);
    }
  }

  async function toggleRemoteAdmin(v) {
    try {
      await api('PUT', '/api/admin/settings', { allowAdminRemote: v });
      loadNet();
    } catch (err) {
      toastError(err);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (pw.next.length < 4) return toast(t('err_password_short'), 'error');
    if (pw.next !== pw.again) return toast(t('err_password_mismatch'), 'error');
    try {
      await api('POST', '/api/admin/password', { current: pw.current, next: pw.next });
      setPw({ current: '', next: '', again: '' });
      toast(t('password_changed'));
    } catch (err) {
      toastError(err);
    }
  }

  async function restore(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast(t('err_invalid_backup'), 'error');
    }
    const ok = await confirmDialog({ title: t('restore_backup'), text: t('restore_confirm', { name: file.name }), danger: true, okLabel: t('restore') });
    if (!ok) return;
    try {
      await api('POST', '/api/admin/restore', { data });
      toast(t('restored'));
      setTimeout(logout, 600);
    } catch (err) {
      toastError(err);
    }
  }

  // Preview of the next fill-in day and which week it asks for.
  let fillExample = '';
  if (f.fillDay != null) {
    const today = D.today();
    const next = D.addDays(today, (f.fillDay - D.dow(today) + 7) % 7);
    const due = D.dueWeekFor(next, f.weekStart);
    fillExample = t('fill_day_example', { day: `${dayLong(f.fillDay)}, ${fmtDayMonth(next)}`, range: fmtRange(due, D.addDays(due, 6)) });
  }

  const editOptions = [0, 1, 2, 4, 10000].map((n) => ({ value: n, label: n === 0 ? t('edit_current_only') : n === 10000 ? t('edit_any') : t('edit_n_weeks', { n }) }));

  return html`
    <${PageHead} title=${t('nav_settings')} />
    <div class="settings">
      <form class="card stack" onSubmit=${saveGeneral}>
        <h2>${t('general')}</h2>
        <${Field} label=${t('org_name')} hint=${t('org_name_hint')}>
          <input class="input" value=${f.orgName} maxlength="80" onInput=${(e) => set('orgName')(e.target.value)} />
        <//>
        <${Field} label=${t('language')} as="div">
          <${Seg} value=${f.language} onChange=${set('language')} label=${t('language')}
            options=${LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))} />
        <//>
        <${Field} label=${t('week_starts')} as="div">
          <${Seg} value=${f.weekStart} onChange=${set('weekStart')} label=${t('week_starts')}
            options=${[{ value: 1, label: t('monday') }, { value: 6, label: t('saturday') }, { value: 0, label: t('sunday') }]} />
        <//>
        <${Field} label=${t('fill_day')} hint=${fillExample || t('fill_day_hint')}>
          <select class="select" value=${f.fillDay == null ? '' : String(f.fillDay)}
            onChange=${(e) => set('fillDay')(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">${t('fill_day_off')}</option>
            ${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<option value=${String(d)}>${dayLong(d)}</option>`)}
          </select>
        <//>
        <${Field} label=${t('member_edit_window')} hint=${t('member_edit_hint')}>
          <select class="select" value=${f.memberEditWeeks} onChange=${(e) => set('memberEditWeeks')(Number(e.target.value))}>
            ${editOptions.map((o) => html`<option value=${o.value}>${o.label}</option>`)}
          </select>
        <//>
        <${Field} label=${t('csv_delimiter')} as="div" hint=${t('csv_delimiter_hint')}>
          <${Seg} value=${f.csvDelimiter} onChange=${set('csvDelimiter')} label=${t('csv_delimiter')}
            options=${[{ value: ',', label: t('comma') + ' ( , )' }, { value: ';', label: t('semicolon') + ' ( ; )' }]} />
        <//>
        <div><button class="btn btn-primary">${t('save')}</button></div>
      </form>

      <div class="card stack">
        <h2><${Icon} name="wifi" size=${18} /> ${t('network')}</h2>
        <p class="muted">${t('network_text')}</p>
        ${net && html`
          <${Switch} checked=${net.enabled} onChange=${toggleLan} disabled=${!status.isLocal} label=${t('lan_enable')} hint=${!status.isLocal ? t('only_on_this_computer') : ''} />
          ${net.enabled && html`
            ${net.urls.length
              ? html`<div class="lan-box">
                  ${net.qr && html`<div class="qr" dangerouslySetInnerHTML=${{ __html: net.qr }}></div>`}
                  <div class="stack-sm">
                    <div class="muted small">${t('lan_open_this')}</div>
                    ${net.urls.map((u) => html`<code class="lan-url">${u}</code>`)}
                    <div class="muted small">${t('lan_same_wifi')}</div>
                  </div>
                </div>`
              : html`<div class="notice">${t('lan_no_network')}</div>`}
            <div class="notice notice-soft"><${Icon} name="info" size=${16} />${t('lan_firewall')}</div>
            <${Switch} checked=${net.allowAdminRemote} onChange=${toggleRemoteAdmin} label=${t('allow_admin_remote')} hint=${t('allow_admin_remote_hint')} />`}
        `}
      </div>

      <div class="card stack">
        <h2><${Icon} name="archive" size=${18} /> ${t('backup')}</h2>
        <p class="muted">${t('backup_text')}</p>
        <div class="btn-row">
          <button class="btn" onClick=${() => download('/api/admin/backup').catch(toastError)}><${Icon} name="download" size=${16} />${t('download_backup')}</button>
          <label class="btn"><${Icon} name="upload" size=${16} />${t('restore_backup')}
            <input type="file" accept=".json,application/json" class="sr-only" onChange=${restore} /></label>
          ${status.isLocal && html`<button class="btn btn-ghost" onClick=${() => api('POST', '/api/admin/open-data-dir').catch(toastError)}>
            <${Icon} name="folder" size=${16} />${t('open_data_folder')}</button>`}
        </div>
        ${status.isLocal && html`<div class="muted small">${t('data_location')}: <code>${config.dataDir}</code></div>`}
      </div>

      <form class="card stack" onSubmit=${changePassword}>
        <h2><${Icon} name="key" size=${18} /> ${t('admin_password')}</h2>
        <div class="grid-3">
          <${Field} label=${t('current_password')}><input class="input" type="password" value=${pw.current} onInput=${(e) => setPw({ ...pw, current: e.target.value })} autocomplete="current-password" /><//>
          <${Field} label=${t('new_password')}><input class="input" type="password" value=${pw.next} onInput=${(e) => setPw({ ...pw, next: e.target.value })} autocomplete="new-password" /><//>
          <${Field} label=${t('repeat_password')}><input class="input" type="password" value=${pw.again} onInput=${(e) => setPw({ ...pw, again: e.target.value })} autocomplete="new-password" /><//>
        </div>
        <div><button class="btn" disabled=${!pw.current || !pw.next}>${t('change_password')}</button></div>
      </form>

      <p class="muted small center">${t('app_name')} ${status.version} · ${t('offline_note')}</p>
    </div>`;
}
