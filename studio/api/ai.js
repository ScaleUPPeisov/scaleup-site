import {ownerAuth,readBody,json,safeError} from './_shared.js';
export const maxDuration=60;
const SYSTEM='Ты редактор документальных, образовательных и музыкальных YouTube-видео. Пиши оригинальный русский материал, без копирования, с чёткой структурой. Никогда не заявляй, что проверил факты в интернете, если источники не были предоставлены. Спорные утверждения помечай как требующие проверки. Укажи где нужны иллюстрации; не используй чужие тексты дословно.';
const clean=(v,max=15000)=>String(v??'').slice(0,max).trim();
function makePrompt(b){
 const topic=clean(b.topic,280), channel=clean(b.channel,150);
 const minutes=Math.min(240,Math.max(1,Number(b.minutes)||30));
 const context='Канал: '+channel+'; тема: '+topic+'; желаемая продолжительность: '+minutes+' мин. Текущий материал: '+clean(b.context,10500);
 switch(b.action){
  case 'outline':return 'Создай концепцию и подробный план ролика. Дай оригинальные варианты названий, хук первых 20 секунд, 7–12 логичных глав с примерными таймкодами, перечень спорных фактов для отдельной проверки, затем сценарную структуру. '+context;
  case 'chapter':return 'Напиши ОДНУ развёрнутую главу рассказа для диктора, без формального введения и концовки. Пользовательский запрос главы: '+clean(b.chapter,300)+'; '+context;
  case 'seo':return 'Подготовь 5 названий, описание YouTube, 12 тегов и таймкоды на основании текста без обманных утверждений. '+context;
  case 'scenes':return 'Создай нумерованную раскадровку для озвученного ролика: таймкод, промпт изображения на английском, длительность и краткое содержание. Не обещай существования несуществующих архивных фотографий. '+context;
  default:throw Object.assign(new Error('Неизвестная операция'),{http:400});
 }
}
function provider(){
 const target=(process.env.AI_PROVIDER||'auto').toLowerCase();
 if((target==='auto'||target==='gemini')&&process.env.GEMINI_API_KEY)return 'gemini';
 if((target==='auto'||target==='anthropic')&&process.env.ANTHROPIC_API_KEY)return 'anthropic';
 if((target==='auto'||target==='openai')&&process.env.OPENAI_API_KEY)return 'openai';
 return null;
}
async function requestJson(url,opts){
 const res=await fetch(url,{...opts,signal:AbortSignal.timeout(48000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Object.assign(new Error('AI API '+res.status+': '+JSON.stringify(data?.error?.message||data?.error||'ошибка провайдера').slice(0,350)),{http:502});
 return data;
}
export async function POST(request){
 try{
  await ownerAuth(request);
  const b=await readBody(request,20000);
  if(!clean(b.topic,280))throw Object.assign(new Error('Введите тему ролика'),{http:400});
  const prompt=makePrompt(b), engine=provider();
  if(!engine)return json({ok:false,error:'Не настроен ключ AI. Добавь GEMINI_API_KEY, ANTHROPIC_API_KEY или OPENAI_API_KEY в Vercel → Environment Variables.',code:'AI_NOT_CONFIGURED'},503);
  let d,content='',usage={},model='';
  if(engine==='gemini'){
   model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
   d=await requestJson('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},
    body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:.45,maxOutputTokens:5500}})
   });
   content=(d.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('\n');
   usage=d.usageMetadata||{};
  }else if(engine==='anthropic'){
   model=process.env.ANTHROPIC_MODEL||'claude-sonnet-4-5';
   d=await requestJson('https://api.anthropic.com/v1/messages',{
    method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model,max_tokens:4500,system:SYSTEM,messages:[{role:'user',content:prompt}]})
   });
   content=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');usage=d.usage||{};
  }else{
   model=process.env.OPENAI_MODEL||'gpt-4.1-mini';
   d=await requestJson('https://api.openai.com/v1/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENAI_API_KEY},
    body:JSON.stringify({model,messages:[{role:'system',content:SYSTEM},{role:'user',content:prompt}],max_completion_tokens:4500})
   });
   content=d.choices?.[0]?.message?.content||'';usage=d.usage||{};
  }
  if(!content.trim())return json({ok:false,error:'Провайдер не вернул текст',code:'EMPTY_OUTPUT'},502);
  return json({ok:true,provider:engine,model,text:content,usage,generated_at:new Date().toISOString()});
 }catch(e){return safeError(e)}
}
