import { createContext } from './vendor/preact-htm.js';

// { status, me, lang, changeLang, logout, refreshStatus, onLoggedIn }
export const AppCtx = createContext(null);
