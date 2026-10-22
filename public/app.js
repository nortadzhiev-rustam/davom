import { html, render, useState, useEffect, useContext } from './vendor/preact-htm.js';
import { api, getToken, setToken, onUnauthorized } from './api.js';
import { t, setLang, LANGS, LANG_NAMES, guessLang } from './i18n.js';
import { AppCtx } from './ctx.js';
import { Toasts, Dialogs, Logo, Icon, Field, Seg, Switch, LangSwitch, ThemeToggle, applyStoredTheme, go, focusOnMount } from './ui.js';
import { AdminApp } from './admin.js';
import { MemberApp } from './member.js';

const LANG_KEY = 'davom.lang';

function storedLang() {
  try {
    const l = localStorage.getItem(LANG_KEY);
    return LANGS.includes(l) ? l : null;
  } catch {
    return null;
  }
}

const SAMPLE_ITEMS = {
  en: [
    { name: 'Book reading', unit: 'pages', type: 'number', entry: 'daily', weeklyTarget: 140, points: 1, color: '#2f7d5b' },
    { name: 'Exercise', unit: 'minutes', type: 'number', entry: 'daily', weeklyTarget: 150, points: 0.2, color: '#2d6fb7' },
    { name: 'Woke up early', type: 'check', entry: 'daily', weeklyTarget: 5, points: 5, color: '#c2571a' },
    { name: 'Attended the weekly meeting', type: 'check', entry: 'weekly', weeklyTarget: 1, points: 20, color: '#7a4fb5' },
  ],
  tr: [
    { name: 'Kitap okuma', unit: 'sayfa', type: 'number', entry: 'daily', weeklyTarget: 140, points: 1, color: '#2f7d5b' },
    { name: 'Spor', unit: 'dakika', type: 'number', entry: 'daily', weeklyTarget: 150, points: 0.2, color: '#2d6fb7' },
    { name: 'Erken kalkma', type: 'check', entry: 'daily', weeklyTarget: 5, points: 5, color: '#c2571a' },
    { name: 'Haftalık sohbete katılım', type: 'check', entry: 'weekly', weeklyTarget: 1, points: 20, color: '#7a4fb5' },
  ],
  uz: [
    { name: "Kitob o'qish", unit: 'sahifa', type: 'number', entry: 'daily', weeklyTarget: 140, points: 1, color: '#2f7d5b' },
    { name: 'Sport', unit: 'daqiqa', type: 'number', entry: 'daily', weeklyTarget: 150, points: 0.2, color: '#2d6fb7' },
    { name: 'Erta turish', type: 'check', entry: 'daily', weeklyTarget: 5, points: 5, color: '#c2571a' },
    { name: 'Haftalik suhbatda qatnashish', type: 'check', entry: 'weekly', weeklyTarget: 1, points: 20, color: '#7a4fb5' },
  ],
  tg: [
    { name: 'Хондани китоб', unit: 'саҳифа', type: 'number', entry: 'daily', weeklyTarget: 140, points: 1, color: '#2f7d5b' },
    { name: 'Варзиш', unit: 'дақиқа', type: 'number', entry: 'daily', weeklyTarget: 150, points: 0.2, color: '#2d6fb7' },
    { name: 'Барвақт хестан', type: 'check', entry: 'daily', weeklyTarget: 5, points: 5, color: '#c2571a' },
    { name: 'Иштирок дар суҳбати ҳафтаина', type: 'check', entry: 'weekly', weeklyTarget: 1, points: 20, color: '#7a4fb5' },
  ],
};

function AuthFrame({ children }) {
  return html`<div class="auth-page">
    <div class="auth-top"><${LangSwitch} /><${ThemeToggle} /></div>
    <div class="auth-card">${children}</div>
  </div>`;
}

function Setup() {
  const { status, lang, changeLang, onLoggedIn } = useContext(AppCtx);
  const [orgName, setOrgName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [weekStart, setWeekStart] = useState(1);
  const [samples, setSamples] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!status.isLocal) {
    return html`<${AuthFrame}>
      <div class="auth-brand"><${Logo} size=${44} /><h1>${t('app_name')}</h1></div>
      <p class="muted center">${t('setup_local_only')}</p>
    <//>`;
  }

  async function submit(e) {
    e.preventDefault();
    if (pw.length < 4) return setErr('err_password_short');
    if (pw !== pw2) return setErr('err_password_mismatch');
    setBusy(true);
    setErr(null);
    try {
      const r = await api('POST', '/api/setup', {
        orgName, password: pw, language: lang, weekStart, sampleItems: samples ? SAMPLE_ITEMS[lang] : [],
      });
      await onLoggedIn(r.token, true);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return html`<${AuthFrame}>
    <div class="auth-brand">
      <${Logo} size=${44} />
      <h1>${t('setup_title')}</h1>
      <p class="muted">${t('setup_sub')}</p>
    </div>
    <form class="stack" onSubmit=${submit}>
      <${Field} label=${t('language')} as="div">
        <${Seg} value=${lang} onChange=${changeLang} label=${t('language')}
          options=${LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))} />
      <//>
      <${Field} label=${t('org_name')} hint=${t('org_name_hint')}>
        <input class="input" value=${orgName} maxlength="80" onInput=${(e) => setOrgName(e.target.value)} ref=${focusOnMount} />
      <//>
      <div class="grid-2">
        <${Field} label=${t('admin_password')}>
          <input class="input" type="password" value=${pw} onInput=${(e) => setPw(e.target.value)} autocomplete="new-password" />
        <//>
        <${Field} label=${t('repeat_password')}>
          <input class="input" type="password" value=${pw2} onInput=${(e) => setPw2(e.target.value)} autocomplete="new-password" />
        <//>
      </div>
      <${Field} label=${t('week_starts')} as="div">
        <${Seg} value=${weekStart} onChange=${setWeekStart} label=${t('week_starts')}
          options=${[{ value: 1, label: t('monday') }, { value: 6, label: t('saturday') }, { value: 0, label: t('sunday') }]} />
      <//>
      <${Switch} checked=${samples} onChange=${setSamples} label=${t('add_samples')} hint=${t('add_samples_hint')} />
      ${err && html`<div class="form-error" role="alert">${t(err)}</div>`}
      <button class="btn btn-primary btn-lg" disabled=${busy}>${t('start_using')}</button>
    </form>
  <//>`;
}

function Login() {
  const { status, lang, onLoggedIn } = useContext(AppCtx);
  const [tab, setTab] = useState('member');
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('GET', '/api/login-list').then(setList).catch(() => setList({ members: [], groups: [] }));
  }, []);

  async function login(body) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api('POST', '/api/login', body);
      await onLoggedIn(r.token);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  function pick(m) {
    setSel(m);
    setPin('');
    setErr(null);
    if (!m.hasPin) login({ role: 'member', memberId: m.id });
  }

  const lower = (s) => s.toLocaleLowerCase(lang === 'tr' ? 'tr' : undefined);
  const members = list
    ? list.members.filter((m) => (!group || m.groupId === group) && lower(m.name).includes(lower(q.trim())))
    : [];

  let body;
  if (tab === 'admin') {
    body = html`<form class="stack" onSubmit=${(e) => (e.preventDefault(), login({ role: 'admin', password: pw }))}>
      <${Field} label=${t('admin_password')}>
        <input class="input" type="password" value=${pw} onInput=${(e) => setPw(e.target.value)} autocomplete="current-password" ref=${focusOnMount} />
      <//>
      ${err && html`<div class="form-error" role="alert">${t(err)}</div>`}
      <button class="btn btn-primary btn-lg" disabled=${busy || !pw}>${t('sign_in')}</button>
    </form>`;
  } else if (!list) {
    body = html`<div class="loading-block"></div>`;
  } else if (!list.members.length) {
    body = html`<p class="muted center">${t('no_members_login')}</p>`;
  } else if (sel && sel.hasPin) {
    body = html`<form class="stack" onSubmit=${(e) => (e.preventDefault(), login({ role: 'member', memberId: sel.id, pin }))}>
      <div class="picked">
        <div class="avatar">${sel.name.slice(0, 1).toLocaleUpperCase()}</div>
        <div class="picked-name">${sel.name}</div>
        <button type="button" class="btn btn-sm btn-ghost" onClick=${() => (setSel(null), setErr(null))}>${t('change')}</button>
      </div>
      <${Field} label=${t('pin')}>
        <input class="input input-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off"
          value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} ref=${focusOnMount} />
      <//>
      ${err && html`<div class="form-error" role="alert">${t(err)}</div>`}
      <button class="btn btn-primary btn-lg" disabled=${busy || pin.length < 4}>${t('continue')}</button>
    </form>`;
  } else {
    body = html`<div class="stack">
      <div class="search">
        <${Icon} name="search" size=${16} />
        <input class="input" placeholder=${t('find_your_name')} value=${q} onInput=${(e) => setQ(e.target.value)} aria-label=${t('find_your_name')} />
      </div>
      ${list.groups.length > 0 && html`<div class="chips">
        <button class=${'chip' + (!group ? ' on' : '')} onClick=${() => setGroup('')}>${t('all')}</button>
        ${list.groups.map((g) => html`<button class=${'chip' + (group === g.id ? ' on' : '')} onClick=${() => setGroup(g.id)}>${g.name}</button>`)}
      </div>`}
      <div class="name-grid">
        ${members.map((m) => html`<button class="name-btn" disabled=${busy} onClick=${() => pick(m)}>
          <span class="avatar">${m.name.slice(0, 1).toLocaleUpperCase()}</span>
          <span class="name-text">${m.name}</span>
          ${m.hasPin && html`<${Icon} name="lock" size=${14} />`}
        </button>`)}
        ${!members.length && html`<p class="muted">${t('no_match')}</p>`}
      </div>
      ${err && html`<div class="form-error" role="alert">${t(err)}</div>`}
    </div>`;
  }

  return html`<${AuthFrame}>
    <div class="auth-brand">
      <${Logo} size=${44} />
      <h1>${status.orgName || t('app_name')}</h1>
      <p class="muted">${t('login_sub')}</p>
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected=${tab === 'member'} class=${tab === 'member' ? 'on' : ''} onClick=${() => (setTab('member'), setErr(null))}>
        <${Icon} name="user" size=${16} />${t('i_am_member')}
      </button>
      <button role="tab" aria-selected=${tab === 'admin'} class=${tab === 'admin' ? 'on' : ''} onClick=${() => (setTab('admin'), setErr(null))}>
        <${Icon} name="key" size=${16} />${t('admin')}
      </button>
    </div>
    ${body}
  <//>`;
}

function App() {
  const [status, setStatus] = useState(null);
  const [me, setMe] = useState(undefined);
  const [lang, setLangState] = useState('en');
  const [failed, setFailed] = useState(false);

  function changeLang(l, persist = true) {
    if (!LANGS.includes(l)) return;
    if (persist) {
      try {
        localStorage.setItem(LANG_KEY, l);
      } catch {
        /* ignore */
      }
    }
    setLang(l);
    setLangState(l);
  }

  async function refreshStatus() {
    const s = await api('GET', '/api/status');
    setStatus(s);
    changeLang(storedLang() || (s.setup ? s.language : guessLang()), false);
    return s;
  }

  async function loadMe() {
    if (!getToken()) return setMe(null);
    try {
      setMe(await api('GET', '/api/me'));
    } catch {
      setToken(null);
      setMe(null);
    }
  }

  async function onLoggedIn(token, refresh) {
    setToken(token);
    if (refresh) await refreshStatus();
    const m = await api('GET', '/api/me');
    go(m.role === 'admin' ? '/admin' : '/me');
    setMe(m);
  }

  async function logout() {
    try {
      await api('POST', '/api/logout');
    } catch {
      /* ignore */
    }
    setToken(null);
    setMe(null);
    go('/');
  }

  useEffect(() => {
    applyStoredTheme();
    onUnauthorized(() => {
      setToken(null);
      setMe(null);
    });
    refreshStatus()
      .then(loadMe)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    document.title = status && status.orgName ? `${status.orgName} · ${t('app_name')}` : t('app_name');
    document.documentElement.lang = lang;
  }, [status, lang]);

  if (failed) {
    return html`<div class="boot"><${Logo} size=${48} /><p>${t('err_network')}</p>
      <button class="btn" onClick=${() => location.reload()}>${t('retry')}</button></div>`;
  }
  if (!status || me === undefined) return html`<div class="boot"><${Logo} size=${48} /></div>`;

  const ctx = { status, me, lang, changeLang, logout, refreshStatus, onLoggedIn };
  let page;
  if (!status.setup) page = html`<${Setup} />`;
  else if (!me) page = html`<${Login} />`;
  else if (me.role === 'admin') page = html`<${AdminApp} />`;
  else page = html`<${MemberApp} />`;

  return html`<${AppCtx.Provider} value=${ctx}>
    ${page}
    <${Toasts} />
    <${Dialogs} />
  <//>`;
}

render(html`<${App} />`, document.getElementById('root'));
