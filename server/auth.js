'use strict';
const crypto = require('crypto');

const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 60 * 1000;

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, 32).toString('hex');
  return { salt, hash };
}

function verifySecret(secret, stored) {
  if (!stored || !stored.salt || !stored.hash) return false;
  const a = crypto.scryptSync(String(secret), stored.salt, 32);
  const b = Buffer.from(stored.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class Sessions {
  constructor() {
    this.map = new Map();
  }
  create(role, memberId = null) {
    const token = crypto.randomBytes(24).toString('hex');
    this.map.set(token, { role, memberId, lastSeen: Date.now() });
    return token;
  }
  get(token) {
    const s = token && this.map.get(token);
    if (!s) return null;
    if (Date.now() - s.lastSeen > SESSION_IDLE_MS) {
      this.map.delete(token);
      return null;
    }
    s.lastSeen = Date.now();
    return s;
  }
  delete(token) {
    this.map.delete(token);
  }
  clear() {
    this.map.clear();
  }
  dropMember(memberId) {
    for (const [t, s] of this.map) if (s.memberId === memberId) this.map.delete(t);
  }
  dropAdmins() {
    for (const [t, s] of this.map) if (s.role === 'admin') this.map.delete(t);
  }
}

// Slows down PIN / password guessing: after MAX_FAILS wrong attempts the key is locked for a minute.
class Throttle {
  constructor() {
    this.map = new Map();
  }
  lockedFor(key) {
    const e = this.map.get(key);
    if (!e || !e.until) return 0;
    const left = e.until - Date.now();
    if (left <= 0) {
      this.map.delete(key);
      return 0;
    }
    return Math.ceil(left / 1000);
  }
  fail(key) {
    const e = this.map.get(key) || { fails: 0, until: 0 };
    e.fails += 1;
    if (e.fails >= MAX_FAILS) {
      e.fails = 0;
      e.until = Date.now() + LOCK_MS;
    }
    this.map.set(key, e);
  }
  success(key) {
    this.map.delete(key);
  }
}

module.exports = { hashSecret, verifySecret, Sessions, Throttle };
