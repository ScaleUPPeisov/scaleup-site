import fs from 'node:fs';

const port = Number(process.env.ENDLUME_CDP_PORT || '9222');
const base = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, tries = 80) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      last = new Error(`${r.status} ${r.statusText}`);
    } catch (e) { last = e; }
    await sleep(250);
  }
  throw last || new Error('CDP endpoint unavailable');
}

async function rpc(wsUrl, method, params = {}) {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`CDP timeout: ${method}`));
    }, 30000);
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`CDP websocket error: ${method}`));
    };
    ws.onopen = () => ws.send(JSON.stringify({ id, method, params }));
    ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.id !== id) return;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
  });
}

async function targets() {
  return await fetchJson(`${base}/json/list`);
}

async function tauriTarget() {
  const rows = await targets();
  const pages = rows.filter(x => x.webSocketDebuggerUrl && (x.type === 'page' || x.type === 'webview'));
  for (const t of pages) {
    try {
      const r = await rpc(t.webSocketDebuggerUrl, 'Runtime.evaluate', {
        expression: 'Boolean(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)',
        returnByValue: true
      });
      if (r?.result?.value === true) return t;
    } catch {}
  }
  throw new Error('No Tauri WebView target exposing invoke()');
}

const mode = process.argv[2] || '';
if (mode === 'targets') {
  console.log(JSON.stringify(await targets()));
} else if (mode === 'eval') {
  const encoded = process.argv[3] || '';
  const expression = Buffer.from(encoded, 'base64').toString('utf8');
  const t = await tauriTarget();
  const r = await rpc(t.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (r?.exceptionDetails) {
    console.error(JSON.stringify(r.exceptionDetails));
    process.exit(4);
  }
  const v = r?.result?.value;
  console.log(JSON.stringify(v === undefined ? null : v));
} else if (mode === 'screenshot') {
  const out = process.argv[3];
  if (!out) throw new Error('screenshot output path missing');
  const t = await tauriTarget();
  await rpc(t.webSocketDebuggerUrl, 'Page.enable');
  const r = await rpc(t.webSocketDebuggerUrl, 'Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
  console.log(out);
} else {
  throw new Error('usage: node cdp.mjs targets | eval <base64-js> | screenshot <path>');
}
