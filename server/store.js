'use strict';
// SQLite storage (built into Node / Electron as node:sqlite).
//
// The whole dataset is small enough to keep in memory, so reports read from `store.data`.
// Every change goes through a method here that writes the affected rows to SQLite in a
// transaction first, then updates `store.data` to match.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const D = require('./dates');

const DB_FILE = 'davom.db';
const LEGACY_JSON = 'davom-data.json';
const KEEP_BACKUPS = 30;

// Each entry upgrades the schema by one version (PRAGMA user_version).
const MIGRATIONS = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL                -- JSON
  );
  CREATE TABLE member_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL
  );
  CREATE TABLE members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_id TEXT REFERENCES member_groups(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 1,
    note TEXT NOT NULL DEFAULT '',
    pin_salt TEXT,
    pin_hash TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,                -- 'number' | 'check'
    entry TEXT NOT NULL,               -- 'daily' | 'weekly'
    weekly_target REAL NOT NULL DEFAULT 0,
    points REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE item_groups (
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES member_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, group_id)
  );
  CREATE TABLE entries (
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    date TEXT NOT NULL,                -- YYYY-MM-DD
    value REAL NOT NULL,
    PRIMARY KEY (member_id, date, item_id)
  );
  CREATE INDEX entries_item ON entries(item_id);
  CREATE TABLE goals (
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    from_week TEXT NOT NULL,           -- week start the goal applies from
    value REAL,                        -- NULL = back to the admin's suggestion
    PRIMARY KEY (member_id, item_id, from_week)
  );
  `,
];

function defaultSettings() {
  return {
    orgName: '',
    language: 'en',
    weekStart: 1, // 0 = Sunday, 1 = Monday, 6 = Saturday
    memberEditWeeks: 1, // how many past weeks members may still edit (0 = current week only)
    allowAdminRemote: false, // allow admin login from other devices on the network
    lanEnabled: false,
    csvDelimiter: ',',
    fillDay: null, // weekday (0-6) members are reminded to fill in, or null
    port: 4870,
  };
}

function defaultData() {
  return {
    settings: defaultSettings(),
    admin: null,
    groups: [],
    members: [],
    items: [],
    entries: {}, // entries[memberId][date][itemId] = value
    goals: {}, // goals[memberId][itemId] = [{ from: weekStart, value }]
  };
}

// Fill in anything missing so JSON backups from any version can be imported.
function normalize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid data');
  const data = defaultData();
  data.settings = { ...data.settings, ...(raw.settings || {}) };
  data.admin = raw.admin || null;
  data.groups = Array.isArray(raw.groups) ? raw.groups : [];
  data.members = (Array.isArray(raw.members) ? raw.members : []).map((m) => ({
    groupId: null, active: true, note: '', pin: null, createdAt: D.today(), ...m,
  }));
  data.items = (Array.isArray(raw.items) ? raw.items : []).map((it, i) => ({
    unit: '', type: 'number', entry: 'daily', weeklyTarget: 0, points: 0, groupIds: [],
    color: '#2f7d5b', active: true, description: '', order: i, createdAt: D.today(), ...it,
  }));
  data.entries = raw.entries && typeof raw.entries === 'object' ? raw.entries : {};
  data.goals = raw.goals && typeof raw.goals === 'object' ? raw.goals : {};
  return data;
}

const bool = (v) => (v ? 1 : 0);

function rowToMember(r) {
  return {
    id: r.id,
    name: r.name,
    groupId: r.group_id,
    active: !!r.active,
    note: r.note,
    pin: r.pin_hash ? { salt: r.pin_salt, hash: r.pin_hash } : null,
    createdAt: r.created_at,
  };
}

function rowToItem(r, groupIds) {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit,
    type: r.type,
    entry: r.entry,
    weeklyTarget: r.weekly_target,
    points: r.points,
    groupIds,
    color: r.color,
    active: !!r.active,
    description: r.description,
    order: r.sort_order,
    createdAt: r.created_at,
  };
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, DB_FILE);
    this.backupDir = path.join(dir, 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
    const fresh = !fs.existsSync(this.file);
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.depth = 0;
    this.migrate();
    this.data = this.load();
    if (fresh) this.importLegacyJson();
    this.lastBackupDay = null;
    this.backupIfNeeded();
  }

  migrate() {
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.transaction(() => {
        this.db.exec(MIGRATIONS[v]);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  }

  // Earlier versions kept everything in one JSON file; bring it over once.
  importLegacyJson() {
    const legacy = path.join(this.dir, LEGACY_JSON);
    if (!fs.existsSync(legacy)) return;
    this.replaceAll(JSON.parse(fs.readFileSync(legacy, 'utf8')), { backup: false });
    fs.renameSync(legacy, legacy + '.imported');
    console.log(`Imported ${LEGACY_JSON} into ${DB_FILE}`);
  }

  all(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  run(sql, ...params) {
    return this.db.prepare(sql).run(...params);
  }

  load() {
    const data = defaultData();
    for (const { key, value } of this.all('SELECT key, value FROM settings')) {
      if (key === 'admin') data.admin = JSON.parse(value);
      else data.settings[key] = JSON.parse(value);
    }
    data.groups = this.all('SELECT id, name, color FROM member_groups ORDER BY rowid').map((r) => ({ ...r }));
    data.members = this.all('SELECT * FROM members ORDER BY rowid').map(rowToMember);
    const itemGroups = {};
    for (const r of this.all('SELECT item_id, group_id FROM item_groups')) {
      (itemGroups[r.item_id] || (itemGroups[r.item_id] = [])).push(r.group_id);
    }
    data.items = this.all('SELECT * FROM items ORDER BY sort_order, rowid').map((r) => rowToItem(r, itemGroups[r.id] || []));
    for (const r of this.all('SELECT member_id, item_id, date, value FROM entries')) {
      const mine = data.entries[r.member_id] || (data.entries[r.member_id] = {});
      (mine[r.date] || (mine[r.date] = {}))[r.item_id] = r.value;
    }
    for (const r of this.all('SELECT member_id, item_id, from_week, value FROM goals ORDER BY from_week')) {
      const mine = data.goals[r.member_id] || (data.goals[r.member_id] = {});
      (mine[r.item_id] || (mine[r.item_id] = [])).push({ from: r.from_week, value: r.value });
    }
    return data;
  }

  // Runs fn in one transaction (nested calls join the outer one). If anything fails the
  // database rolls back and the in-memory copy is reloaded, so the two never disagree.
  transaction(fn) {
    if (this.depth > 0) return fn();
    this.depth++;
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      this.data = this.load();
      throw e;
    } finally {
      this.depth--;
    }
  }

  write(fn) {
    const result = this.transaction(fn);
    if (this.depth === 0) this.backupIfNeeded();
    return result;
  }

  // ---------- settings & admin ----------

  updateSettings(patch) {
    this.write(() => {
      const stmt = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v));
      Object.assign(this.data.settings, patch);
    });
  }

  setAdmin(secret) {
    this.write(() => {
      this.run("INSERT INTO settings (key, value) VALUES ('admin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(secret));
      this.data.admin = secret;
    });
  }

  // ---------- groups ----------

  addGroup(g) {
    this.write(() => {
      this.run('INSERT INTO member_groups (id, name, color) VALUES (?, ?, ?)', g.id, g.name, g.color);
      this.data.groups.push(g);
    });
  }

  updateGroup(g, patch) {
    this.write(() => {
      const next = { ...g, ...patch };
      this.run('UPDATE member_groups SET name = ?, color = ? WHERE id = ?', next.name, next.color, g.id);
      Object.assign(g, patch);
    });
  }

  // Members of the group become group-less; items stop being limited to it.
  deleteGroup(id) {
    this.write(() => {
      this.run('DELETE FROM member_groups WHERE id = ?', id);
      this.data.groups = this.data.groups.filter((g) => g.id !== id);
      for (const m of this.data.members) if (m.groupId === id) m.groupId = null;
      for (const it of this.data.items) it.groupIds = it.groupIds.filter((g) => g !== id);
    });
  }

  // ---------- members ----------

  insertMember(m) {
    this.run(
      'INSERT INTO members (id, name, group_id, active, note, pin_salt, pin_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      m.id, m.name, m.groupId, bool(m.active), m.note, m.pin ? m.pin.salt : null, m.pin ? m.pin.hash : null, m.createdAt,
    );
  }

  addMembers(list) {
    this.write(() => {
      for (const m of list) this.insertMember(m);
      this.data.members.push(...list);
    });
  }

  updateMember(m, patch) {
    this.write(() => {
      const n = { ...m, ...patch };
      this.run(
        'UPDATE members SET name = ?, group_id = ?, active = ?, note = ?, pin_salt = ?, pin_hash = ? WHERE id = ?',
        n.name, n.groupId, bool(n.active), n.note, n.pin ? n.pin.salt : null, n.pin ? n.pin.hash : null, m.id,
      );
      Object.assign(m, patch);
    });
  }

  // Also removes the member's entries and goals (ON DELETE CASCADE).
  deleteMember(id) {
    this.write(() => {
      this.run('DELETE FROM members WHERE id = ?', id);
      this.data.members = this.data.members.filter((m) => m.id !== id);
      delete this.data.entries[id];
      delete this.data.goals[id];
    });
  }

  // ---------- items ----------

  insertItem(it) {
    this.run(
      `INSERT INTO items (id, name, unit, type, entry, weekly_target, points, color, active, description, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      it.id, it.name, it.unit, it.type, it.entry, it.weeklyTarget, it.points, it.color, bool(it.active), it.description, it.order, it.createdAt,
    );
    this.insertItemGroups(it.id, it.groupIds);
  }

  insertItemGroups(itemId, groupIds) {
    const stmt = this.db.prepare('INSERT INTO item_groups (item_id, group_id) VALUES (?, ?)');
    for (const g of groupIds) stmt.run(itemId, g);
  }

  addItems(list) {
    this.write(() => {
      for (const it of list) this.insertItem(it);
      this.data.items.push(...list);
    });
  }

  updateItem(it, patch) {
    this.write(() => {
      const n = { ...it, ...patch };
      if (it.type === 'number' && n.type === 'check') {
        // Turning a number into yes/no: anything above zero becomes "yes".
        this.run('UPDATE entries SET value = 1 WHERE item_id = ? AND value > 0', it.id);
        for (const ent of Object.values(this.data.entries)) {
          for (const day of Object.values(ent)) if (day[it.id] > 0) day[it.id] = 1;
        }
      }
      this.run(
        `UPDATE items SET name = ?, unit = ?, type = ?, entry = ?, weekly_target = ?, points = ?, color = ?,
         active = ?, description = ? WHERE id = ?`,
        n.name, n.unit, n.type, n.entry, n.weeklyTarget, n.points, n.color, bool(n.active), n.description, it.id,
      );
      this.run('DELETE FROM item_groups WHERE item_id = ?', it.id);
      this.insertItemGroups(it.id, n.groupIds);
      Object.assign(it, patch);
    });
  }

  // Also removes every entry and goal for the item (ON DELETE CASCADE).
  deleteItem(id) {
    this.write(() => {
      this.run('DELETE FROM items WHERE id = ?', id);
      this.data.items = this.data.items.filter((it) => it.id !== id);
      for (const memberId of Object.keys(this.data.entries)) {
        const ent = this.data.entries[memberId];
        for (const d of Object.keys(ent)) {
          delete ent[d][id];
          if (!Object.keys(ent[d]).length) delete ent[d];
        }
        if (!Object.keys(ent).length) delete this.data.entries[memberId];
      }
      for (const mine of Object.values(this.data.goals)) delete mine[id];
    });
  }

  setItemOrder(ids) {
    this.write(() => {
      const stmt = this.db.prepare('UPDATE items SET sort_order = ? WHERE id = ?');
      ids.forEach((id, i) => {
        const it = this.data.items.find((x) => x.id === id);
        if (!it) return;
        stmt.run(i, id);
        it.order = i;
      });
    });
  }

  // ---------- entries & goals ----------

  setEntry(memberId, item, date, value) {
    this.write(() => {
      const ent = this.data.entries[memberId] || (this.data.entries[memberId] = {});
      const put = (d, v) => {
        if (v > 0) {
          this.run(
            'INSERT INTO entries (member_id, item_id, date, value) VALUES (?, ?, ?, ?) ON CONFLICT(member_id, date, item_id) DO UPDATE SET value = excluded.value',
            memberId, item.id, d, v,
          );
          (ent[d] || (ent[d] = {}))[item.id] = v;
        } else {
          this.run('DELETE FROM entries WHERE member_id = ? AND item_id = ? AND date = ?', memberId, item.id, d);
          if (ent[d]) {
            delete ent[d][item.id];
            if (!Object.keys(ent[d]).length) delete ent[d];
          }
        }
      };
      if (item.entry === 'weekly') {
        // Weekly items keep a single value on the first day of the week.
        const ws = D.weekStartOf(date, this.data.settings.weekStart);
        for (const d of D.range(ws, D.addDays(ws, 6))) put(d, 0);
        put(ws, value);
      } else {
        put(date, value);
      }
      if (!Object.keys(ent).length) delete this.data.entries[memberId];
    });
  }

  // A goal set in a week applies from that week on; earlier weeks keep their goals.
  setGoal(memberId, itemId, value, fromWeek) {
    this.write(() => {
      this.run('DELETE FROM goals WHERE member_id = ? AND item_id = ? AND from_week >= ?', memberId, itemId, fromWeek);
      this.run('INSERT INTO goals (member_id, item_id, from_week, value) VALUES (?, ?, ?, ?)', memberId, itemId, fromWeek, value);
      const mine = this.data.goals[memberId] || (this.data.goals[memberId] = {});
      mine[itemId] = (mine[itemId] || []).filter((e) => e.from < fromWeek).concat({ from: fromWeek, value });
    });
  }

  // ---------- whole dataset (JSON backup / restore) ----------

  replaceAll(raw, { backup = true } = {}) {
    const data = normalize(raw);
    if (backup) this.backupNow('before-restore');
    this.write(() => {
      for (const t of ['entries', 'goals', 'item_groups', 'items', 'members', 'member_groups', 'settings']) this.db.exec(`DELETE FROM ${t}`);
      const set = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      for (const [k, v] of Object.entries(data.settings)) set.run(k, JSON.stringify(v));
      if (data.admin) set.run('admin', JSON.stringify(data.admin));
      const groupIds = new Set(data.groups.map((g) => g.id));
      for (const g of data.groups) this.run('INSERT INTO member_groups (id, name, color) VALUES (?, ?, ?)', g.id, g.name, g.color);
      for (const m of data.members) this.insertMember({ ...m, groupId: groupIds.has(m.groupId) ? m.groupId : null });
      for (const it of data.items) this.insertItem({ ...it, groupIds: (it.groupIds || []).filter((g) => groupIds.has(g)) });
      const memberIds = new Set(data.members.map((m) => m.id));
      const itemIds = new Set(data.items.map((it) => it.id));
      const ins = this.db.prepare('INSERT INTO entries (member_id, item_id, date, value) VALUES (?, ?, ?, ?)');
      for (const [mid, days] of Object.entries(data.entries)) {
        if (!memberIds.has(mid)) continue;
        for (const [date, vals] of Object.entries(days)) {
          for (const [iid, v] of Object.entries(vals)) if (itemIds.has(iid) && v > 0) ins.run(mid, iid, date, v);
        }
      }
      const goal = this.db.prepare('INSERT OR REPLACE INTO goals (member_id, item_id, from_week, value) VALUES (?, ?, ?, ?)');
      for (const [mid, byItem] of Object.entries(data.goals)) {
        if (!memberIds.has(mid)) continue;
        for (const [iid, hist] of Object.entries(byItem)) {
          if (!itemIds.has(iid)) continue;
          for (const e of hist) goal.run(mid, iid, e.from, e.value == null ? null : e.value);
        }
      }
    });
    this.data = this.load();
  }

  // ---------- backups ----------

  listBackups() {
    try {
      return fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.db')).sort().reverse();
    } catch {
      return [];
    }
  }

  // VACUUM INTO writes a consistent copy of the database, even while it is in use.
  backupNow(tag) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(this.backupDir, `davom-${stamp}${tag ? '-' + tag : ''}.db`);
    this.db.prepare('VACUUM INTO ?').run(file);
    this.pruneBackups();
  }

  // One automatic backup per day.
  backupIfNeeded() {
    const day = D.today();
    if (this.lastBackupDay === day) return;
    this.lastBackupDay = day;
    if (this.listBackups().some((f) => f.startsWith(`davom-${day}`))) return;
    try {
      this.backupNow();
    } catch (e) {
      console.error('Backup failed:', e.message);
    }
  }

  pruneBackups() {
    for (const f of this.listBackups().slice(KEEP_BACKUPS)) {
      try {
        fs.unlinkSync(path.join(this.backupDir, f));
      } catch {
        /* ignore */
      }
    }
  }

  close() {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }
}

module.exports = { Store, normalize };
