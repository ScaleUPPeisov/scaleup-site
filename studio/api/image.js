import {ownerAuth,readBody,json,safeError} from './_shared.js';
export const maxDuration=45;
const BASE='https://queue.fal.run/fal-ai/flux-1/schnell';
async function upstream(path,method='GET',body){
 const r=await fetch(BASE+path,{method,headers:{'Authorization':'Key '+process.env.FAL_KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(36000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error('fal API '+r.status+': '+String(d.detail||d.error||'ошибка провайдера').slice(0,220)),{http:502});
 return d;
}
export async function POST(request){
 try{
  await ownerAuth(request);
  if(!process.env.FAL_KEY)return json({ok:false,error:'FAL_KEY не настроен в Environment Variables',code:'FAL_NOT_CONFIGURED'},503);
  const b=await readBody(request,6000);
  if(b.confirm!=='CONFIRM_PAID_IMAGE')throw Object.assign(new Error('Требуется подтверждение платной генерации'),{http:400});
  const prompt=String(b.prompt||'').trim();
  if(prompt.length<8||prompt.length>2800)throw Object.assign(new Error('Промпт: от 8 до 2800 символов'),{http:400});
  const d=await upstream('','POST',{prompt,image_size:'landscape_16_9',num_inference_steps:4,num_images:1,enable_safety_checker:true,output_format:'jpeg'});
  return json({ok:true,request_id:d.request_id,status:d.status||'IN_QUEUE',provider:'fal-ai/flux-1/schnell'});
 }catch(e){return safeError(e)}
}
export async function GET(request){
 try{
  await ownerAuth(request);
  if(!process.env.FAL_KEY)return json({ok:false,error:'FAL_KEY не настроен'},503);
  const rid=new URL(request.url).searchParams.get('id')||'';
  if(!/^[a-zA-Z0-9-]{10,96}$/.test(rid))throw Object.assign(new Error('Неверный ID запроса'),{http:400});
  const s=await upstream('/requests/'+rid+'/status');
  if(s.status==='COMPLETED'){
   const d=await upstream('/requests/'+rid);
   const img=d.images?.[0];
   if(!img?.url)return json({ok:false,error:'Генерация завершилась без изображения'},502);
   return json({ok:true,status:'COMPLETED',image:{url:img.url,width:img.width,height:img.height},seed:d.seed});
  }
  return json({ok:true,status:s.status||'IN_QUEUE',queue_position:s.queue_position??null});
 }catch(e){return safeError(e)}
}
