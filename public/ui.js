import { html, useState, useEffect, useRef, useContext } from './vendor/preact-htm.js';
import { t, fmtNum, fmtPct, fmtInput, fmtRange, dayShort, LANGS, LANG_NAMES } from './i18n.js';
import { AppCtx } from './ctx.js';
import { api } from './api.js';
import * as D from './dates.js';

// ---------- routing ----------

export function useRoute() {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const f = () => setH(location.hash.slice(1) || '/');
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

export const go = (p) => {
  location.hash = p;
};

// Ref callback: focus an element once, when it first appears.
export const focusOnMount = (el) => {
  if (el && !el._focused) {
    el._focused = true;
    setTimeout(() => el.focus(), 0);
  }
};

export function useMedia(q) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

// ---------- icons ----------

const ICONS = {
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-up': '<path d="m18 15-6-6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  list: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  wifi: '<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0"/><path d="M12 20h.01"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};

export function Icon({ name, size = 18 }) {
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: ICONS[name] || '' }}></svg>`;
}

// Tally marks: the traditional çetele.
export function Logo({ size = 32 }) {
  return html`<svg class="logo" width=${size} height=${size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="var(--accent)" />
    <g stroke="var(--on-accent)" stroke-width="2.4" stroke-linecap="round">
      <path d="M9.5 9v14M14 9v14M18.5 9v14M23 9v14" />
      <path d="M6.5 20 25.5 12" />
    </g>
  </svg>`;
}

// ---------- toasts & dialogs ----------

const toastListeners = new Set();
let toastSeq = 0;

export function toast(text, kind = 'ok') {
  const item = { id: ++toastSeq, text, kind };
  toastListeners.forEach((f) => f(item));
}

export function toastError(e) {
  const code = e && typeof e.message === 'string' && e.message.startsWith('err_') ? e.message : 'err_server';
  toast(t(code), 'error');
}

export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const f = (item) => {
      setList((l) => [...l, item]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== item.id)), 3500);
    };
    toastListeners.add(f);
    return () => toastListeners.delete(f);
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${list.map((x) => html`<div key=${x.id} class=${'toast toast-' + x.kind}>
      <${Icon} name=${x.kind === 'error' ? 'info' : 'check'} size=${16} />${x.text}
    </div>`)}
  </div>`;
}

let dialogSetter = null;

export function confirmDialog(opts) {
  return new Promise((resolve) => (dialogSetter ? dialogSetter({ ...opts, resolve }) : resolve(window.confirm(opts.text))));
}

export function Dialogs() {
  const [d, setD] = useState(null);
  useEffect(() => {
    dialogSetter = setD;
    return () => {
      dialogSetter = null;
    };
  }, []);
  if (!d) return null;
  const close = (v) => {
    setD(null);
    d.resolve(v);
  };
  return html`<${Modal} title=${d.title} small onClose=${() => close(false)}
    footer=${html`
      <button class="btn" onClick=${() => close(false)}>${t('cancel')}</button>
      <button class=${'btn ' + (d.danger ? 'btn-danger' : 'btn-primary')} data-autofocus onClick=${() => close(true)}>
        ${d.okLabel || t('ok')}
      </button>`}>
    <p class="dialog-text">${d.text}</p>
  <//>`;
}

export function Modal({ title, onClose, children, footer, small, wide }) {
  const ref = useRef();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    const node = ref.current;
    node.addEventListener('keydown', onKey);
    const el = node.querySelector('[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea');
    setTimeout(() => (el || node).focus(), 20);
    return () => {
      node.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, []);
  return html`<div class="modal-backdrop" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${'modal' + (small ? ' modal-sm' : '') + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true"
      aria-label=${title} ref=${ref} tabindex="-1">
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="icon-btn" onClick=${onClose} aria-label=${t('close')}><${Icon} name="x" /></button>
      </div>
      <div class="modal-body">${children}</div>
      ${footer && html`<div class="modal-foot">${footer}</div>`}
    </div>
  </div>`;
}

// ---------- form bits ----------

export function Field({ label, hint, children, as }) {
  const inner = html`<span class="field-label">${label}</span>${children}${hint && html`<span class="field-hint">${hint}</span>`}`;
  return as === 'div' ? html`<div class="field">${inner}</div>` : html`<label class="field">${inner}</label>`;
}

export function Seg({ value, options, onChange, label }) {
  return html`<div class="seg" role="radiogroup" aria-label=${label}>
    ${options.map((o) => html`<button type="button" role="radio" aria-checked=${value === o.value}
      class=${value === o.value ? 'on' : ''} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

export function Switch({ checked, onChange, label, hint, disabled }) {
  return html`<label class=${'switch-row' + (disabled ? ' disabled' : '')}>
    <span class="switch">
      <input type="checkbox" role="switch" checked=${checked} disabled=${disabled} onChange=${(e) => onChange(e.target.checked)} />
      <span class="slider"></span>
    </span>
    <span class="switch-text">
      <span class="switch-label">${label}</span>
      ${hint && html`<span class="field-hint">${hint}</span>`}
    </span>
  </label>`;
}

export const SWATCHES = ['#2f7d5b', '#2d6fb7', '#7a4fb5', '#c2571a', '#b8342f', '#a07a12', '#1f8a96', '#c03d7c', '#5b6770'];

export function ColorPicker({ value, onChange }) {
  return html`<div class="swatches" role="radiogroup">
    ${SWATCHES.map((c) => html`<button type="button" role="radio" aria-checked=${value === c} aria-label=${c}
      class=${'swatch' + (value === c ? ' on' : '')} style=${{ '--c': c }} onClick=${() => onChange(c)}></button>`)}
  </div>`;
}

export function Meter({ value, size }) {
  const pct = value == null ? 0 : Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return html`<div class=${'meter' + (size ? ' meter-' + size : '') + (pct >= 100 ? ' full' : '')}
    role="progressbar" aria-valuenow=${pct} aria-valuemin="0" aria-valuemax="100">
    <div class="meter-fill" style=${{ width: pct + '%' }}></div>
  </div>`;
}

export function Empty({ icon = 'info', title, text, children }) {
  return html`<div class="empty">
    <div class="empty-icon"><${Icon} name=${icon} size=${22} /></div>
    <div class="empty-title">${title}</div>
    ${text && html`<p class="empty-text">${text}</p>`}
    ${children}
  </div>`;
}

export function PageHead({ title, sub, children }) {
  return html`<div class="page-head">
    <div>
      <h1>${title}</h1>
      ${sub && html`<div class="page-sub">${sub}</div>`}
    </div>
    ${children && html`<div class="page-actions">${children}</div>`}
  </div>`;
}

export function Dot({ color }) {
  return html`<span class="dot" style=${{ background: color }}></span>`;
}

// ---------- language & theme ----------

export function LangSwitch({ compact }) {
  const { lang, changeLang } = useContext(AppCtx);
  return html`<label class=${'lang-switch' + (compact ? ' compact' : '')} title=${t('language')}>
    <${Icon} name="globe" size=${16} />
    <select value=${lang} onChange=${(e) => changeLang(e.target.value)} aria-label=${t('language')}>
      ${LANGS.map((l) => html`<option value=${l}>${LANG_NAMES[l]}</option>`)}
    </select>
  </label>`;
}

const THEME_KEY = 'davom.theme';

export function applyStoredTheme() {
  let v = 'auto';
  try {
    v = localStorage.getItem(THEME_KEY) || 'auto';
  } catch {
    /* ignore */
  }
  if (v === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
  return v;
}

export function ThemeToggle() {
  const [mode, setMode] = useState(applyStoredTheme);
  const next = { auto: 'light', light: 'dark', dark: 'auto' }[mode];
  const set = () => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    setMode(applyStoredTheme());
  };
  const icon = mode === 'auto' ? 'monitor' : mode === 'light' ? 'sun' : 'moon';
  return html`<button class="icon-btn" onClick=${set} title=${t('theme_' + mode)} aria-label=${t('theme_' + mode)}>
    <${Icon} name=${icon} size=${17} />
  </button>`;
}

// ---------- period navigation ----------

export function WeekNav({ weekStart, weekStartDay, onChange }) {
  const cur = D.weekStartOf(D.today(), weekStartDay);
  return html`<div class="period-nav">
    <button class="icon-btn" onClick=${() => onChange(D.addDays(weekStart, -7))} aria-label=${t('prev_week')}>
      <${Icon} name="chevron-left" />
    </button>
    <div class="period-label">${fmtRange(weekStart, D.addDays(weekStart, 6))}</div>
    <button class="icon-btn" onClick=${() => onChange(D.addDays(weekStart, 7))} aria-label=${t('next_week')}>
      <${Icon} name="chevron-right" />
    </button>
    ${weekStart === cur
      ? html`<span class="badge badge-accent">${t('this_week')}</span>`
      : html`<button class="btn btn-sm" onClick=${() => onChange(cur)}>${t('go_this_week')}</button>`}
  </div>`;
}

// ---------- chart ----------

function niceMax(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 2, 2.5, 5, 10]) if (s * mag >= v) return s * mag;
  return 10 * mag;
}

function barPath(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// Single-series column chart. data: [{ label, title, value }]; the last column is the current period.
export function BarChart({ data, max, format = fmtNum, height = 190, ariaLabel }) {
  const ref = useRef();
  const [w, setW] = useState(0);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 44;
  const padR = 8;
  const padT = 24;
  const padB = 26;
  const vals = data.map((d) => d.value).filter((v) => v != null);
  const top = max != null ? max : niceMax(Math.max(0, ...vals));
  const ticks = [0, top / 2, top];
  const plotW = Math.max(0, w - padL - padR);
  const plotH = height - padT - padB;
  const band = data.length ? plotW / data.length : 0;
  const bw = Math.max(4, Math.min(24, band * 0.6));
  const y = (v) => padT + plotH - (Math.min(v, top) / top) * plotH;
  const every = band > 0 && band < 52 ? Math.ceil(52 / band) : 1;
  const last = data.length - 1;

  let tip = null;
  if (hover != null && data[hover]) {
    const cx = padL + band * hover + band / 2;
    tip = html`<div class="chart-tip" style=${{ left: Math.min(Math.max(cx, 70), w - 70) + 'px' }}>
      <span class="chart-tip-title">${data[hover].title || data[hover].label}</span>
      <strong>${data[hover].value == null ? t('no_data') : format(data[hover].value)}</strong>
    </div>`;
  }

  return html`<div class="chart" ref=${ref} style=${{ height: height + 'px' }} onMouseLeave=${() => setHover(null)}>
    ${w > 0 && html`<svg width=${w} height=${height} role="img" aria-label=${ariaLabel}>
      ${ticks.map((tv) => html`<g>
        <line x1=${padL} x2=${w - padR} y1=${y(tv)} y2=${y(tv)} class=${tv === 0 ? 'axis' : 'grid'} />
        <text x=${padL - 8} y=${y(tv)} class="tick" text-anchor="end" dominant-baseline="middle">${format(tv)}</text>
      </g>`)}
      ${data.map((d, i) => {
        const cx = padL + band * i + band / 2;
        const has = d.value != null && d.value > 0;
        const h = has ? Math.max(2, plotH - (y(d.value) - padT)) : 0;
        const by = padT + plotH - h;
        const showLabel = (last - i) % every === 0;
        return html`<g key=${i}>
          ${has && html`<path d=${barPath(cx - bw / 2, by, bw, h, 4)}
            class=${'bar' + (i === last ? ' bar-current' : '') + (hover === i ? ' bar-hover' : '')} />`}
          ${i === last && d.value != null && html`<text x=${cx} y=${(has ? by : padT + plotH) - 7} class="bar-value" text-anchor="middle">${format(d.value)}</text>`}
          ${showLabel && html`<text x=${cx} y=${height - 7} class="tick" text-anchor="middle">${d.label}</text>`}
          <rect x=${padL + band * i} y=${padT} width=${band} height=${plotH} fill="transparent"
            onMouseEnter=${() => setHover(i)} onClick=${() => setHover(i)} />
        </g>`;
      })}
    </svg>`}
    ${tip}
    <div class="sr-only">
      <table>
        <caption>${ariaLabel}</caption>
        ${data.map((d) => html`<tr><th>${d.title || d.label}</th><td>${d.value == null ? '—' : format(d.value)}</td></tr>`)}
      </table>
    </div>
  </div>`;
}

// ---------- the weekly sheet (used by members and by the admin "fill in" page) ----------

function parseValue(raw) {
  const s = String(raw).trim().replace(',', '.');
  if (s === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function ItemLabel({ it, showGoal }) {
  const sub = [];
  if (it.type === 'number' && it.unit) sub.push(it.unit);
  if (showGoal && it.goal > 0) sub.push(t('goal_per_week', { n: fmtNum(it.goal) }));
  if (it.description) sub.push(it.description);
  return html`<div class="item-label">
    <${Dot} color=${it.color} />
    <div>
      <div class="item-name">${it.name}</div>
      ${sub.length > 0 && html`<div class="item-sub">${sub.join(' · ')}</div>`}
    </div>
  </div>`;
}

function GoalCell({ it, total }) {
  if (!(it.goal > 0)) return html`<span class="muted">—</span>`;
  return html`<div class="goal-cell">
    <${Meter} value=${total / it.goal} size="sm" />
    <span class="goal-text">${fmtNum(total)} / ${fmtNum(it.goal)}</span>
  </div>`;
}

export function Sheet({ sheet, isAdmin, onSave }) {
  const narrow = useMedia('(max-width: 760px)');
  const [drafts, setDrafts] = useState({});
  const [state, setState] = useState('idle');
  const td = D.today();
  const initialDay = () => (sheet.days.includes(td) ? td : sheet.days[0]);
  const [selDay, setSelDay] = useState(initialDay);
  useEffect(() => setSelDay(initialDay()), [sheet.weekStart]);

  const daily = sheet.items.filter((it) => it.entry !== 'weekly');
  const weekly = sheet.items.filter((it) => it.entry === 'weekly');
  const canEdit = (it, d) => sheet.editable && (isAdmin || it.entry === 'weekly' || d <= td);
  const serverVal = (it, d) => (it.entry === 'weekly' ? sheet.totals[it.id] || 0 : (sheet.values[d] || {})[it.id] || 0);
  const dropDraft = (key) =>
    setDrafts((dr) => {
      const n = { ...dr };
      delete n[key];
      return n;
    });

  async function commit(it, d, raw) {
    const key = it.id + '|' + d;
    const value = it.type === 'check' ? (raw ? 1 : 0) : parseValue(raw);
    if (value == null) {
      toast(t('err_invalid_number'), 'error');
      dropDraft(key);
      return;
    }
    if (value === serverVal(it, d)) {
      dropDraft(key);
      return;
    }
    setState('saving');
    try {
      await onSave(it.id, d, value);
      setState('saved');
    } catch (e) {
      toastError(e);
      setState('error');
    }
    dropDraft(key);
  }

  function onKey(e) {
    const r = Number(e.target.dataset.r);
    const c = e.target.dataset.c;
    let nr;
    if (e.key === 'Enter' || e.key === 'ArrowDown') nr = r + 1;
    else if (e.key === 'ArrowUp') nr = r - 1;
    else return;
    e.preventDefault();
    const root = e.target.closest('.sheet-wrap');
    const el = root.querySelector(`[data-r="${nr}"][data-c="${c}"]`);
    if (el) el.focus();
    else e.target.blur();
  }

  function cell(it, d, r, c) {
    const key = it.id + '|' + d;
    const v = serverVal(it, d);
    const disabled = !canEdit(it, d);
    const label = `${it.name} ${d}`;
    if (it.type === 'check') {
      const on = v > 0;
      return html`<button type="button" class=${'check-cell' + (on ? ' on' : '')} aria-pressed=${on} aria-label=${label}
        disabled=${disabled} data-r=${r} data-c=${c} onKeyDown=${onKey} onClick=${() => commit(it, d, !on)}>
        ${on && html`<${Icon} name="check" size=${16} />`}
      </button>`;
    }
    const shown = drafts[key] !== undefined ? drafts[key] : fmtInput(v);
    return html`<input class="cell-input" inputmode="decimal" autocomplete="off" aria-label=${label}
      data-r=${r} data-c=${c} value=${shown} disabled=${disabled} placeholder=${disabled ? '–' : ' '}
      onFocus=${(e) => e.target.select()}
      onInput=${(e) => setDrafts((dr) => ({ ...dr, [key]: e.target.value }))}
      onBlur=${(e) => commit(it, d, e.target.value)}
      onKeyDown=${onKey} />`;
  }

  const stateEl = html`<div class=${'save-state save-' + state} aria-live="polite">
    ${state === 'saving' && t('saving')}
    ${state === 'saved' && html`<${Icon} name="check" size=${14} /> ${t('saved')}`}
    ${state === 'error' && t('not_saved')}
  </div>`;

  if (!sheet.items.length) {
    return html`<${Empty} icon="list" title=${t('no_items_title')} text=${t(isAdmin ? 'no_items_admin' : 'no_items_member')} />`;
  }

  if (narrow) {
    const hasData = (d) => sheet.values[d] && Object.keys(sheet.values[d]).length > 0;
    return html`<div class="sheet-wrap sheet-mobile">
      ${stateEl}
      ${daily.length > 0 && html`
        <div class="day-chips" role="tablist">
          ${sheet.days.map((d) => html`<button role="tab" aria-selected=${d === selDay}
            class=${'day-chip' + (d === selDay ? ' on' : '') + (d === td ? ' is-today' : '') + (hasData(d) ? ' has-data' : '')}
            onClick=${() => setSelDay(d)}>
            <span class="dow">${dayShort(d)}</span><span class="dnum">${D.dayNum(d)}</span>
          </button>`)}
        </div>
        <div class="m-list">
          ${daily.map((it, r) => html`<div class="m-row" key=${it.id + selDay}>
            <${ItemLabel} it=${it} showGoal />${cell(it, selDay, r, 'm')}
          </div>`)}
        </div>`}
      ${weekly.length > 0 && html`
        <h3 class="m-section">${t('weekly_items')}</h3>
        <div class="m-list">
          ${weekly.map((it, r) => html`<div class="m-row" key=${it.id}>
            <${ItemLabel} it=${it} showGoal />${cell(it, sheet.weekStart, r, 'mw')}
          </div>`)}
        </div>`}
      <h3 class="m-section">${t('week_progress')}</h3>
      <div class="m-list">
        ${sheet.items.map((it) => html`<div class="m-progress" key=${it.id}>
          <div class="m-progress-head">
            <span class="item-name"><${Dot} color=${it.color} /> ${it.name}</span>
            <span class="num">${fmtNum(sheet.totals[it.id] || 0)}${it.goal > 0 ? ' / ' + fmtNum(it.goal) : ''}</span>
          </div>
          ${it.goal > 0 && html`<${Meter} value=${(sheet.totals[it.id] || 0) / it.goal} size="sm" />`}
        </div>`)}
      </div>
    </div>`;
  }

  return html`<div class="sheet-wrap">
    ${stateEl}
    <div class="table-scroll">
      <table class="sheet">
        <thead>
          <tr>
            <th class="sheet-item">${t('item')}</th>
            ${sheet.days.map((d) => html`<th class=${'sheet-day' + (d === td ? ' is-today' : '')}>
              <span class="dow">${dayShort(d)}</span><span class="dnum">${D.dayNum(d)}</span>
            </th>`)}
            <th class="sheet-total">${t('total')}</th>
            <th class="sheet-goal">${t('goal')}</th>
          </tr>
        </thead>
        <tbody>
          ${sheet.items.map((it, r) => html`<tr key=${it.id} class=${it.active ? '' : 'inactive'}>
            <td class="sheet-item"><${ItemLabel} it=${it} /></td>
            ${it.entry === 'weekly'
              ? html`<td colspan="7" class="sheet-weekly">
                  <div class="weekly-inner">${cell(it, sheet.weekStart, r, 'w')}<span class="item-sub">${t('weekly_entry_hint')}</span></div>
                </td>`
              : sheet.days.map((d, c) => html`<td class=${'sheet-cell' + (d === td ? ' is-today' : '')}>${cell(it, d, r, c)}</td>`)}
            <td class="sheet-total num">${fmtNum(sheet.totals[it.id] || 0)}</td>
            <td class="sheet-goal"><${GoalCell} it=${it} total=${sheet.totals[it.id] || 0} /></td>
          </tr>`)}
        </tbody>
      </table>
    </div>
  </div>`;
}

// Each member's own weekly goal per item. Members edit their own; the admin can edit anyone's.
export function GoalsCard({ memberId, isAdmin, onChange, onLoaded, id }) {
  const [g, setG] = useState(null);
  const [drafts, setDrafts] = useState({});
  const q = memberId ? '?member=' + encodeURIComponent(memberId) : '';
  const loaded = (r) => {
    setG(r);
    if (onLoaded) onLoaded(r);
  };
  useEffect(() => {
    api('GET', '/api/goals' + q).then(loaded).catch(toastError);
  }, [memberId]);
  const dropDraft = (key) =>
    setDrafts((dr) => {
      const n = { ...dr };
      delete n[key];
      return n;
    });

  async function commit(it, raw) {
    const s = String(raw).trim();
    const value = s === '' ? null : parseValue(s);
    if (s !== '' && value == null) {
      toast(t('err_invalid_number'), 'error');
      return dropDraft(it.id);
    }
    if (value === (it.custom ? it.goal : null)) return dropDraft(it.id);
    try {
      loaded(await api('PUT', '/api/goal', { memberId, itemId: it.id, value }));
      toast(t('saved'));
      if (onChange) onChange();
    } catch (e) {
      toastError(e);
    }
    dropDraft(it.id);
  }

  if (!g) return null;
  return html`<div class="card" id=${id}>
    <div class="card-head">
      <div>
        <h2>${t(isAdmin ? 'goals_title' : 'my_goals')}</h2>
        <p class="muted small card-sub">${t(isAdmin ? 'goals_sub_admin' : 'goals_sub_member')}</p>
      </div>
    </div>
    ${!g.items.length
      ? html`<p class="muted">${t('no_goal_items')}</p>`
      : html`<div class="goal-list">
        ${g.items.map((it) => {
          const shown = drafts[it.id] !== undefined ? drafts[it.id] : it.custom ? fmtInput(it.goal) : '';
          const unit = it.type === 'check' ? t('days') : it.unit;
          return html`<div class="goal-row" key=${it.id}>
            <div class="goal-row-label">
              <${ItemLabel} it=${{ ...it, unit: '', description: '' }} />
              <div class="goal-row-meta">
                ${it.suggested > 0 && html`<span class="muted small">${t('suggested_n', { n: fmtNum(it.suggested) })}</span>`}
                ${!it.custom && html`<span class="badge badge-warn">${t('goal_not_set')}</span>`}
              </div>
            </div>
            <div class="goal-input">
              <input class="cell-input" inputmode="decimal" autocomplete="off" aria-label=${it.name}
                value=${shown} placeholder=${it.suggested > 0 ? fmtInput(it.suggested) : '–'}
                onInput=${(e) => setDrafts((dr) => ({ ...dr, [it.id]: e.target.value }))}
                onBlur=${(e) => commit(it, e.target.value)}
                onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />
              <span class="muted small">${unit ? unit + ' ' : ''}${t('per_week')}</span>
            </div>
          </div>`;
        })}
      </div>`}
  </div>`;
}

export function SheetSummary({ sheet }) {
  const hasPoints = sheet.items.some((it) => it.points > 0);
  const activeDays = sheet.days.filter((d) => sheet.values[d] && Object.keys(sheet.values[d]).length).length;
  return html`<div class="summary-strip">
    <div class="summary-main">
      <div class="summary-label">${t('completion')}</div>
      <div class="summary-value">${fmtPct(sheet.completion)}</div>
      <${Meter} value=${sheet.completion} />
    </div>
    ${hasPoints && html`<div class="summary-stat"><div class="summary-label">${t('points')}</div><div class="summary-num">${fmtNum(sheet.points)}</div></div>`}
    <div class="summary-stat"><div class="summary-label">${t('active_days')}</div><div class="summary-num">${activeDays} / 7</div></div>
  </div>`;
}

