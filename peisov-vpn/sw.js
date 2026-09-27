const CACHE='peisov-vpn-v0.1.1';
const BASE=new URL('./',self.location.href).pathname;
const u=(p='')=>`${BASE}${p}`;
const SHELL=[u(),u('index.html'),u('styles.css'),u('app.js'),u('meduza-config.js'),u('manifest.webmanifest'),u('apple-touch-icon.png'),u('favicon.png'),u('assets/icons/icon-64.png'),u('assets/icons/icon-192.png'),u('assets/icons/icon-512.png')];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const reqUrl=new URL(e.request.url);
  if(reqUrl.origin!==location.origin)return;
  const isAppShell=reqUrl.pathname===BASE||reqUrl.pathname===u('index.html');
  if(isAppShell){
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(u('index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(x=>x.put(e.request,copy))}return r})));
});