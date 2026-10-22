'use strict';
const fs = require('fs');
const path = require('path');
const D = require('./dates');

const DATA_VERSION = 1;
const KEEP_BACKUPS = 30;

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
    version: DATA_VERSION,
    settings: defaultSettings(),
    admin: null,
    groups: [],
    members: [],
    items: [],
    entries: {},
    goals: {}, // goals[memberId][itemId] = [{ from: weekStart, value }]
  };
}

// Fill in anything missing so older or hand-edited files keep working.
function normalize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid data file');
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

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'davom-data.json');
    this.backupDir = path.join(dir, 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.data = this.load();
    this.lastBackupDay = null;
    this.backupIfNeeded();
  }

  load() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return defaultData();
      throw e;
    }
    try {
      return normalize(JSON.parse(raw));
    } catch (e) {
      // Keep the broken file for inspection and fall back to the newest backup.
      const broken = this.file.replace(/\.json$/, `.broken-${Date.now()}.json`);
      fs.renameSync(this.file, broken);
      const latest = this.listBackups()[0];
      if (latest) {
        console.error(`Data file unreadable, restored from backup ${latest}`);
        return normalize(JSON.parse(fs.readFileSync(path.join(this.backupDir, latest), 'utf8')));
      }
      console.error('Data file unreadable and no backup found, starting fresh');
      return defaultData();
    }
  }

  // Atomic write: write to a temp file and rename over the real one.
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
    this.backupIfNeeded();
  }

  replace(raw) {
    this.backupNow('before-restore');
    this.data = normalize(raw);
    this.save();
  }

  listBackups() {
    try {
      return fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.json')).sort().reverse();
    } catch {
      return [];
    }
  }

  backupNow(tag) {
    if (!fs.existsSync(this.file)) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(this.file, path.join(this.backupDir, `davom-${stamp}${tag ? '-' + tag : ''}.json`));
    this.pruneBackups();
  }

  // One automatic backup per day.
  backupIfNeeded() {
    const day = D.today();
    if (this.lastBackupDay === day) return;
    this.lastBackupDay = day;
    if (this.listBackups().some((f) => f.startsWith(`davom-${day}`))) return;
    this.backupNow();
  }

  pruneBackups() {
    for (const f of this.listBackups().slice(KEEP_BACKUPS)) {
      try { fs.unlinkSync(path.join(this.backupDir, f)); } catch { /* ignore */ }
    }
  }
}

module.exports = { Store, normalize, DATA_VERSION };
