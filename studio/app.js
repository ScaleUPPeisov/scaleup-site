import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.55.0';
const BASE='https://odlseljmogaguyqdlkyv.supabase.co';
const PUB='sb_publishable_zKjzhQTdTG8f9BfR2X5NVg_zQgjo70f';
const db=createClient(BASE,PUB,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vyron-ai-studio-owner-v2'}});
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let user=null,projects=[],channels=[],active=null,health=null,selected='Корабли',mode='graphics',count=1,busy=false,connected=false;
let macDevices=[],macJobs=[],macSchemaAvailable=false;
const LOCAL_KEY='vyron-ai-studio-local-v2';
const localGet=()=>{try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'{"projects":[],"channels":[]}')}catch{return {projects:[],channels:[]}}};
const localSave=()=>{if(!connected)localStorage.setItem(LOCAL_KEY,JSON.stringify({projects,channels}))};
const auth=document.createElement('div');auth.id='authCover';auth.innerHTML='<div id="authCard"><h2>VYRON AI STUDIO</h2><p>Личный вход в облачные проекты</p><form id="studioLoginForm"><input type="email" required id="loginEmail" placeholder="Email Supabase" autocomplete="username"><input type="password" required id="loginPassword" placeholder="Пароль Supabase" autocomplete="current-password"><button id="loginSubmit">Войти</button></form><p id="loginError" style="color:#ff8e88"></p><small>Защита сайта Vercel + дополнительная проверка Supabase. Не передавай пароль сюда, вводи только на странице.</small></div>';
document.body.append(auth);authShow(true);
const guestBtn=h('button',{type:'button'},'Открыть локально, без облачной синхронизации');
guestBtn.style.cssText='background:#232d25;color:#daf2c7;border:1px solid #465346;margin-top:8px';
guestBtn.onclick=()=>{
 user={id:'offline-owner',email:'Локальный режим'};connected=false;const local=localGet();projects=local.projects||[];channels=local.channels||[];health=null;authShow(false);
 $('studioStatusLine').textContent='ЛОКАЛЬНЫЙ РЕЖИМ: черновики остаются только в этом браузере. Для синхронизации с другими устройствами войди в Supabase и создай таблицы.';
 $('studioAuthState').textContent='Локальный режим';renderEverything();notify('Открыт локальный редактор без облачной синхронизации');
};
$('authCard').append(guestBtn);

const editorEl=document.createElement('div');editorEl.id='studioEditor';editorEl.innerHTML='<div id="editorBox"><h2 id="editorTitle">Редактор</h2><textarea id="editorTextarea" placeholder="Сценарий..."></textarea><input id="editorDate" type="datetime-local" style="display:none"><div class="editorBtns"><button class="lime" id="editorSave">Сохранить в облаке</button><button id="editorClose">Закрыть</button></div></div>';document.body.append(editorEl);
const toast=document.createElement('div');toast.id='studioToast';document.body.append(toast);
const logout=makeBtn('Выйти из аккаунта',async()=>{await db.auth.signOut();user=null;authShow(true)});logout.id='logoutBtn';
const authLabel=h('div',{id:'studioAuthState'},'');$('settings').querySelector('.card').append(authLabel,logout);
const now=()=>new Date().toISOString();
const stages=['Сценарий и план','Озвучка Lumean','Визуальные сцены','Рендер ENDLUME'];
function notify(message,bad=false){const t=$('studioToast');t.textContent=message;t.className=bad?'bad':'';t.style.display='block';clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>t.style.display='none',6000)}
function h(tag,props={},text=''){const e=document.createElement(tag);Object.entries(props).forEach(([k,v])=>{if(k==='class')e.className=v;else if(k==='onclick')e.addEventListener('click',v);else if(k==='title')e.title=v;else e.setAttribute(k,v)});if(text)e.textContent=text;return e}
function authShow(show){$('authCover').classList.toggle('show',show)}
function page(name){document.querySelectorAll('.page').forEach(e=>e.classList.toggle('active',e.id===name));document.querySelectorAll('[data-page]').forEach(e=>e.classList.toggle('active',e.dataset.page===name));if(name==='archive')renderArchive();if(name==='analytics')renderAnalytics();if(name==='channels')renderChannels();if(name==='calendar')renderCalendar();if(name==='expenses')renderExpenses();if(name==='settings')renderSettings();}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
$('collapseBtn').onclick=()=>$('app').classList.toggle('collapsed');
function setChannel(name){selected=name;document.querySelectorAll('.channel-tile').forEach(e=>e.classList.toggle('active',e.dataset.channel===name));$('activeChannel').textContent=name}
document.querySelectorAll('.channel-tile').forEach(b=>b.onclick=()=>setChannel(b.dataset.channel));
$('otherChannel').onchange=e=>{if(e.target.value)setChannel(e.target.value)};
function dateRu(){const d=new Date();return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear()}
function dateISO(v){const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(v).trim());if(!m)return null;const iso=m[3]+'-'+m[2]+'-'+m[1];return new Date(iso).toISOString().slice(0,10)===iso?iso:null}
function renderRows(){const box=$('scenarioRows');box.innerHTML='';for(let i=0;i<count;i++){const row=h('div',{class:'scenario-row'});row.innerHTML='<span class="row-number">'+(i+1)+'</span><input class="input scenario-date" aria-label="Дата сценария" value="'+dateRu()+'"><input class="input scenario-topic" maxlength="280" aria-label="Тема сценария" placeholder="Тема (не обязательно)">';box.append(row)}}
$('decrement').onclick=()=>{count=Math.max(1,count-1);renderRows()};
$('increment').onclick=()=>{count=Math.min(5,count+1);renderRows()};
document.querySelectorAll('#modeSwitch [data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('#modeSwitch button').forEach(x=>x.classList.toggle('active',x===b))});
$('advancedToggle').onclick=()=>{$('advanced').classList.toggle('open');$('advancedToggle').setAttribute('aria-expanded',$('advanced').classList.contains('open'))};
function updateEstimate(){const mins=Number($('duration').value),seconds=Number($('visualStep').value),n=Math.ceil(mins*60/seconds);$('calcDuration').textContent=mins+' минут';$('calcImages').textContent=String(n);$('calcCost').textContent='Оценка зависит от API';}
$('duration').onchange=updateEstimate;$('visualStep').onchange=updateEstimate;
async function session(){const {data,error}=await db.auth.getUser();if(error||!data?.user){user=null;authShow(true);return false;}user=data.user;authShow(false);$('studioAuthState').textContent='Вход: '+(user.email||user.id);return true}
$('studioLoginForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('loginEmail').value.trim(),password=$('loginPassword').value;const b=$('loginSubmit');b.disabled=true;b.textContent='Проверяем…';const {error}=await db.auth.signInWithPassword({email,password});b.disabled=false;b.textContent='Войти';$('loginPassword').value='';if(error){$('loginError').textContent=error.message;return}await boot()});

async function load(){
 if(!user)return;
 const [p,c]=await Promise.all([db.from('studio_v2_projects').select('*').order('updated_at',{ascending:false}).limit(200),db.from('studio_v2_channels').select('*').order('name')]);
 if(p.error||c.error){connected=false;const local=localGet();projects=local.projects||[];channels=local.channels||[];const msg='ЛОКАЛЬНЫЙ РЕЖИМ: проекты работают только в этом браузере, между устройствами не синхронизируются. Для облачной синхронизации нужна миграция studio/sql/001_owner_tables.sql в Supabase.';$('studioStatusLine').textContent=msg;notify('Облачные таблицы не настроены: включён локальный режим',true);renderEverything();return}
 connected=true;$('studioStatusLine').textContent='Облачная база подключена · Supabase · изменения видны с любого устройства';
 projects=p.data||[];channels=c.data||[];
 await refreshMac(false);
 if(active)active=projects.find(p=>p.id===active.id)||null;
 renderEverything();
}
async function boot(){
 if(!(await session()))return;
 await load();
 try{const r=await api('/api/health',null,'GET');health=r;}catch(e){health=null;notify('Интеграции: '+e.message,true)}
 renderEverything();
}
async function api(url,body,method='POST'){
 const {data}=await db.auth.getSession(),token=data?.session?.access_token;
 if(!token)throw Error('Нужен вход Supabase');
 const r=await fetch(url,{method,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},body:method==='GET'?undefined:JSON.stringify(body),cache:'no-store'});
 const d=await r.json().catch(()=>({}));
 if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));
 return d;
}

async function refreshMac(render=true){
 if(!user||!connected){macDevices=[];macJobs=[];macSchemaAvailable=false;return;}
 const [d,j]=await Promise.all([
   db.from('studio_v2_mac_devices').select('id,device_name,agent_version,endlume_status,vyron_channels,last_seen').order('last_seen',{ascending:false}).limit(8),
   db.from('studio_v2_mac_jobs').select('id,project_id,status,action,result,error_message,created_at,updated_at').order('created_at',{ascending:false}).limit(60)
 ]);
 if(d.error||j.error){macSchemaAvailable=false;macDevices=[];macJobs=[];}
 else {macSchemaAvailable=true;macDevices=d.data||[];macJobs=j.data||[];}
 if(render)renderEverything();
}
function macOnline(){
 const n=Date.now();
 return macDevices.find(x=>x.endlume_status==='running' &&
  n-new Date(x.last_seen).getTime()>=0 &&
  n-new Date(x.last_seen).getTime()<70000);
}
function jobFor(p){return p?macJobs.find(x=>x.project_id===p.id):null;}
function renderStatus(p){
 const j=jobFor(p);
 if(!j)return 'Нет заданий';
 const names={queued:'Ожидает Mac',claimed:'Захвачено агентом',running:'ENDLUME рендерит',completed:'Готовый MP4',error:'Ошибка ENDLUME',cancelled:'Отменено'};
 const base=names[j.status]||j.status;
 const pct=Number(j.result?.progress);
 return j.status==='running'&&Number.isFinite(pct)&&pct>=0&&pct<100
  ? base+' · '+pct.toFixed(1)+'% · '+String(j.result?.stage||'').slice(0,70)
  : base;
}
async function enqueueMacRender(){
 if(!active)throw Error('Создай проект');
 if(!connected)throw Error('Для удалённого Mac-рендера требуется Supabase. В локальном режиме доступен только экспорт JSON');
 if(!macSchemaAvailable)throw Error('Нужна SQL-миграция studio/sql/002_mac_queue.sql в Supabase');
 if(!macOnline())throw Error('Агент Mac или ENDLUME сейчас офлайн. Запусти обе программы на Mac');
 const last=jobFor(active);
 if(last&&['queued','claimed','running'].includes(last.status))
   throw Error('Задание уже находится в очереди или рендерится; повтор запрещён');
 if(!confirm('Передать проект «'+active.topic+'» на твой Mac в ENDLUME? Требуются готовые изображения и звук (Lumean или локальные файлы). Платная генерация НЕ запускается автоматически.'))return;
 const {data,error}=await db.from('studio_v2_mac_jobs').insert({
  owner_id:user.id,project_id:active.id,action:'render_endlume',
  payload:{schema_version:1,channel:active.channel,mode:active.mode},status:'queued'
 }).select('id,status').single();
 if(error)throw error;
 await savePatch({status:'ready_for_render'},'Отправлено в очередь ENDLUME: '+data.id);
 notify('Поставлено в очередь Mac: '+data.id);
 await refreshMac(true);
}

async function createProjects(){
 if(busy)return;
 const rows=Array.from(document.querySelectorAll('#scenarioRows .scenario-row'));
 const drafts=rows.map(row=>({topic:row.querySelector('.scenario-topic').value.trim()||'Новая история · '+selected,project_date:dateISO(row.querySelector('.scenario-date').value)}));
 if(drafts.some(d=>!d.project_date))return notify('Дата должна быть в формате ДД.ММ.ГГГГ',true);
 busy=true;$('startBtn').disabled=true;
 try{
  const items=drafts.map(d=>({owner_id:user.id,channel:selected,topic:d.topic,project_date:d.project_date,duration_minutes:Number($('duration').value),visual_every_seconds:Number($('visualStep').value),mode,preset:$('preset').value,voice:$('voice').value,quality:$('quality').value,status:'draft',logs:[{at:now(),text:'Проект создан. Платные запросы не выполнялись.'}]}));
  if(!connected){const data=items.map(x=>({...x,id:crypto.randomUUID(),created_at:now(),updated_at:now(),outline:'',script_text:'',jobs:[],assets:[],scenes:[],usage:[],seo:{}}));projects=[...data,...projects];active=data[0];localSave();notify('Создано локальных проектов: '+data.length+' (без синхронизации)');renderEverything();page('scenarios');}
  else{const {data,error}=await db.from('studio_v2_projects').insert(items).select();if(error)throw error;active=data[0];notify('Создано облачных проектов: '+data.length);await load();page('scenarios');}
 }catch(e){notify('Не удалось создать проект: '+e.message,true)}finally{busy=false;$('startBtn').disabled=false}
}
$('startBtn').onclick=createProjects;
async function savePatch(patch,line){
 if(!active)throw Error('Выбери проект');
 const logs=[...(active.logs||[])];
 if(line)logs.push({at:now(),text:line});
 if(line)patch.logs=logs.slice(-120);
 if(!connected){active={...active,...patch,updated_at:now()};projects=projects.map(p=>p.id===active.id?active:p);localSave();renderEverything();return active;}
 const {data,error}=await db.from('studio_v2_projects').update(patch).eq('id',active.id).select().single();
 if(error)throw error;
 active=data;projects=projects.map(p=>p.id===data.id?data:p);renderEverything();return data;
}
function computedStage(p){if(!p)return 0;if(p.status==='finished')return 4;if(p.status==='rendering'||p.status==='ready_for_render')return 3;if((p.assets||[]).length)return 2;if((p.jobs||[]).some(x=>x.type==='lumean'))return 2;if(p.script_text||p.outline)return 1;return 0}
function renderProject(){
 const p=active;$('activeChannel').textContent=p?.channel||selected;$('folderName').textContent=p?p.topic:'Выбери проект в архиве';
 $('elapsed').textContent=p?'—':'0:00:00';$('spent').textContent='по провайдеру';
 const finished=jobFor(p)?.status==='completed'&&jobFor(p)?.result?.verified_by_engine===true;
 const stage=finished?4:computedStage(p);$('progressPercent').textContent=p?stage+'/4':'0/4';
 $('runState').textContent=p?'Статус: '+p.status:'Ожидает проекта';
 document.querySelectorAll('#phasebar .fill').forEach((f,i)=>f.style.width=p&&stage>i?'100%':'0%');
 $('stages').innerHTML='';
 if(!p){
  $('stages').append(h('div',{class:'studioStage'},'Создай проект слева или выбери существующий в архиве.'));
  $('studioStageActions').innerHTML='';$('journal').textContent='Нет событий';return;
 }
 const statuses=[
  p.outline&&p.script_text?'План и текст сохранены':p.outline?'План сохранён, текст ещё нужен':'Ожидает план и сценарий',
  (p.jobs||[]).find(x=>x.type==='lumean')?.status||'Заказ не создан',
  (p.assets||[]).length+' сохранённых ссылок на изображения',
  p.status==='finished'?'Проверенный итоговый ролик':'Ожидает локальный рендер на Mac'
 ];
 stages.forEach((name,i)=>{
  const block=h('div',{class:'studioStage'+(stage>i?' done':stage===i?' active':'')});
  const hh=h('h3',{},(i+1)+'. '+name);const pp=h('p',{},statuses[i]);block.append(hh,pp);
  if(i===0){block.append(makeBtn('План через ИИ',()=>callAI('outline'),true));block.append(makeBtn('Редактировать текст',()=>editor('script')));block.append(makeBtn('Написать главу',()=>callAI('chapter')));block.append(makeBtn('SEO',()=>callAI('seo')))}
  if(i===1){block.append(makeBtn('Расчёт Lumean',quoteVoice));block.append(makeBtn('Заказать озвучку',createVoice));block.append(makeBtn('Проверить статус',pollVoice))}
  if(i===2){block.append(makeBtn('Новый AI-кадр',makeImage));block.append(makeBtn('Проверить кадр',pollImage));block.append(makeBtn('Раскадровка AI',()=>callAI('scenes')))}
  if(i===3){
    block.append(makeBtn('Рендер в ENDLUME на Mac',enqueueMacRender,true));
    block.append(makeBtn('Обновить статус Mac',()=>refreshMac(true)));
    block.append(makeBtn('Экспорт манифеста',downloadManifest));
    block.append(makeBtn('Планировать дату',()=>editor('schedule')));
    block.append(h('p',{},'Очередь: '+renderStatus(p)));
    const macJob=jobFor(p);
    if(macJob?.status==='error')block.append(h('p',{},'Ошибка: '+String(macJob.error_message||'неизвестная').slice(0,240)));
    if(macJob?.status==='completed'&&macJob.result?.mp4_path)block.append(h('p',{},'MP4 на Mac: '+macJob.result.mp4_path));
  }
  $('stages').append(block);
 });
 $('journal').innerHTML='';
 (p.logs||[]).slice(-30).reverse().forEach(x=>$('journal').append(h('div',{},new Date(x.at).toLocaleString('ru-RU')+' — '+x.text)));
 $('studioActiveLine').textContent='Проект: '+p.topic+' · '+p.duration_minutes+' минут · '+p.quality+' · '+p.status;
 $('studioStageActions').innerHTML='';
 $('studioStageActions').append(makeBtn('Сценарий',()=>editor('script'),true),makeBtn('Экспорт JSON',downloadManifest),makeBtn('Архив',()=>page('archive')));
}
function makeBtn(text,click,primary=false){const b=h('button',{class:'studioAct'+(primary?' primary':'')},text);b.addEventListener('click',async()=>{if(busy)return;try{busy=true;b.disabled=true;await click()}catch(e){notify(e.message,true)}finally{busy=false;b.disabled=false}});return b}
function recordUsage(item){return [...(active.usage||[]),{at:now(),...item}].slice(-80)}
async function callAI(action){
 if(!active)throw Error('Нет проекта');if(!health?.ai?.ready)throw Error('AI API пока не подключён. Нужен серверный ключ в Vercel.');
 const chapter=action==='chapter'?prompt('Какую главу нужно написать?','Глава 1'):null;if(action==='chapter'&&!chapter)return;
 if(!confirm('Запустить платный запрос к текстовой модели для проекта «'+active.topic+'»?'))return;
 notify('Отправлен реальный запрос '+action+'. Результат появится после ответа сервера.');
 const result=await api('/api/ai',{action,topic:active.topic,channel:active.channel,minutes:active.duration_minutes,chapter,context:action==='outline'?'':(active.outline||'')+'\\n'+(active.script_text||'').slice(0,7000)});
 let patch={usage:recordUsage({provider:result.provider,model:result.model,action,usage:result.usage}),status:'script'};
 if(action==='outline')patch.outline=result.text;
 if(action==='chapter')patch.script_text=(active.script_text?active.script_text+'\\n\\n':'')+result.text;
 if(action==='seo')patch.seo={raw:result.text};
 if(action==='scenes')patch.scenes=[{text:result.text,generated_at:now()}];
 await savePatch(patch,'Готово: '+action+' · '+result.model+' · данные сохранены');
 notify('Генерация завершена. Результат сохранён в Supabase.');
 editor(action==='outline'?'outline':action==='chapter'?'script':action==='seo'?'seo':'scenes');
}
let latestQuote=null;
async function quoteVoice(){
 if(!active?.script_text?.trim())throw Error('Сначала сохрани текст сценария');
 if(!health?.lumean?.ready)throw Error('Нужны серверные LUMEAN_API_KEY и LUMEAN_TEMPLATE_ID');
 const d=await api('/api/voice',{action:'quote',text:active.script_text});latestQuote={projectId:active.id,text:active.script_text,quote:d.quote};
 const s=d.quote?.summary||{};
 await savePatch({},'Lumean предпросмотр без списаний: '+(s.total_price_units??'?')+' токенов');
 alert('Lumean: '+(s.total_price_units??'?')+' токенов по предпросмотру. Статус: '+(d.status||'ready')+'. Это не денежная сумма. Заказ не создан.');
}
async function createVoice(){
 if(!active?.script_text?.trim())throw Error('Нет текста сценария');
 if(!latestQuote||latestQuote.projectId!==active.id||latestQuote.text!==active.script_text)throw Error('Сначала нажми «Расчёт Lumean» для текущего текста');
 if(latestQuote.quote?.status==='processing')throw Error('Lumean ещё считает стоимость; повтори предварительный расчёт');
 const sum=latestQuote.quote?.summary||{};
 if(sum.caps_ok===false)throw Error('Лимиты текста Lumean превышены');
 if(!confirm('СОЗДАТЬ ПЛАТНЫЙ ЗАКАЗ Lumean? Предпросмотр: '+(sum.total_price_units??'?')+' токенов. Эта операция может списать баланс.'))return;
 const d=await api('/api/voice',{action:'create',text:active.script_text,name:active.topic,confirm:'CONFIRM_PAID_ORDER'});
 const jobs=[...(active.jobs||[]),{type:'lumean',id:d.order.id,status:d.order.status,created_at:now()}];
 await savePatch({jobs,status:'voicing'},'Lumean заказ создан: '+d.order.id);
 notify('Заказ создан. Дальше проверяй его статус.');
}
async function pollVoice(){
 const jobs=(active?.jobs||[]),i=jobs.findLastIndex(x=>x.type==='lumean');if(i<0)throw Error('Заказ Lumean ещё не создавался');
 const d=await api('/api/voice?order='+encodeURIComponent(jobs[i].id),null,'GET');
 const next=jobs.map((x,j)=>i===j?{...x,...d.order,updated_at:now()}:x);
 await savePatch({jobs:next},'Проверен Lumean: '+d.order.status+' · '+(d.order.progress_percent??0)+'%');
}
async function makeImage(){
 if(!active)throw Error('Сначала выбери проект');
 if(!health?.images?.ready)throw Error('Для изображений нужен FAL_KEY в Vercel');
 const p=prompt('Промпт изображения (желательно на английском)','Cinematic documentary still, dramatic lighting, realistic ocean ship, 16:9');
 if(!p)return;if(!confirm('Сгенерировать один ПЛАТНЫЙ AI-кадр через FLUX?'))return;
 const d=await api('/api/image',{prompt:p,confirm:'CONFIRM_PAID_IMAGE'});
 const jobs=[...(active.jobs||[]),{type:'image',id:d.request_id,prompt:p,status:d.status,created_at:now()}];
 await savePatch({jobs,status:'visuals'},'FLUX кадр отправлен: '+d.request_id+'; итог пока не готов');
 notify('Создан запрос изображения. Нажми «Проверить кадр».');
}
async function pollImage(){
 const jobs=active?.jobs||[],i=jobs.findLastIndex(x=>x.type==='image'&&x.status!=='COMPLETED');if(i<0)throw Error('Нет ожидающих изображений');
 const d=await api('/api/image?id='+encodeURIComponent(jobs[i].id),null,'GET');
 const next=jobs.map((x,j)=>j===i?{...x,status:d.status,updated_at:now()}:x);
 const patch={jobs:next};if(d.status==='COMPLETED'&&d.image?.url){patch.assets=[...(active.assets||[]),{url:d.image.url,prompt:jobs[i].prompt,created_at:now(),request_id:jobs[i].id}];}
 await savePatch(patch,'FLUX: '+d.status+(d.image?' · кадр доступен для скачивания':''));
 if(d.image?.url){const a=document.createElement('a');a.href=d.image.url;a.target='_blank';a.rel='noopener noreferrer';a.click();notify('Кадр готов. Сохрани изображение: ссылка провайдера не вечная.');}
}
function editor(type){
 if(!active)throw Error('Выбери проект');
 $('editorTitle').textContent=({'script':'Текст сценария','outline':'План сценария','seo':'SEO для YouTube','scenes':'Раскадровка','schedule':'Дата публикации'})[type]||'Редактор';
 $('editorTextarea').style.display=type==='schedule'?'none':'block';$('editorDate').style.display=type==='schedule'?'block':'none';
 $('editorTextarea').value=type==='script'?active.script_text:type==='outline'?active.outline:type==='seo'?(active.seo?.raw||''):(active.scenes?.[0]?.text||'');
 $('editorDate').value=active.scheduled_at?active.scheduled_at.slice(0,16):'';
 $('editorSave').onclick=async()=>{
  let patch={};if(type==='script')patch.script_text=$('editorTextarea').value;
  if(type==='outline')patch.outline=$('editorTextarea').value;
  if(type==='seo')patch.seo={raw:$('editorTextarea').value};
  if(type==='scenes')patch.scenes=[{text:$('editorTextarea').value,created_at:now()}];
  if(type==='schedule')patch.scheduled_at=$('editorDate').value?new Date($('editorDate').value).toISOString():null;
  try{await savePatch(patch,'Сохранено: '+type);$('studioEditor').classList.remove('show');notify('Изменения сохранены')}catch(e){notify(e.message,true)}
 };
 $('studioEditor').classList.add('show');
}
$('editorClose').onclick=()=>$('studioEditor').classList.remove('show');
$('studioEditor').addEventListener('click',e=>{if(e.target===$('studioEditor'))$('studioEditor').classList.remove('show')});
function downloadManifest(){
 if(!active)throw Error('Проект не выбран');
 const p=active;
 const manifest={schema_version:'vyron-studio-0.2',project_id:p.id,channel:p.channel,topic:p.topic,created_at:p.created_at,duration_seconds:p.duration_minutes*60,visual_every_seconds:p.visual_every_seconds,mode:p.mode,preset:p.preset,quality:p.quality,outline:p.outline,narration_text:p.script_text,seo:p.seo,scene_plan:p.scenes,visuals:p.assets,voice_orders:(p.jobs||[]).filter(x=>x.type==='lumean'),status:p.status,render_engine:'ENDLUME (not connected)',publication:'manual_review_required'};
 const a=document.createElement('a'),blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'});a.href=URL.createObjectURL(blob);a.download='vyron-studio-'+p.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);notify('Манифест скачан. Он не является готовым видео.');
}
function renderQueue(){const t=$('queuePreview');t.innerHTML='';const jobs=projects.filter(x=>!['finished','error'].includes(x.status)).slice(0,8);if(!jobs.length){t.textContent='Нет проектов в работе';return}jobs.forEach(p=>{const b=makeBtn(p.topic+' · '+p.status,()=>{active=p;renderProject();page('scenarios')});t.append(b)})}
function renderArchive(){const t=$('archiveItems');t.innerHTML='';$('archiveCount').textContent=projects.length;if(!projects.length){t.textContent=connected?'Проектов пока нет':'База Supabase пока не подключена';return}
 projects.forEach(p=>{const box=h('div',{class:'studioStage'});box.append(h('h3',{},p.topic),h('p',{},p.channel+' · '+(p.project_date||'')+' · '+p.status+' · '+new Date(p.updated_at).toLocaleString('ru-RU')));box.append(makeBtn('Открыть',()=>{active=p;renderProject();page('scenarios')},true));box.append(makeBtn('Экспорт JSON',()=>{active=p;downloadManifest()}));box.append(makeBtn('Удалить',async()=>{if(!confirm('Удалить проект навсегда? '+p.topic))return;if(!connected){projects=projects.filter(x=>x.id!==p.id);localSave();if(active?.id===p.id)active=null;renderEverything();}else{const {error}=await db.from('studio_v2_projects').delete().eq('id',p.id);if(error)throw error;if(active?.id===p.id)active=null;await load()}notify('Проект удалён') }));t.append(box)})}
$('clearArchive').textContent='Обновить';$('clearArchive').onclick=load;
function renderAnalytics(){$('statProjects').textContent=String(projects.length);$('statDone').textContent=String(projects.filter(x=>x.status==='finished').length);
 document.querySelectorAll('#analytics .summary-grid .stat-card')[2].querySelector('b').textContent=String(projects.reduce((n,p)=>n+(p.usage||[]).length,0));
 document.querySelectorAll('#analytics .summary-grid .stat-card')[2].querySelector('span').textContent='AI-вызовов';document.querySelectorAll('#analytics .summary-grid .stat-card')[2].querySelector('small').textContent='Суммы не подменяются оценками';
 document.querySelectorAll('#analytics .summary-grid .stat-card')[3].querySelector('b').textContent=String(channels.length);}
function renderExpenses(){
 const cards=document.querySelectorAll('#expenses .summary-grid .stat-card');
 cards[0].querySelector('span').textContent='Успешные AI-вызовы';cards[0].querySelector('b').textContent=String(projects.reduce((a,p)=>a+(p.usage||[]).length,0));cards[0].querySelector('small').textContent='Токены провайдера в проектах';
 cards[1].querySelector('span').textContent='Заказов Lumean';cards[1].querySelector('b').textContent=String(projects.reduce((a,p)=>a+(p.jobs||[]).filter(x=>x.type==='lumean').length,0));
 cards[2].querySelector('span').textContent='Запросов FLUX';cards[2].querySelector('b').textContent=String(projects.reduce((a,p)=>a+(p.jobs||[]).filter(x=>x.type==='image').length,0));cards[2].querySelector('small').textContent='Реальные запросы; цену см. у провайдера';
 cards[3].querySelector('span').textContent='Достоверный итог списаний';cards[3].querySelector('b').textContent='—';cards[3].querySelector('small').textContent='Пока нет биллингового API';}
function renderChannels(){
 const t=$('channelsList');t.innerHTML='';
 const b=makeBtn('＋ Добавить канал',async()=>{const name=prompt('Название YouTube-канала');if(!name||!name.trim())return;if(!connected){channels.push({id:crypto.randomUUID(),owner_id:user.id,name:name.trim()});localSave();renderEverything()}else{const {error}=await db.from('studio_v2_channels').insert({owner_id:user.id,name:name.trim()});if(error)throw error;await load()}notify('Канал сохранён')},true);t.append(b);
 channels.forEach(c=>{const x=h('div',{class:'list-item'});x.append(h('strong',{},c.name),makeBtn('Удалить',async()=>{if(!confirm('Удалить канал из каталога?'))return;if(!connected){channels=channels.filter(x=>x.id!==c.id);localSave();renderEverything()}else{const {error}=await db.from('studio_v2_channels').delete().eq('id',c.id);if(error)throw error;await load()}}));t.append(x)});
 $('otherChannel').innerHTML='<option value="">Другие каналы</option>';
 channels.forEach(c=>{$('otherChannel').append(new Option(c.name,c.name))});
}
function renderCalendar(){const sec=$('calendar'),box=sec.querySelector('.card');const old=box.querySelector('#studioEvents');if(old)old.remove();const t=h('div',{id:'studioEvents'});projects.filter(p=>p.scheduled_at).sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at)).forEach(p=>t.append(h('div',{class:'list-item'},new Date(p.scheduled_at).toLocaleString('ru-RU')+' · '+p.channel+' · '+p.topic)));box.append(t)}
function renderSettings(){
 const card=document.querySelector('#settings .card');if(!card)return;
 let status=$('realConnections');if(!status){status=h('div',{id:'realConnections'});card.append(status)}
 const vals=[['Supabase · '+(connected?'облако':'локальный режим'),connected],['Текстовая AI-модель',!!health?.ai?.ready],['Lumean',!!health?.lumean?.ready],['FLUX',!!health?.images?.ready],['VYRON · синхронизация',channels.some(c=>!!c.vyron_channel_id)],['Mac · '+(macOnline()?.device_name||'офлайн'),!!macOnline()],['Очередь Mac (SQL 002)',macSchemaAvailable],['ENDLUME · '+(macOnline()?'работает':'офлайн'),!!macOnline()]];
 
status.innerHTML=vals.map(x=>'<div class="list-item"><strong>'+esc(x[0])+'</strong><span class="studioPill">'+(x[1]?'Подключено':'Не подключено')+'</span></div>').join('');
let toolsBox=$('studioManage');if(toolsBox)toolsBox.remove();
toolsBox=h('div',{id:'studioManage'});toolsBox.style.marginTop='18px';
toolsBox.append(makeBtn('Скачать резервную копию',async()=>{
 const backup={version:2,exported_at:now(),storage:connected?'supabase':'local',projects,channels};
 const a=h('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));a.download='vyron-studio-backup-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}));
const local=localGet();
if(connected&&(local.projects||[]).length){
 toolsBox.append(makeBtn('Перенести '+local.projects.length+' локальных проектов в облако',async()=>{
  if(!confirm('Перенести локальные проекты в Supabase? Оригиналы в браузере останутся до подтверждения.'))return;
  const keys=['channel','topic','project_date','duration_minutes','visual_every_seconds','mode','preset','voice','quality','status','current_stage','outline','script_text','seo','scenes','assets','jobs','usage','logs','scheduled_at'];
  const batch=local.projects.map(p=>{const obj={owner_id:user.id};keys.forEach(k=>{if(p[k]!==undefined)obj[k]=p[k]});return obj});
  const {data,error}=await db.from('studio_v2_projects').insert(batch).select('id');
  if(error)throw error;
  localStorage.removeItem(LOCAL_KEY);notify('Перенесено в облако '+data.length+' проектов');await load();
 },true));
}
if(macSchemaAvailable){
  toolsBox.append(makeBtn('Обновить Mac и очередь',()=>refreshMac(true),true));
  const summary=h('p',{},macOnline()
   ? ('Mac онлайн: '+macOnline().device_name+' · ENDLUME активен. Каналов VYRON: '+macOnline().vyron_channels)
   : 'Mac / ENDLUME офлайн. Агент проверяется по heartbeat, а не по наличию папки.');
  toolsBox.append(summary);
}else toolsBox.append(h('p',{},'Облачный мост не настроен: необходимо выполнить SQL 002_mac_queue.sql.'));
status.append(toolsBox);
}
function renderEverything(){renderProject();renderQueue();renderAnalytics();renderArchive();renderExpenses();renderChannels();renderCalendar();renderSettings();}
$('stopBtn').style.display='none';$('logsBtn').onclick=()=>$('journal').classList.toggle('open');
$('queuePreview').textContent='Загрузка…';
document.querySelector('.card .notice').textContent='Сайт хранит данные проектов в Supabase после настройки таблиц. AI, Lumean и FLUX вызываются только явно по кнопке. VYRON и ENDLUME пока без локального агента.';
document.querySelector('#expenses .card .section-title').textContent='Реальные данные из истории API';
const mark=document.createElement('div');mark.id='studioStatusLine';mark.textContent='Подключаем базу...';$('scenarios').insertBefore(mark,$('scenarios').children[1]);
const actionBar=document.createElement('div');actionBar.id='studioStageActions';$('stages').after(actionBar);
const activeLine=document.createElement('div');activeLine.id='studioActiveLine';$('runState').after(activeLine);

$('scriptCount').textContent=String(count);renderRows();
window.studioReload=load;
renderEverything();await boot();
setInterval(()=>{if(user&&connected)refreshMac(true).catch(()=>{});},20000);