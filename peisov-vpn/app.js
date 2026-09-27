(() => {
  'use strict';
  const KEY='peisov-vpn-owner-preview-v1';
  const defaultState={
    branding:{name:'PEISOV VPN',accent:'#5d7cff'},
    servers:[], users:[], selectedServerId:null, activity:[], audit:[], connection:{ip:null,protected:false,checkedAt:null,startedAt:null}
  };
  const state=load();
  let timer=null;
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  function load(){try{return {...structuredClone(defaultState),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return structuredClone(defaultState)}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state))}
  function uid(prefix='id'){return `${prefix}_${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}`}
  function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function fmtTime(iso){try{return new Intl.DateTimeFormat('ru',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'}).format(new Date(iso))}catch{return '—'}}
  function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
  function log(type,message){const item={id:uid('log'),type,message,at:new Date().toISOString()};state.activity.unshift(item);state.audit.unshift(item);state.activity=state.activity.slice(0,80);state.audit=state.audit.slice(0,120);save();renderActivity();renderAudit()}
  function openSheet(html){$('#sheetContent').innerHTML=html;$('#sheetBackdrop').classList.add('show');$('#sheet').classList.add('show')}
  function closeSheet(){$('#sheetBackdrop').classList.remove('show');$('#sheet').classList.remove('show')}
  $('#sheetBackdrop').addEventListener('click',closeSheet);

  function selectedServer(){return state.servers.find(s=>s.id===state.selectedServerId)||null}
  function normalizeIp(ip){return String(ip||'').trim().toLowerCase().replace(/^::ffff:/,'')}
  async function getPublicIp(){
    const endpoints=['https://api64.ipify.org?format=json','https://api.ipify.org?format=json'];
    let lastErr;
    for(const url of endpoints){try{const c=new AbortController();const t=setTimeout(()=>c.abort(),4500);const r=await fetch(url,{cache:'no-store',signal:c.signal});clearTimeout(t);if(!r.ok)throw new Error(String(r.status));const j=await r.json();if(j.ip)return j.ip}catch(e){lastErr=e}}
    throw lastErr||new Error('IP check failed');
  }
  async function checkConnection(manual=false){
    const btn=$('#connectBtn');btn.dataset.state='checking';$('#connectLabel').textContent='CHECKING';$('#statusText').textContent='Checking…';$('#statusDot').className='dot warn';
    const started=performance.now();
    try{
      const ip=await getPublicIp();const ms=Math.round(performance.now()-started);const server=selectedServer();const expected=server?.expectedIp?.trim();const protectedNow=Boolean(expected&&normalizeIp(ip)===normalizeIp(expected));
      const prev=state.connection.protected;state.connection={...state.connection,ip,protected:protectedNow,checkedAt:new Date().toISOString(),latencyMs:ms};
      if(protectedNow&&!prev){state.connection.startedAt=new Date().toISOString();log('vpn_detected',`VPN detected · ${server.publicName}`)}
      if(!protectedNow&&prev){state.connection.startedAt=null;log('vpn_lost','VPN protection no longer detected')}
      save();renderAll();if(manual)toast(protectedNow?'VPN подтверждён':'VPN IP не подтверждён');
    }catch(e){state.connection={...state.connection,protected:false,checkedAt:new Date().toISOString(),error:true};save();renderAll();if(manual)toast('Не удалось проверить public IP')}
  }
  function quality(){const n=state.connection.latencyMs;if(!Number.isFinite(n))return '—';return n<650?'Excellent':n<1500?'Good':'Slow'}
  function renderHome(){
    const c=state.connection,server=selectedServer(),ok=c.protected;
    $('#statusText').textContent=c.error?'Status unavailable':ok?'Protected':'Not protected';$('#statusDot').className=`dot ${ok?'good':''}`;
    $('#connectBtn').dataset.state=ok?'connected':'disconnected';$('#connectLabel').textContent=ok?'PROTECTED':server?.inviteUrl?'ACTIVATE':'SETUP';
    $('#ipValue').textContent=c.ip||'—';$('#qualityValue').textContent=quality();$('#qualityValue').className=`stat-value ${quality()==='Excellent'?'good':''}`;
    $('#homeFlag').textContent=server?.flag||'🌐';$('#homeLocation').textContent=server?.publicName||'Select location';$('#homeProtocol').textContent=server?`${server.city||server.country||'Location'} · ${server.protocol||'ULTRA'}`:'PEISOV VPN';
    updateSession();
  }
  function updateSession(){const el=$('#sessionValue');const start=state.connection.protected&&state.connection.startedAt?new Date(state.connection.startedAt):null;if(!start){el.textContent='00:00:00';return}const s=Math.max(0,Math.floor((Date.now()-start)/1000));const h=String(Math.floor(s/3600)).padStart(2,'0'),m=String(Math.floor((s%3600)/60)).padStart(2,'0'),sec=String(s%60).padStart(2,'0');el.textContent=`${h}:${m}:${sec}`}
  function renderServers(){
    const list=$('#serverList');if(!state.servers.length){list.innerHTML='<div class="empty"><strong>Серверы ещё не добавлены</strong>Owner → Servers → Add server. Укажите реальный expected exit IP.</div>';return}
    list.innerHTML=state.servers.map(s=>`<div class="row server-pick" data-id="${s.id}"><div class="flag">${esc(s.flag||'🌐')}</div><div class="row-main"><div class="row-title">${esc(s.publicName)}</div><div class="row-sub">${esc(s.city||s.country||'')} · ${esc(s.protocol||'ULTRA')}</div></div><div class="row-side"><div class="server-latency">${s.expectedIp?'IP set':'IP required'}</div><div style="margin-top:4px">${state.selectedServerId===s.id?'Selected':'Select'}</div></div><div class="chev">›</div></div>`).join('');
    $$('.server-pick').forEach(el=>el.addEventListener('click',()=>{state.selectedServerId=el.dataset.id;save();log('server_changed',`Selected server · ${selectedServer()?.publicName||''}`);renderAll();showView('home');checkConnection()}));
  }
  function renderActivity(){const el=$('#activityList');if(!state.activity.length){el.innerHTML='<div class="empty"><strong>Пока тихо</strong>События появятся после реальных действий.</div>';return}el.innerHTML=state.activity.map(a=>`<div class="row"><div class="row-icon">${a.type.startsWith('vpn')?'⌁':'•'}</div><div class="row-main"><div class="row-title">${esc(a.message)}</div><div class="row-sub">${esc(a.type.replaceAll('_',' '))}</div></div><div class="row-side">${fmtTime(a.at)}</div></div>`).join('')}
  function renderOwner(){
    $('#mUsers').textContent=state.users.length;$('#mServers').textContent=state.servers.length;$('#mIp').textContent=state.connection.ip||'—';$('#mStatus').textContent=state.connection.protected?'Protected':'Not protected';
    $('#usersTable').innerHTML=state.users.length?state.users.map(u=>`<tr data-user="${u.id}"><td>${esc(u.name)}</td><td>${esc(u.role)}</td><td><span class="status-chip ${u.status==='Active'?'':'off'}">${esc(u.status)}</span></td><td>${esc(u.expiration||'—')}</td><td>${esc(u.deviceLimit||'—')}</td></tr>`).join(''):'<tr><td colspan="5" style="color:var(--muted)">No local users yet.</td></tr>';
    $('#serversTable').innerHTML=state.servers.length?state.servers.map(s=>`<tr data-server="${s.id}" style="cursor:pointer"><td>${esc(s.publicName)}</td><td>${esc(s.protocol||'ULTRA')}</td><td>${esc(s.expectedIp||'Not set')}</td><td><span class="status-chip ${s.enabled===false?'off':''}">${s.enabled===false?'Disabled':'Enabled'}</span></td></tr>`).join(''):'<tr><td colspan="4" style="color:var(--muted)">No servers configured.</td></tr>';
    $$('[data-server]').forEach(tr=>tr.addEventListener('click',()=>openServerEditor(state.servers.find(s=>s.id===tr.dataset.server))));
    $('#brandName').value=state.branding.name||'PEISOV VPN';$('#brandAccent').value=state.branding.accent||'#5d7cff';$('#previewName').textContent=state.branding.name||'PEISOV VPN';$('#previewConnect').style.boxShadow=`0 0 48px ${state.branding.accent}22`;document.documentElement.style.setProperty('--accent',state.branding.accent||'#5d7cff');
  }
  function renderAudit(){const el=$('#auditTable');el.innerHTML=state.audit.length?state.audit.map(a=>`<div class="row"><div class="row-main"><div class="row-title">${esc(a.message)}</div><div class="row-sub">OWNER · ${esc(a.type)}</div></div><div class="row-side">${fmtTime(a.at)}</div></div>`).join(''):'<div class="empty"><strong>No audit events</strong>Owner actions will appear here.</div>'}
  function renderAll(){renderHome();renderServers();renderActivity();renderOwner();renderAudit()}

  function showView(name){$$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===name));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.nav===name))}
  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.nav)));
  $('#refreshBtn').addEventListener('click',()=>checkConnection(true));$('#checkAllBtn').addEventListener('click',()=>checkConnection(true));
  $('#locationCard').addEventListener('click',()=>showView('servers'));
  $('#connectBtn').addEventListener('click',()=>{
    const s=selectedServer();if(state.connection.protected){checkConnection(true);return}
    if(!s){openSheet('<h3>Select a server</h3><div class="sheet-copy">Сначала выберите локацию. Статус CONNECTED не будет показан без реального подтверждения IP.</div><button class="primary" id="sheetServers">Open Servers</button>');$('#sheetServers').onclick=()=>{closeSheet();showView('servers')};return}
    if(!s.inviteUrl){openSheet(`<h3>Activation required</h3><div class="sheet-copy">Для ${esc(s.publicName)} ещё не добавлен Meduza invitation. Откройте PEISOV VPN Control → Servers и добавьте реальную ссылку.</div><button class="primary" id="sheetOwner">Open PEISOV VPN Control</button>`);$('#sheetOwner').onclick=()=>{closeSheet();openOwner()};return}
    openSheet(`<h3>Activate ${esc(s.publicName)}</h3><div class="sheet-copy">PEISOV VPN откроет реальное приглашение. После включения ULTRA вернитесь сюда — приложение проверит ваш public IP и только тогда покажет Protected.</div><button class="primary" id="activateReal">ACTIVATE VPN</button><button class="secondary" id="checkNow">I already activated · Check IP</button>`);
    $('#activateReal').onclick=()=>{log('access_activated',`Opened activation for ${s.publicName}`);window.open(s.inviteUrl,'_blank','noopener');};$('#checkNow').onclick=()=>{closeSheet();checkConnection(true)};
  });

  function openOwner(){document.body.classList.add('owner-mode');$('#userApp').classList.add('hidden');$('#ownerApp').classList.add('active');history.replaceState({},'',location.pathname+'?mode=owner');renderOwner()}
  function closeOwner(){$('#ownerApp').classList.remove('active');$('#userApp').classList.remove('hidden');history.replaceState({},'',location.pathname);renderAll()}
  $('#openOwner').addEventListener('click',openOwner);$('#ownerExit').addEventListener('click',closeOwner);
  $$('#ownerMenu button').forEach(b=>b.addEventListener('click',()=>{$$('#ownerMenu button').forEach(x=>x.classList.toggle('active',x===b));$$('.owner-panel').forEach(p=>p.classList.toggle('active',p.dataset.ownerPanel===b.dataset.owner))}));

  $('#addUserBtn').addEventListener('click',()=>{openSheet(`<h3>Add user</h3><div class="sheet-copy">Локальная запись Owner Preview. Production auth подключается отдельно.</div><form id="userForm"><div class="field"><label>Name</label><input name="name" required autocomplete="off"></div><div class="grid2"><div class="field"><label>Role</label><select name="role"><option>USER</option><option>ADMIN</option></select></div><div class="field"><label>Device limit</label><input name="deviceLimit" type="number" min="1" value="2"></div></div><div class="field"><label>Expiration</label><input name="expiration" type="date"></div><button class="primary">Add user</button></form>`);$('#userForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);state.users.push({id:uid('usr'),name:f.get('name'),role:f.get('role'),deviceLimit:f.get('deviceLimit'),expiration:f.get('expiration'),status:'Active'});save();log('user_added',`Added user · ${f.get('name')}`);renderAll();closeSheet()}});
  $('#addServerBtn').addEventListener('click',()=>openServerEditor(null));
  function openServerEditor(server){const s=server||{id:uid('srv'),publicName:'',country:'',city:'',flag:'🌐',protocol:'MeduzaVPN ULTRA',expectedIp:'',inviteUrl:'',enabled:true};openSheet(`<h3>${server?'Edit':'Add'} server</h3><div class="sheet-copy">expected exit IP нужен для честной проверки Protected.</div><form id="serverForm"><div class="field"><label>Public name</label><input name="publicName" value="${esc(s.publicName)}" placeholder="PEISOV Paris" required></div><div class="grid2"><div class="field"><label>City</label><input name="city" value="${esc(s.city)}" placeholder="Paris"></div><div class="field"><label>Flag</label><input name="flag" value="${esc(s.flag||'🌐')}" maxlength="8"></div></div><div class="field"><label>Expected exit IP</label><input name="expectedIp" value="${esc(s.expectedIp)}" inputmode="decimal" placeholder="91.xxx.xxx.xxx"></div><div class="field"><label>Meduza invitation URL</label><input name="inviteUrl" value="${esc(s.inviteUrl)}" type="url" placeholder="https://…"></div><div class="field"><label>Protocol</label><input name="protocol" value="${esc(s.protocol||'MeduzaVPN ULTRA')}"></div><button class="primary">Save server</button>${server?'<button type="button" class="danger" id="deleteServer">Delete server</button>':''}</form>`);$('#serverForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);Object.assign(s,{publicName:f.get('publicName'),city:f.get('city'),flag:f.get('flag')||'🌐',expectedIp:f.get('expectedIp'),inviteUrl:f.get('inviteUrl'),protocol:f.get('protocol')||'MeduzaVPN ULTRA'});if(!server)state.servers.push(s);if(!state.selectedServerId)state.selectedServerId=s.id;save();log(server?'server_changed':'server_added',`${server?'Changed':'Added'} server · ${s.publicName}`);renderAll();closeSheet();checkConnection()};if(server)$('#deleteServer').onclick=()=>{state.servers=state.servers.filter(x=>x.id!==s.id);if(state.selectedServerId===s.id)state.selectedServerId=state.servers[0]?.id||null;save();log('server_deleted',`Deleted server · ${s.publicName}`);renderAll();closeSheet()}}
  $('#saveBranding').addEventListener('click',()=>{state.branding.name=$('#brandName').value.trim()||'PEISOV VPN';state.branding.accent=$('#brandAccent').value;save();log('branding_changed',`Branding updated · ${state.branding.name}`);renderAll();toast('Branding saved')});
  $('#brandName').addEventListener('input',e=>$('#previewName').textContent=e.target.value||'PEISOV VPN');$('#brandAccent').addEventListener('input',e=>{$('#previewConnect').style.boxShadow=`0 0 48px ${e.target.value}33`});
  $('#resetLocal').addEventListener('click',()=>{openSheet('<h3>Reset local data?</h3><div class="sheet-copy">Будут удалены локальные users, servers, audit и настройки Owner Preview на этом устройстве.</div><button class="danger" id="confirmReset">Reset</button>');$('#confirmReset').onclick=()=>{localStorage.removeItem(KEY);location.reload()}});
  $('#devicesRow').addEventListener('click',()=>{openSheet(`<h3>My device</h3><div class="sheet-copy">${esc(navigator.userAgent)}<br><br>Preview использует только локальное random identity и не делает агрессивный fingerprinting.</div><button class="secondary" id="closeDevice">Close</button>`);$('#closeDevice').onclick=closeSheet});

  function installHint(){const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);const safari=/Safari/.test(navigator.userAgent)&&!/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);$('#installHelp').classList.toggle('show',ios&&safari&&!standalone)}
  if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}))}
  if(new URLSearchParams(location.search).get('mode')==='owner')openOwner();
  renderAll();installHint();checkConnection();timer=setInterval(updateSession,1000);setInterval(()=>checkConnection(false),60000);
})();
