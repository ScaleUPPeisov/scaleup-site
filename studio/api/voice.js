import {ownerAuth,readBody,json,safeError} from '../lib/shared.js';
export const maxDuration=60;
const BASE='https://api.lumean.app/api/public';
const key=()=>process.env.LUMEAN_API_KEY;
const tid=()=>process.env.LUMEAN_TEMPLATE_ID;
const headers=()=>({'Content-Type':'application/json','Accept':'application/json','X-API-KEY':key()});
function check(){if(!key()||!tid())throw Object.assign(new Error('Lumean не настроен: нужны LUMEAN_API_KEY и LUMEAN_TEMPLATE_ID'),{http:503})}
async function call(path,method='GET',body){
 const r=await fetch(BASE+path,{method,headers:headers(),body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error('Lumean HTTP '+r.status+': '+String(d.message||d.reason||d.error||'ошибка').slice(0,280)),{http:r.status===402?402:502});
 return d;
}
export async function GET(request){
 try{
  await ownerAuth(request);check();
  const url=new URL(request.url),order=url.searchParams.get('order')||'';
  if(!/^[a-f0-9-]{36}$/i.test(order))throw Object.assign(new Error('Неверный ID заказа'),{http:400});
  const d=await call('/orders/'+order);
  const o=d.data||{};
  return json({ok:true,order:{id:o.id,status:o.status,progress_percent:o.progress_percent,total_tokens:o.total_tokens,total_duration_ms:o.total_duration_ms,stitching:o.stitching,files:o.result?.files||[]},raw_status:d.message||null});
 }catch(e){return safeError(e)}
}
export async function POST(request){
 try{
  await ownerAuth(request);check();
  const b=await readBody(request,180000),action=b.action;
  const txt=String(b.text||'').trim();
  if(!txt||txt.length>150000)throw Object.assign(new Error('Текст должен содержать 1–150 000 символов'),{http:400});
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if(!uuid.test(tid()))throw Object.assign(new Error('Неверный LUMEAN_TEMPLATE_ID'),{http:503});
  if(action==='quote'){
   const d=await call('/orders/chunks/preview','POST',{template_id:tid(),input_text:txt});
   return json({ok:true,quote:d.data||{},status:d.data?.status||'ready'});
  }
  if(action==='create'){
   if(b.confirm!=='CONFIRM_PAID_ORDER')throw Object.assign(new Error('Требуется подтверждение платного заказа'),{http:400});
   const d=await call('/orders','POST',{template_id:tid(),input_text:txt,name:String(b.name||'VYRON AI STUDIO').slice(0,110)});
   return json({ok:true,order:{id:d.data?.id,status:d.data?.status||'created',total_tokens:d.data?.total_tokens||0}});
  }
  throw Object.assign(new Error('Неизвестная операция'),{http:400});
 }catch(e){return safeError(e)}
}
