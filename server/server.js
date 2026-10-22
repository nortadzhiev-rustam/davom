'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const D = require('./dates');
const L = require('./logic');
const { hashSecret, verifySecret, Sessions, Throttle } = require('./auth');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const CSV_LABELS = {
  en: { member: 'Member', group: 'Group', goal: 'goal', points: 'Points', completion: 'Completion', activeDays: 'Active days', date: 'Date', item: 'Item', value: 'Value', unit: 'Unit' },
  tr: { member: 'Üye', group: 'Grup', goal: 'hedef', points: 'Puan', completion: 'Tamamlama', activeDays: 'Aktif gün', date: 'Tarih', item: 'Madde', value: 'Değer', unit: 'Birim' },
  uz: { member: "A'zo", group: 'Guruh', goal: 'maqsad', points: 'Ball', completion: 'Bajarilish', activeDays: 'Faol kunlar', date: 'Sana', item: 'Band', value: 'Qiymat', unit: 'Birlik' },
  tg: { member: 'Аъзо', group: 'Гурӯҳ', goal: 'ҳадаф', points: 'Хол', completion: 'Иҷро', activeDays: 'Рӯзҳои фаъол', date: 'Сана', item: 'Банд', value: 'Қимат', unit: 'Воҳид' },
};

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LANGS = ['en', 'tr', 'uz', 'tg'];

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const bad = (code) => new HttpError(400, code);

const newId = () => crypto.randomBytes(6).toString('hex');

function str(v, max, required) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw bad('err_required');
  if (s.length > max) throw bad('err_too_long');
  return s;
}

function num(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad('err_invalid_number');
  return Math.round(n * 100) / 100;
}

function isLocalAddress(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// Real Wi-Fi / Ethernet adapters first, virtual ones (VPN, Docker, VMs) last.
const VIRTUAL_IF = /vmnet|vbox|virtual|docker|bridge|utun|tun|tap|veth|vethernet|hyper-v|wsl|tailscale|zerotier|zt|br-|llw|awdl/i;
const PHYSICAL_IF = /^(en\d|eth|wlan|wl|wi-?fi|ethernet|kablosuz|local area)/i;

function lanAddresses() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      let score = 1;
      if (PHYSICAL_IF.test(name)) score = 0;
      if (VIRTUAL_IF.test(name)) score = 2;
      found.push({ address: a.address, score });
    }
  }
  return found.sort((x, y) => x.score - y.score).map((x) => x.address);
}

function createAppServer({ store, publicDir, version, dataDir, openDataDir }) {
  const sessions = new Sessions();
  const throttle = new Throttle();
  const routes = [];
  let server = null;
  let port = store.data.settings.port || 4870;
  let host = '127.0.0.1';

  const data = () => store.data;
  const settings = () => store.data.settings;

  function route(method, pattern, access, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, re, keys, access, handler });
  }

  function findMember(id) {
    const m = data().members.find((x) => x.id === id);
    if (!m) throw new HttpError(404, 'err_not_found');
    return m;
  }

  function findItem(id) {
    const it = data().items.find((x) => x.id === id);
    if (!it) throw new HttpError(404, 'err_not_found');
    return it;
  }

  // Members may only touch their own sheet; admins may pick any member.
  function targetMember(ctx, requested) {
    if (ctx.session.role === 'member') return findMember(ctx.session.memberId);
    if (!requested) throw bad('err_required');
    return findMember(requested);
  }

  function memberCanEdit(weekStart) {
    const cur = D.weekStartOf(D.today(), settings().weekStart);
    const back = D.weeksBetween(weekStart, cur);
    return back >= 0 && back <= settings().memberEditWeeks;
  }

  function sheetFor(ctx, member, date) {
    const s = L.sheet(data(), member, date);
    s.editable = ctx.session.role === 'admin' || memberCanEdit(s.weekStart);
    s.member = L.publicMember(member);
    return s;
  }

  function periodFromQuery(q) {
    const from = q.get('from');
    const to = q.get('to');
    if (!D.isDate(from) || !D.isDate(to) || from > to) throw bad('err_invalid_date');
    if (D.range(from, to).length > 3700) throw bad('err_invalid_date');
    const group = q.get('group') || null;
    return { from, to, group };
  }

  function csvLabels() {
    return CSV_LABELS[settings().language] || CSV_LABELS.en;
  }

  // ---------- public ----------

  route('GET', '/api/status', 'public', (ctx) => ({
    setup: !!data().admin,
    orgName: settings().orgName,
    language: settings().language,
    weekStart: settings().weekStart,
    fillDay: settings().fillDay,
    today: D.today(),
    version,
    isLocal: ctx.isLocal,
  }));

  route('POST', '/api/setup', 'public', (ctx) => {
    if (data().admin) throw new HttpError(409, 'err_already_setup');
    if (!ctx.isLocal) throw new HttpError(403, 'err_admin_local_only');
    const b = ctx.body;
    const password = typeof b.password === 'string' ? b.password : '';
    if (password.length < 4) throw bad('err_password_short');
    const language = LANGS.includes(b.language) ? b.language : 'en';
    const items = (Array.isArray(b.sampleItems) ? b.sampleItems.slice(0, 10) : []).map((it, i) => ({
      id: newId(), name: str(it.name, 80, true), unit: str(it.unit, 20), type: it.type === 'check' ? 'check' : 'number',
      entry: it.entry === 'weekly' ? 'weekly' : 'daily', weeklyTarget: num(it.weeklyTarget || 0, 0, 1e6),
      points: num(it.points || 0, 0, 1e4), groupIds: [], color: COLOR_RE.test(it.color) ? it.color : '#2f7d5b',
      active: true, description: '', order: i, createdAt: D.today(),
    }));
    store.transaction(() => {
      store.updateSettings({
        orgName: str(b.orgName, 80),
        language,
        weekStart: [0, 1, 6].includes(b.weekStart) ? b.weekStart : 1,
        csvDelimiter: language === 'en' ? ',' : ';',
      });
      store.setAdmin(hashSecret(password));
      store.addItems(items);
    });
    return { token: sessions.create('admin') };
  });

  route('GET', '/api/login-list', 'public', () => ({
    members: data().members
      .filter((m) => m.active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ id: m.id, name: m.name, groupId: m.groupId, hasPin: !!m.pin })),
    groups: data().groups.map((g) => ({ id: g.id, name: g.name, color: g.color })),
  }));

  route('POST', '/api/login', 'public', (ctx) => {
    const b = ctx.body;
    if (b.role === 'admin') {
      if (!ctx.isLocal && !settings().allowAdminRemote) throw new HttpError(403, 'err_admin_local_only');
      const key = 'admin:' + ctx.ip;
      const wait = throttle.lockedFor(key);
      if (wait) throw new HttpError(429, 'err_locked');
      if (!verifySecret(b.password || '', data().admin)) {
        throttle.fail(key);
        throw new HttpError(401, 'err_wrong_password');
      }
      throttle.success(key);
      return { token: sessions.create('admin') };
    }
    const m = data().members.find((x) => x.id === b.memberId && x.active);
    if (!m) throw new HttpError(404, 'err_not_found');
    if (m.pin) {
      const key = 'member:' + m.id + ':' + ctx.ip;
      if (throttle.lockedFor(key)) throw new HttpError(429, 'err_locked');
      if (!verifySecret(String(b.pin || ''), m.pin)) {
        throttle.fail(key);
        throw new HttpError(401, 'err_wrong_pin');
      }
      throttle.success(key);
    }
    return { token: sessions.create('member', m.id) };
  });

  route('POST', '/api/logout', 'public', (ctx) => {
    if (ctx.token) sessions.delete(ctx.token);
    return { ok: true };
  });

  // ---------- any signed-in user ----------

  route('GET', '/api/me', 'any', (ctx) => {
    if (ctx.session.role === 'admin') return { role: 'admin' };
    const m = findMember(ctx.session.memberId);
    const g = data().groups.find((x) => x.id === m.groupId);
    return { role: 'member', member: L.publicMember(m), groupName: g ? g.name : '', memberEditWeeks: settings().memberEditWeeks };
  });

  route('GET', '/api/sheet', 'any', (ctx) => {
    const m = targetMember(ctx, ctx.query.get('member'));
    const week = ctx.query.get('week');
    return sheetFor(ctx, m, D.isDate(week) ? week : D.today());
  });

  route('PUT', '/api/entry', 'any', (ctx) => {
    const b = ctx.body;
    const m = targetMember(ctx, b.memberId);
    const item = findItem(b.itemId);
    if (!D.isDate(b.date)) throw bad('err_invalid_date');
    const value = item.type === 'check' ? (b.value ? 1 : 0) : num(b.value === '' || b.value == null ? 0 : b.value, 0, 1e6);
    if (ctx.session.role === 'member') {
      const ws = D.weekStartOf(b.date, settings().weekStart);
      if (!memberCanEdit(ws)) throw new HttpError(403, 'err_week_locked');
      if (item.entry === 'daily' && b.date > D.today()) throw new HttpError(403, 'err_future_date');
    }
    store.setEntry(m.id, item, b.date, value);
    return sheetFor(ctx, m, b.date);
  });

  route('GET', '/api/history', 'any', (ctx) => {
    const m = targetMember(ctx, ctx.query.get('member'));
    const weeks = Math.min(Math.max(parseInt(ctx.query.get('weeks'), 10) || 12, 1), 104);
    return { member: L.publicMember(m), ...L.history(data(), m, weeks) };
  });

  route('GET', '/api/goals', 'any', (ctx) => {
    const m = targetMember(ctx, ctx.query.get('member'));
    const ws = D.weekStartOf(D.today(), settings().weekStart);
    return { weekStart: ws, items: L.goalsList(data(), m, ws) };
  });

  // A goal change counts from the current week on; earlier weeks keep their goals.
  route('PUT', '/api/goal', 'any', (ctx) => {
    const b = ctx.body;
    const m = targetMember(ctx, b.memberId);
    const item = findItem(b.itemId);
    if (!L.hasPersonalGoal(item)) throw bad('err_bad_request');
    const max = item.type === 'check' ? 7 : 1e6;
    const value = b.value === null || b.value === '' || b.value === undefined ? null : num(b.value, 0, max);
    const ws = D.weekStartOf(D.today(), settings().weekStart);
    store.setGoal(m.id, item.id, value, ws);
    return { weekStart: ws, items: L.goalsList(data(), m, ws) };
  });

  // ---------- admin ----------

  route('GET', '/api/admin/config', 'admin', () => ({
    settings: { ...settings() },
    groups: data().groups,
    members: data().members.map(L.publicMember).sort((a, b) => a.name.localeCompare(b.name)),
    items: [...data().items].sort((a, b) => a.order - b.order).map(L.publicItem),
    today: D.today(),
    dataDir,
  }));

  route('PUT', '/api/admin/settings', 'admin', (ctx) => {
    const b = ctx.body;
    const patch = {};
    if (b.orgName !== undefined) patch.orgName = str(b.orgName, 80);
    if (LANGS.includes(b.language)) patch.language = b.language;
    if ([0, 1, 6].includes(b.weekStart)) patch.weekStart = b.weekStart;
    if (b.memberEditWeeks !== undefined) patch.memberEditWeeks = Math.round(num(b.memberEditWeeks, 0, 10000));
    if (b.csvDelimiter !== undefined) patch.csvDelimiter = b.csvDelimiter === ';' ? ';' : ',';
    if (b.fillDay !== undefined) patch.fillDay = [0, 1, 2, 3, 4, 5, 6].includes(b.fillDay) ? b.fillDay : null;
    if (b.allowAdminRemote !== undefined) patch.allowAdminRemote = !!b.allowAdminRemote;
    store.updateSettings(patch);
    if (patch.allowAdminRemote === false) {
      // Remote admin sessions can't be told apart, so sign out every admin except this request.
      for (const [t, sess] of sessions.map) if (sess.role === 'admin' && t !== ctx.token) sessions.delete(t);
    }
    return { settings: { ...settings() } };
  });

  route('POST', '/api/admin/password', 'admin', (ctx) => {
    const { current, next } = ctx.body;
    if (!verifySecret(current || '', data().admin)) throw new HttpError(401, 'err_wrong_password');
    if (typeof next !== 'string' || next.length < 4) throw bad('err_password_short');
    store.setAdmin(hashSecret(next));
    for (const [t, sess] of sessions.map) if (sess.role === 'admin' && t !== ctx.token) sessions.delete(t);
    return { ok: true };
  });

  // groups
  function readGroup(b) {
    return { name: str(b.name, 60, true), color: COLOR_RE.test(b.color) ? b.color : '#2f7d5b' };
  }
  route('POST', '/api/admin/groups', 'admin', (ctx) => {
    const g = { id: newId(), ...readGroup(ctx.body) };
    store.addGroup(g);
    return g;
  });
  route('PUT', '/api/admin/groups/:id', 'admin', (ctx) => {
    const g = data().groups.find((x) => x.id === ctx.params.id);
    if (!g) throw new HttpError(404, 'err_not_found');
    store.updateGroup(g, readGroup(ctx.body));
    return g;
  });
  route('DELETE', '/api/admin/groups/:id', 'admin', (ctx) => {
    store.deleteGroup(ctx.params.id);
    return { ok: true };
  });

  // members
  function validGroup(id) {
    return id && data().groups.some((g) => g.id === id) ? id : null;
  }
  // undefined = keep, null / '' = remove, digits = set a new PIN.
  function readPin(pin) {
    if (pin === undefined) return undefined;
    if (pin === null || pin === '') return null;
    if (!/^\d{4,8}$/.test(String(pin))) throw bad('err_pin_format');
    return hashSecret(String(pin));
  }
  route('POST', '/api/admin/members', 'admin', (ctx) => {
    const b = ctx.body;
    const m = {
      id: newId(), name: str(b.name, 80, true), groupId: validGroup(b.groupId), active: b.active !== false,
      note: str(b.note, 200), pin: readPin(b.pin) || null, createdAt: D.today(),
    };
    store.addMembers([m]);
    return L.publicMember(m);
  });
  route('POST', '/api/admin/members/bulk', 'admin', (ctx) => {
    const names = (Array.isArray(ctx.body.names) ? ctx.body.names : [])
      .map((n) => (typeof n === 'string' ? n.trim().slice(0, 80) : ''))
      .filter(Boolean)
      .slice(0, 500);
    if (!names.length) throw bad('err_required');
    const groupId = validGroup(ctx.body.groupId);
    store.addMembers(names.map((name) => ({ id: newId(), name, groupId, active: true, note: '', pin: null, createdAt: D.today() })));
    return { added: names.length };
  });
  route('PUT', '/api/admin/members/:id', 'admin', (ctx) => {
    const m = findMember(ctx.params.id);
    const b = ctx.body;
    const patch = {};
    if (b.name !== undefined) patch.name = str(b.name, 80, true);
    if (b.groupId !== undefined) patch.groupId = validGroup(b.groupId);
    if (b.note !== undefined) patch.note = str(b.note, 200);
    if (b.active !== undefined) patch.active = !!b.active;
    const pin = readPin(b.pin);
    if (pin !== undefined) patch.pin = pin;
    store.updateMember(m, patch);
    if (!m.active || b.pin !== undefined) sessions.dropMember(m.id);
    return L.publicMember(m);
  });
  route('DELETE', '/api/admin/members/:id', 'admin', (ctx) => {
    const id = ctx.params.id;
    findMember(id);
    store.deleteMember(id);
    sessions.dropMember(id);
    return { ok: true };
  });

  // items
  function readItem(b, existing) {
    const type = b.type === 'check' ? 'check' : 'number';
    return {
      name: str(b.name, 80, true),
      unit: type === 'check' ? '' : str(b.unit, 20),
      type,
      entry: b.entry === 'weekly' ? 'weekly' : 'daily',
      weeklyTarget: num(b.weeklyTarget || 0, 0, 1e6),
      points: num(b.points || 0, 0, 1e4),
      groupIds: (Array.isArray(b.groupIds) ? b.groupIds : []).filter((id) => data().groups.some((g) => g.id === id)),
      color: COLOR_RE.test(b.color) ? b.color : existing ? existing.color : '#2f7d5b',
      active: b.active !== false,
      description: str(b.description, 200),
    };
  }
  route('POST', '/api/admin/items', 'admin', (ctx) => {
    const order = data().items.reduce((a, it) => Math.max(a, it.order + 1), 0);
    const it = { id: newId(), ...readItem(ctx.body), order, createdAt: D.today() };
    store.addItems([it]);
    return L.publicItem(it);
  });
  route('PUT', '/api/admin/items/:id', 'admin', (ctx) => {
    const it = findItem(ctx.params.id);
    store.updateItem(it, readItem(ctx.body, it));
    return L.publicItem(it);
  });
  route('DELETE', '/api/admin/items/:id', 'admin', (ctx) => {
    const id = ctx.params.id;
    findItem(id);
    store.deleteItem(id);
    return { ok: true };
  });
  route('POST', '/api/admin/items/order', 'admin', (ctx) => {
    store.setItemOrder(Array.isArray(ctx.body.ids) ? ctx.body.ids : []);
    return { ok: true };
  });

  // reports
  route('GET', '/api/admin/report', 'admin', (ctx) => {
    const { from, to, group } = periodFromQuery(ctx.query);
    return L.rangeReport(data(), from, to, group);
  });

  route('GET', '/api/admin/dashboard', 'admin', (ctx) => {
    const group = ctx.query.get('group') || null;
    const { from, to } = L.weekRange(data(), D.today());
    const week = L.rangeReport(data(), from, to, group);
    // With a fill day set, "not filled in yet" refers to the week that was last due.
    let due = { from, to, fillDate: null };
    if (settings().fillDay != null) {
      const fillDate = D.lastFillDay(D.today(), settings().fillDay);
      const dueFrom = D.dueWeekFor(fillDate, settings().weekStart);
      due = { from: dueFrom, to: D.addDays(dueFrom, 6), fillDate };
    }
    const dueRows = due.from === from ? week.rows : L.rangeReport(data(), due.from, due.to, group).rows;
    due.missing = dueRows.filter((r) => r.activeDays === 0).map((r) => ({ memberId: r.memberId, name: r.name }));
    return { week, due, trend: L.trend(data(), group, 8) };
  });

  route('GET', '/api/admin/export/summary', 'admin', (ctx) => {
    const { from, to, group } = periodFromQuery(ctx.query);
    const report = L.rangeReport(data(), from, to, group);
    return { file: `davom-summary-${from}_${to}.csv`, type: 'text/csv; charset=utf-8', body: L.summaryCsv(data(), report, csvLabels()) };
  });

  route('GET', '/api/admin/export/entries', 'admin', (ctx) => {
    const { from, to, group } = periodFromQuery(ctx.query);
    return { file: `davom-entries-${from}_${to}.csv`, type: 'text/csv; charset=utf-8', body: L.entriesCsv(data(), from, to, group, csvLabels()) };
  });

  route('GET', '/api/admin/backup', 'admin', () => ({
    file: `davom-backup-${D.today()}.json`,
    type: 'application/json; charset=utf-8',
    body: JSON.stringify(data(), null, 1),
  }));

  route('POST', '/api/admin/restore', 'admin', (ctx) => {
    const raw = ctx.body.data;
    if (!raw || typeof raw !== 'object' || !raw.admin || !Array.isArray(raw.members) || !Array.isArray(raw.items)) {
      throw bad('err_invalid_backup');
    }
    // Network settings belong to this computer, not to the backup.
    const keep = { port: settings().port, lanEnabled: settings().lanEnabled };
    store.replaceAll(raw);
    store.updateSettings(keep);
    sessions.clear();
    return { ok: true };
  });

  route('GET', '/api/admin/network', 'admin', async () => {
    const enabled = !!settings().lanEnabled;
    const urls = enabled ? lanAddresses().map((ip) => `http://${ip}:${port}/`) : [];
    const qr = urls[0] ? await QRCode.toString(urls[0], { type: 'svg', margin: 1 }) : null;
    return { enabled, port, urls, qr, allowAdminRemote: !!settings().allowAdminRemote };
  });

  route('POST', '/api/admin/network', 'admin', (ctx) => {
    if (!ctx.isLocal) throw new HttpError(403, 'err_admin_local_only');
    store.updateSettings({ lanEnabled: !!ctx.body.enabled });
    // Re-bind after this response has been sent.
    setTimeout(() => restart().catch((e) => console.error('restart failed', e)), 150);
    return { ok: true };
  });

  route('POST', '/api/admin/open-data-dir', 'admin', (ctx) => {
    if (!ctx.isLocal || !openDataDir) throw new HttpError(403, 'err_admin_local_only');
    openDataDir();
    return { ok: true };
  });

  // ---------- plumbing ----------

  function send(res, status, body, type, extraHeaders) {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders,
    });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 50 * 1024 * 1024) {
          reject(new HttpError(413, 'err_too_large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(bad('err_bad_request'));
        }
      });
      req.on('error', reject);
    });
  }

  async function handleApi(req, res, url) {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) throw new HttpError(404, 'err_not_found');
    const m = url.pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const session = sessions.get(token);
    if (r.access === 'admin' && (!session || session.role !== 'admin')) throw new HttpError(401, 'err_unauthorized');
    if (r.access === 'any' && !session) throw new HttpError(401, 'err_unauthorized');
    const ip = req.socket.remoteAddress || '';
    const body = req.method === 'GET' ? {} : await readBody(req);
    const ctx = { req, params, query: url.searchParams, body, session, token, ip, isLocal: isLocalAddress(ip) };
    const out = await r.handler(ctx);
    if (out && out.file && out.body !== undefined) {
      send(res, 200, out.body, out.type, { 'Content-Disposition': `attachment; filename="${out.file}"` });
    } else {
      send(res, 200, JSON.stringify(out), MIME['.json']);
    }
  }

  function serveStatic(res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream', {
        'Content-Security-Policy':
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      });
    });
  }

  async function onRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (req.method === 'GET') serveStatic(res, url.pathname);
      else throw new HttpError(405, 'err_bad_request');
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, JSON.stringify({ error: e.code || 'err_server' }), MIME['.json']);
    }
  }

  function listen(p, h) {
    return new Promise((resolve, reject) => {
      const s = http.createServer(onRequest);
      s.once('error', reject);
      s.listen(p, h, () => resolve(s));
    });
  }

  async function start(base = settings().port || 4870) {
    host = settings().lanEnabled ? '0.0.0.0' : '127.0.0.1';
    for (let p = base; p < base + 30; p++) {
      try {
        server = await listen(p, host);
        port = p;
        return port;
      } catch (e) {
        if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e;
      }
    }
    throw new Error('No free port found');
  }

  function stop() {
    return new Promise((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
      server.closeAllConnections();
      server = null;
    });
  }

  async function restart() {
    const before = port;
    await stop();
    await start(before);
    if (port !== before && api.onPortChange) api.onPortChange(port);
  }

  const api = {
    start,
    stop,
    url: () => `http://127.0.0.1:${port}/`,
    onPortChange: null,
  };
  return api;
}

module.exports = { createAppServer };
