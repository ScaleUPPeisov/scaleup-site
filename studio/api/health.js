import {ownerAuth,json,safeError} from './_shared.js';
export async function GET(request){
 try{
  await ownerAuth(request);
  const out={
   ok:true,version:'0.2.0',
   ai:{ready:!!(process.env.GEMINI_API_KEY||process.env.ANTHROPIC_API_KEY||process.env.OPENAI_API_KEY),
       selected:process.env.AI_PROVIDER||'auto'},
   lumean:{ready:!!(process.env.LUMEAN_API_KEY&&process.env.LUMEAN_TEMPLATE_ID)},
   images:{ready:!!process.env.FAL_KEY},
   macAgent:{ready:false,reason:'Локальный исполнитель ещё не зарегистрирован'},
   cloudStorage:{ready:false,reason:'SQL-таблицы в Supabase проверяются браузером пользователя'},
   updated_at:new Date().toISOString()
  };
  return json(out);
 }catch(e){return safeError(e)}
}
