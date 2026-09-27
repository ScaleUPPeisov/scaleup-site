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
    $('#connectBtn').dataset.state=ok?'connected':'disconnected';$('#connectLabel').textContent=ok?'PROTECTED':server?.configMeta?.source==='meduza-conf'?'CONFIG':server?.inviteUrl?'ACTIVATE':'SETUP';
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
    $('#serversTable').innerHTML=state.servers.length?state.servers.map(s=>`<tr data-server="${s.id}" style="cursor:pointer"><td>${esc(s.publicName)}</td><td>${s.configMeta?.source==='meduza-conf'?'<span class="status-chip">🔐 CONF</span> ':''}${esc(s.protocol||'ULTRA')}</td><td>${esc(s.expectedIp||'Not set')}</td><td><span class="status-chip ${s.enabled===false?'off':''}">${s.enabled===false?'Disabled':'Enabled'}</span></td></tr>`).join(''):'<tr><td colspan="4" style="color:var(--muted)">No servers configured.</td></tr>';
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
    if(s.configMeta?.source==='meduza-conf'){
      const vaultReady=window.PeisovMeduzaConfig?.has?.(s.id);
      openSheet(`<h3>${esc(s.publicName)}</h3><div class="sheet-copy">Meduza .conf ${vaultReady?'прикреплён и зашифрован локально':'metadata найден, но encrypted config отсутствует'}. PWA не может поднять системный VPN-туннель iOS. Импортируйте конфиг в реальный VPN-клиент, затем вернитесь и проверьте public IP.</div>${vaultReady?'<button class="primary" id="exportMeduza">Export .conf</button>':''}<button class="secondary" id="checkNow">Check VPN IP</button>`);
      if(vaultReady)$('#exportMeduza').onclick=()=>openConfigExport(s);
      $('#checkNow').onclick=()=>{closeSheet();checkConnection(true)};
      return;
    }
    if(!s.inviteUrl){openSheet(`<h3>Activation required</h3><div class="sheet-copy">Для ${esc(s.publicName)} ещё не добавлен Meduza invitation. Откройте PEISOV VPN Control → Servers и добавьте реальную ссылку.</div><button class="primary" id="sheetOwner">Open PEISOV VPN Control</button>`);$('#sheetOwner').onclick=()=>{closeSheet();openOwner()};return}
    openSheet(`<h3>Activate ${esc(s.publicName)}</h3><div class="sheet-copy">PEISOV VPN откроет реальное приглашение. После включения ULTRA вернитесь сюда — приложение проверит ваш public IP и только тогда покажет Protected.</div><button class="primary" id="activateReal">ACTIVATE VPN</button><button class="secondary" id="checkNow">I already activated · Check IP</button>`);
    $('#activateReal').onclick=()=>{log('access_activated',`Opened activation for ${s.publicName}`);window.open(s.inviteUrl,'_blank','noopener');};$('#checkNow').onclick=()=>{closeSheet();checkConnection(true)};
  });

  function openOwner(){document.body.classList.add('owner-mode');$('#userApp').classList.add('hidden');$('#ownerApp').classList.add('active');history.replaceState({},'',location.pathname+'?mode=owner');renderOwner()}
  function closeOwner(){$('#ownerApp').classList.remove('active');$('#userApp').classList.remove('hidden');history.replaceState({},'',location.pathname);renderAll()}
  $('#openOwner').addEventListener('click',openOwner);$('#ownerExit').addEventListener('click',closeOwner);
  $$('#ownerMenu button').forEach(b=>b.addEventListener('click',()=>{$$('#ownerMenu button').forEach(x=>x.classList.toggle('active',x===b));$$('.owner-panel').forEach(p=>p.classList.toggle('active',p.dataset.ownerPanel===b.dataset.owner))}));

  $('#addUserBtn').addEventListener('click',()=>{openSheet(`<h3>Add user</h3><div class="sheet-copy">Локальная запись Owner Preview. Production auth подключается отдельно.</div><form id="userForm"><div class="field"><label>Name</label><input name="name" required autocomplete="off"></div><div class="grid2"><div class="field"><label>Role</label><select name="role"><option>USER</option><option>ADMIN</option></select></div><div class="field"><label>Device limit</label><input name="deviceLimit" type="number" min="1" value="2"></div></div><div class="field"><label>Expiration</label><input name="expiration" type="date"></div><button class="primary">Add user</button></form>`);$('#userForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);state.users.push({id:uid('usr'),name:f.get('name'),role:f.get('role'),deviceLimit:f.get('deviceLimit'),expiration:f.get('expiration'),status:'Active'});save();log('user_added',`Added user · ${f.get('name')}`);renderAll();closeSheet()}});
  const meduzaApi=()=>window.PeisovMeduzaConfig;

  function safeFileName(name){
    const base=String(name||'Meduza.conf').replace(/[\\/:*?"<>|]+/g,'-').trim();
    return base.toLowerCase().endsWith('.conf')?base:base+'.conf';
  }

  function meduzaDefaultName(fileName){
    let base=String(fileName||'Meduza').replace(/\.conf$/i,'').replace(/^MeduzaVPN[-_\s]*/i,'').replace(/[-_]+/g,' ').trim();
    if(!base||/^meduza$/i.test(base))base='Meduza';
    return `PEISOV ${base}`;
  }

  function configMetaFromParsed(parsed,fileName){
    return {
      source:'meduza-conf',
      fileName:safeFileName(fileName),
      protocolId:parsed.protocolId,
      endpoint:parsed.endpoint,
      endpointHost:parsed.endpointHost,
      endpointPort:parsed.endpointPort,
      address:parsed.address,
      dns:parsed.dns,
      mtu:parsed.mtu,
      allowedIPs:parsed.allowedIPs,
      persistentKeepalive:parsed.persistentKeepalive,
      tuning:parsed.tuning,
      secureFields:parsed.sensitiveFields,
      secureFieldCount:parsed.secureFieldCount,
      encrypted:true,
      importedAt:new Date().toISOString()
    };
  }

  function configSummaryHtml(meta){
    if(!meta||meta.source!=='meduza-conf')return '';
    const tuningCount=Object.keys(meta.tuning||{}).length;
    return `<div class="owner-section" style="margin:14px 0 0"><div class="owner-section-head"><strong>Encrypted Meduza config</strong><span class="status-chip">🔐 ATTACHED</span></div><div class="owner-form" style="font-size:12px;line-height:1.65;color:var(--muted)">
      <div><b style="color:var(--text)">File:</b> ${esc(meta.fileName||'Meduza.conf')}</div>
      <div><b style="color:var(--text)">Protocol id:</b> ${esc(meta.protocolId||'meduza')}</div>
      <div><b style="color:var(--text)">Endpoint:</b> ${esc(meta.endpoint||'—')}</div>
      <div><b style="color:var(--text)">Address:</b> ${esc(meta.address||'—')}</div>
      <div><b style="color:var(--text)">DNS:</b> ${esc(meta.dns||'—')}</div>
      <div><b style="color:var(--text)">MTU:</b> ${esc(meta.mtu||'—')}</div>
      <div><b style="color:var(--text)">Allowed IPs:</b> ${esc(meta.allowedIPs||'—')}</div>
      <div><b style="color:var(--text)">Meduza tuning:</b> ${tuningCount} parameters</div>
      <div><b style="color:var(--text)">Sensitive fields:</b> ${Number(meta.secureFieldCount||0)} · stored only inside AES-GCM vault</div>
    </div></div>`;
  }

  function openConfigExport(server){
    const meta=server?.configMeta;
    if(!meta||!meduzaApi()?.has(server.id)){toast('Encrypted config not found');return}
    openSheet(`<h3>Export Meduza .conf</h3><div class="sheet-copy">Введите пароль локального encrypted vault. Пароль нигде не сохраняется.</div><form id="exportConfigForm"><div class="field"><label>Vault password</label><input name="passphrase" type="password" minlength="8" autocomplete="current-password" required></div><button class="primary">Decrypt & export</button><button type="button" class="secondary" id="cancelExport">Cancel</button></form>`);
    $('#cancelExport').onclick=closeSheet;
    $('#exportConfigForm').onsubmit=async e=>{
      e.preventDefault();
      const btn=e.currentTarget.querySelector('button.primary');btn.disabled=true;btn.textContent='Decrypting…';
      try{
        const passphrase=new FormData(e.currentTarget).get('passphrase');
        const raw=await meduzaApi().decrypt(server.id,String(passphrase||''));
        const blob=new Blob([raw],{type:'text/plain;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download=safeFileName(meta.fileName);document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),4000);
        log('config_exported',`Exported encrypted Meduza config · ${server.publicName}`);
        closeSheet();toast('Config exported');
      }catch(err){
        btn.disabled=false;btn.textContent='Decrypt & export';toast(err?.message||'Не удалось расшифровать config');
      }
    };
  }

  function reviewMeduzaImport(file,raw,parsed){
    const defaultName=meduzaDefaultName(file.name);
    openSheet(`<h3>Import Meduza .conf</h3>
      <div class="sheet-copy">Формат распознан как <b>Meduza</b> · protocol id <b>${esc(parsed.protocolId)}</b>. Endpoint не используется как expected exit IP — его нужно указать отдельно после фактического подключения.</div>
      <div class="owner-section" style="margin:0 0 14px">
        <div class="owner-form" style="font-size:12px;line-height:1.65;color:var(--muted)">
          <div><b style="color:var(--text)">Endpoint:</b> ${esc(parsed.endpoint)}</div>
          <div><b style="color:var(--text)">Address:</b> ${esc(parsed.address)}</div>
          <div><b style="color:var(--text)">DNS:</b> ${esc(parsed.dns||'—')}</div>
          <div><b style="color:var(--text)">MTU:</b> ${esc(parsed.mtu||'—')}</div>
          <div><b style="color:var(--text)">Allowed IPs:</b> ${esc(parsed.allowedIPs)}</div>
          <div><b style="color:var(--text)">Protected fields detected:</b> ${parsed.secureFieldCount}</div>
        </div>
      </div>
      <form id="importConfigForm">
        <div class="field"><label>Public name</label><input name="publicName" value="${esc(defaultName)}" required></div>
        <div class="grid2"><div class="field"><label>City</label><input name="city" placeholder="Paris"></div><div class="field"><label>Flag</label><input name="flag" value="🌐" maxlength="8"></div></div>
        <div class="field"><label>Expected exit IP</label><input name="expectedIp" inputmode="decimal" placeholder="После подключения, например 91.x.x.x"></div>
        <div class="field"><label>Create vault password</label><input name="passphrase" type="password" minlength="8" autocomplete="new-password" required></div>
        <div class="field"><label>Repeat password</label><input name="passphrase2" type="password" minlength="8" autocomplete="new-password" required></div>
        <button class="primary">Encrypt & attach config</button>
      </form>`);
    $('#importConfigForm').onsubmit=async e=>{
      e.preventDefault();
      const form=e.currentTarget,f=new FormData(form);
      const p1=String(f.get('passphrase')||''),p2=String(f.get('passphrase2')||'');
      if(p1.length<8){toast('Минимум 8 символов для vault password');return}
      if(p1!==p2){toast('Пароли не совпадают');return}
      const btn=form.querySelector('button.primary');btn.disabled=true;btn.textContent='Encrypting…';
      const s={
        id:uid('srv'),
        publicName:String(f.get('publicName')||'').trim()||defaultName,
        country:'',
        city:String(f.get('city')||'').trim(),
        flag:String(f.get('flag')||'🌐').trim()||'🌐',
        protocol:`Meduza · ${parsed.protocolId}`,
        expectedIp:String(f.get('expectedIp')||'').trim(),
        inviteUrl:'',
        enabled:true,
        configMeta:configMetaFromParsed(parsed,file.name)
      };
      try{
        await meduzaApi().storeEncrypted(s.id,raw,p1,{fileName:file.name,protocolId:parsed.protocolId});
        state.servers.push(s);
        if(!state.selectedServerId)state.selectedServerId=s.id;
        save();
        log('config_imported',`Imported encrypted Meduza config · ${s.publicName}`);
        renderAll();closeSheet();toast('Meduza config attached');
        raw='';
      }catch(err){
        btn.disabled=false;btn.textContent='Encrypt & attach config';toast(err?.message||'Import failed');
      }
    };
  }

  async function readTextFile(file){
    if(file?.text)return await file.text();
    return await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(reader.error||new Error('File read failed'));
      reader.readAsText(file);
    });
  }

  async function importMeduzaFile(file){
    if(!file)return;
    if(!/\.conf$/i.test(file.name)){toast('Выберите файл Meduza с расширением .conf');return}
    try{
      const api=meduzaApi();
      if(!api?.parseConf)throw new Error('Модуль импорта не загрузился. Перезапустите PEISOV VPN.');
      toast('Читаю Meduza .conf…');
      let raw=await readTextFile(file);
      if(!raw.trim())throw new Error('Файл .conf пустой');
      const parsed=api.parseConf(raw);
      reviewMeduzaImport(file,raw,parsed);
    }catch(err){
      console.error('Meduza config import failed',err);
      toast(err?.message||'Не удалось прочитать Meduza config');
    }
  }

  $('#meduzaConfigFile').addEventListener('change',async e=>{
    const input=e.currentTarget;
    const file=input.files?.[0];
    try{if(file)await importMeduzaFile(file)}
    finally{input.value=''}
  });

  $('#addServerBtn').addEventListener('click',()=>openServerEditor(null));
  function openServerEditor(server){
    const s=server||{id:uid('srv'),publicName:'',country:'',city:'',flag:'🌐',protocol:'MeduzaVPN ULTRA',expectedIp:'',inviteUrl:'',enabled:true};
    openSheet(`<h3>${server?'Edit':'Add'} server</h3><div class="sheet-copy">expected exit IP нужен для честной проверки Protected. Endpoint из .conf автоматически expected IP не считается.</div>
      <form id="serverForm">
        <div class="field"><label>Public name</label><input name="publicName" value="${esc(s.publicName)}" placeholder="PEISOV Paris" required></div>
        <div class="grid2"><div class="field"><label>City</label><input name="city" value="${esc(s.city)}" placeholder="Paris"></div><div class="field"><label>Flag</label><input name="flag" value="${esc(s.flag||'🌐')}" maxlength="8"></div></div>
        <div class="field"><label>Expected exit IP</label><input name="expectedIp" value="${esc(s.expectedIp)}" inputmode="decimal" placeholder="91.xxx.xxx.xxx"></div>
        <div class="field"><label>Meduza invitation URL</label><input name="inviteUrl" value="${esc(s.inviteUrl)}" type="url" placeholder="https://…"></div>
        <div class="field"><label>Protocol</label><input name="protocol" value="${esc(s.protocol||'MeduzaVPN ULTRA')}"></div>
        ${configSummaryHtml(s.configMeta)}
        <button class="primary">Save server</button>
        ${server&&s.configMeta?.source==='meduza-conf'?'<button type="button" class="secondary" id="exportServerConfig">Export encrypted .conf</button><button type="button" class="secondary" id="removeServerConfig">Remove encrypted config</button>':''}
        ${server?'<button type="button" class="danger" id="deleteServer">Delete server</button>':''}
      </form>`);

    $('#serverForm').onsubmit=e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);
      Object.assign(s,{publicName:f.get('publicName'),city:f.get('city'),flag:f.get('flag')||'🌐',expectedIp:f.get('expectedIp'),inviteUrl:f.get('inviteUrl'),protocol:f.get('protocol')||'MeduzaVPN ULTRA'});
      if(!server)state.servers.push(s);
      if(!state.selectedServerId)state.selectedServerId=s.id;
      save();log(server?'server_changed':'server_added',`${server?'Changed':'Added'} server · ${s.publicName}`);renderAll();closeSheet();checkConnection()
    };

    if(server&&s.configMeta?.source==='meduza-conf'){
      $('#exportServerConfig').onclick=()=>openConfigExport(s);
      $('#removeServerConfig').onclick=()=>{
        openSheet(`<h3>Remove encrypted config?</h3><div class="sheet-copy">Сервер останется, но зашифрованный .conf будет удалён с этого устройства.</div><button class="danger" id="confirmRemoveConfig">Remove config</button><button class="secondary" id="cancelRemoveConfig">Cancel</button>`);
        $('#cancelRemoveConfig').onclick=closeSheet;
        $('#confirmRemoveConfig').onclick=()=>{
          meduzaApi().remove(s.id);delete s.configMeta;save();log('config_removed',`Removed encrypted Meduza config · ${s.publicName}`);renderAll();closeSheet();toast('Config removed')
        };
      };
    }
    if(server)$('#deleteServer').onclick=()=>{
      if(s.configMeta?.source==='meduza-conf')meduzaApi()?.remove?.(s.id);
      state.servers=state.servers.filter(x=>x.id!==s.id);
      if(state.selectedServerId===s.id)state.selectedServerId=state.servers[0]?.id||null;
      save();log('server_deleted',`Deleted server · ${s.publicName}`);renderAll();closeSheet()
    };
  }
  $('#saveBranding').addEventListener('click',()=>{state.branding.name=$('#brandName').value.trim()||'PEISOV VPN';state.branding.accent=$('#brandAccent').value;save();log('branding_changed',`Branding updated · ${state.branding.name}`);renderAll();toast('Branding saved')});
  $('#brandName').addEventListener('input',e=>$('#previewName').textContent=e.target.value||'PEISOV VPN');$('#brandAccent').addEventListener('input',e=>{$('#previewConnect').style.boxShadow=`0 0 48px ${e.target.value}33`});
  $('#resetLocal').addEventListener('click',()=>{openSheet('<h3>Reset local data?</h3><div class="sheet-copy">Будут удалены локальные users, servers, audit и настройки Owner Preview на этом устройстве.</div><button class="danger" id="confirmReset">Reset</button>');$('#confirmReset').onclick=()=>{localStorage.removeItem(KEY);location.reload()}});
  $('#devicesRow').addEventListener('click',()=>{openSheet(`<h3>My device</h3><div class="sheet-copy">${esc(navigator.userAgent)}<br><br>Preview использует только локальное random identity и не делает агрессивный fingerprinting.</div><button class="secondary" id="closeDevice">Close</button>`);$('#closeDevice').onclick=closeSheet});

  function installHint(){const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);const safari=/Safari/.test(navigator.userAgent)&&!/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);$('#installHelp').classList.toggle('show',ios&&safari&&!standalone)}
  if('serviceWorker' in navigator){
    addEventListener('load',async()=>{
      let reloading=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(reloading)return;
        reloading=true;
        location.reload();
      });
      try{
        let reg;
        try{reg=await navigator.serviceWorker.register('./sw.js?v=0.1.2',{updateViaCache:'none'})}
        catch{reg=await navigator.serviceWorker.register('./sw.js?v=0.1.2')}
        reg.update?.().catch?.(()=>{});
      }catch{}
    });
  }
  if(new URLSearchParams(location.search).get('mode')==='owner')openOwner();
  renderAll();installHint();checkConnection();timer=setInterval(updateSession,1000);setInterval(()=>checkConnection(false),60000);
})();
