const TOKEN_KEY = 'davom.token';
let unauthorizedHandler = null;

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token = readToken();

export function getToken() {
  return token;
}

export function setToken(t) {
  token = t;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: keep the token in memory only */
  }
}

export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

function headers(json) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('err_network');
  }
  if (!res.ok) {
    let code = 'err_server';
    try {
      code = (await res.json()).error || code;
    } catch {
      /* not JSON */
    }
    if (code === 'err_unauthorized' && unauthorizedHandler) unauthorizedHandler();
    const err = new Error(code);
    err.status = res.status;
    throw err;
  }
  return res;
}

export async function api(method, url, body) {
  const res = await request(method, url, body);
  return res.json();
}

// Fetch a file with the auth header and hand it to the browser as a download.
export async function download(url) {
  const res = await request('GET', url);
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="([^"]+)"/);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m ? m[1] : 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
