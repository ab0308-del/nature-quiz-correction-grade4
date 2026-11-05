// Supabase Edge Function: nature-correction. Server secrets are supplied by Supabase.
const ROOT=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const origins=new Set(['https://ab0308-del.github.io','http://127.0.0.1:8767','http://127.0.0.1:8768']);
const IDS=[...Array.from({length:10},(_,i)=>`tf_${i}`),...Array.from({length:20},(_,i)=>`mc_${i}`),...Array.from({length:3},(_,i)=>`check_${i}`),...Array.from({length:15},(_,i)=>`fill_${i}`),...Array.from({length:5},(_,i)=>`reading_${i}`)];
class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
async function db(path:string,method='GET',body?:unknown,prefer='return=representation'){
 const r=await fetch(`${ROOT}/rest/v1/${path}`,{method,headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>null);if(!r.ok)throw new ApiError(500,'資料儲存暫時失敗，請稍後重試。');return data;
}
async function teacher(req:Request){
 const a=req.headers.get('Authorization')||'';
 if(!a.startsWith('Bearer '))throw new ApiError(401,'請先登入教師帳號。');
 const r=await fetch(`${ROOT}/auth/v1/user`,{headers:{apikey:SERVICE,Authorization:a}});
 if(!r.ok)throw new ApiError(401,'登入已過期，請重新登入。');
 const user=await r.json();if(!user.email||!user.email_confirmed_at)throw new ApiError(403,'請先完成教師信箱驗證。');
 const rows=await db(`nature_correction_teachers?email=eq.${encodeURIComponent(user.email.toLowerCase())}&select=email`);
 if(!rows.length)throw new ApiError(403,'這個帳號尚未取得教師權限。');
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://ab0308-del.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.has(origin))return json({error:'不支援的網站來源。'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  const action=new URL(req.url).searchParams.get('action')||'config';
  if(action==='config'&&req.method==='GET')return json({classes:await db('nature_correction_classes?active=eq.true&select=class_name,seats&order=class_name')});
  if(action==='submit'&&req.method==='POST'){
   if(Number(req.headers.get('Content-Length'))>12000)throw new ApiError(413,'資料過大。');
   const text=await req.text();if(text.length>12000)throw new ApiError(413,'資料過大。');const b=JSON.parse(text);
   const cls=String(b.class_name||'').trim(), name=String(b.student_name||'').trim(),seat=Number(b.seat),token=String(b.owner_token||'');
   if(cls.length<1||cls.length>20||name.length<1||name.length>30||!Number.isInteger(seat)||seat<1||seat>99||!/^[a-f0-9]{64}$/.test(token))throw new ApiError(400,'請完整填寫班級、座號與姓名。');
   if(!b.states||typeof b.states!=='object'||Array.isArray(b.states)||Object.entries(b.states).some(([id,status])=>!IDS.includes(id)||!['ok','partial','no'].includes(status as string)))throw new ApiError(400,'訂正標記格式不正確，請重新載入頁面後再繳交。');
   const classes=await db(`nature_correction_classes?active=eq.true&class_name=eq.${encodeURIComponent(cls)}&select=seats`);
   if(!classes.length||!classes[0].seats.includes(seat))throw new ApiError(400,'班級或座號尚未開放，請向老師確認。');
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));const owner_hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
   const row={class_name:cls,seat,student_name:name,states:b.states,owner_hash,submitted_at:new Date().toISOString()};
   let rows=await db('nature_correction_submissions?on_conflict=class_name,seat','POST',row,'resolution=ignore-duplicates,return=representation');
   if(!rows.length)rows=await db(`nature_correction_submissions?class_name=eq.${encodeURIComponent(cls)}&seat=eq.${seat}&owner_hash=eq.${owner_hash}`,'PATCH',row);
   if(!rows.length)throw new ApiError(409,'這個班級座號已由另一個瀏覽器繳交。請使用原裝置更新，或請老師確認。');
   return json({submitted_at:rows[0].submitted_at});
  }
  if(action==='dashboard'&&req.method==='GET'){
   await teacher(req);
   const cls=new URL(req.url).searchParams.get('class');
   const filter=cls?`&class_name=eq.${encodeURIComponent(cls)}`:'';
   // Full private records are returned only after verifying teacher identity.
   const [classes,submissions]=await Promise.all([db('nature_correction_classes?active=eq.true&select=class_name,seats&order=class_name'),db('nature_correction_submissions?select=id,class_name,seat,student_name,states,submitted_at&order=class_name,seat&limit=5000'+filter)]);
   return json({classes,submissions});
  }
  if(action==='class'&&req.method==='POST'){
   await teacher(req);const b=await req.json();const name=String(b.class_name||'').trim();
   if(!name||name.length>20||!Array.isArray(b.seats)||!b.seats.length||b.seats.length>99||b.seats.some((n:unknown)=>!Number.isInteger(n)||Number(n)<1||Number(n)>99))throw new ApiError(400,'請填寫班級及有效座號範圍。');
   const seats=[...new Set(b.seats)].sort((a:any,b:any)=>a-b);
   // Prevent existing submissions from silently disappearing when a seat range is edited.
   const existing=await db(`nature_correction_submissions?class_name=eq.${encodeURIComponent(name)}&select=seat`);
   if(existing.some((x:any)=>!seats.includes(x.seat)))throw new ApiError(400,'新的座號範圍不能排除已繳交的座號。');
   await db('nature_correction_classes?on_conflict=class_name','POST',{class_name:name,seats,updated_at:new Date().toISOString()},'resolution=merge-duplicates,return=representation');return json({ok:true});
  }
  throw new ApiError(404,'找不到這項操作。');
 }catch(e){if(e instanceof ApiError)return json({error:e.message},e.status);return json({error:'無法完成操作，請稍後再試。'},400);}
});
