export const SUPABASE_URL = 'https://odlseljmogaguyqdlkyv.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zKjzhQTdTG8f9BfR2X5NVg_zQgjo70f';
export const json = (data, status=200) => new Response(JSON.stringify(data), {
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
export function errText(e){return String(e?.message||e||'Unknown error').slice(0,500)}
export async function ownerAuth(request) {
  const origin=request.headers.get('origin');
  const host=request.headers.get('host');
  if(request.method!=='GET' && (!host || !origin || new URL(origin).host!==host)) throw Object.assign(new Error('Запрос из другого источника отклонён'),{http:403});
  const auth=request.headers.get('authorization')||'';
  if(!/^Bearer [a-zA-Z0-9._-]+$/.test(auth)) throw Object.assign(new Error('Не выполнен вход Supabase'),{http:401});
  const res=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{
    apikey:SUPABASE_PUBLISHABLE_KEY,authorization:auth
  },signal:AbortSignal.timeout(12000)});
  if(!res.ok) throw Object.assign(new Error('Авторизация истекла: войди ещё раз'),{http:401});
  const u=await res.json();if(!u?.id)throw Object.assign(new Error('Недействительная сессия'),{http:401});
  return u;
}
export async function readBody(request,max=25000){
  const cl=Number(request.headers.get('content-length')||0);
  if(cl>max)throw Object.assign(new Error('Слишком большой запрос'),{http:413});
  const txt=await request.text();
  if(txt.length>max)throw Object.assign(new Error('Слишком большой запрос'),{http:413});
  try {return JSON.parse(txt)} catch {throw Object.assign(new Error('Неверный JSON'),{http:400})}
}
export function safeError(e){
  const code=e?.http||500;
  return json({ok:false,error:code===500?'Внутренняя ошибка, проверь журнал провайдера':errText(e),code},code)
}
