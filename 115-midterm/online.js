const CFG=window.CORRECTION_CONFIG;
const IS_TEACHER=new URLSearchParams(location.search).has('teacher');
const DRAFTS='nature115-drafts-v2';
let identity=null,teacherData={classes:[],submissions:[]},session=null,requestSeq=0,classesConfig=[],lastSubmission=null;
const $=id=>document.getElementById(id);
function note(text,error=false){$('onlineNotice').textContent=text;$('onlineNotice').className=error?'notice error':'notice';}
async function api(action,body,token,query=''){
 let res;try{res=await fetch(CFG.endpoint+'?action='+action+query,{method:body===undefined?'GET':'POST',headers:{apikey:CFG.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch(e){throw new Error('連線逾時或網路中斷，尚未完成操作，請稍後重試。');}
 const data=await res.json().catch(()=>({error:'連線回應異常，請稍後重試。'}));if(!res.ok)throw Object.assign(new Error(data.error||'連線失敗。'),{status:res.status});return data;
}
function readDrafts(){try{return JSON.parse(localStorage.getItem(DRAFTS)||'{}');}catch(e){return {};}}
function saveDraft(){if(!identity)return;const all=readDrafts();all[identity.class_name+'|'+identity.seat]={identity,states:state,lastSubmission};try{localStorage.setItem(DRAFTS,JSON.stringify(all));}catch(e){note('這個瀏覽器無法儲存進度，請不要關閉頁面，完成後立即繳交。',true);}}
function renderBubbles(){QS.forEach(q=>updateBubble(q.id));updateProgress();}
function startStudent(){
 const cls=$('studentClass').value.trim(),seat=Number($('studentSeat').value),name=$('studentName').value.trim();
 const c=classesConfig.find(c=>c.class_name===cls);
 if(!c||!c.seats.includes(seat)||!name||name.length>30){note('請選班級、填寫有效座號和姓名，再開始訂正。',true);return;}
 const saved=readDrafts()[cls+'|'+seat];
 if(saved&&saved.identity.student_name!==name){note('這個座號已有另一個姓名的本機紀錄，請先確認姓名與座號。',true);return;}
 const token=saved?.identity.owner_token||Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 identity={class_name:cls,seat,student_name:name,owner_token:token};state=saved?.states||{};lastSubmission=saved?.lastSubmission||null;
 for(const id of ['studentClass','studentSeat','studentName'])$(id).disabled=true;
 $('reloadClasses').disabled=true;$('startStudent').hidden=true;$('switchStudent').hidden=false;$('studentWork').hidden=false;$('submitWork').disabled=false;
 renderBubbles();note(lastSubmission?'已載入本機紀錄。若有修改，請再按一次「繳交訂正」。':'已開始訂正。每題都可標記綠、橘或紅；還不懂的題目請標紅色。');saveDraft();
}
function switchStudent(){saveDraft();identity=null;state={};lastSubmission=null;for(const id of ['studentClass','studentSeat','studentName'])$(id).disabled=false;$('studentName').value='';$('studentSeat').value='';$('reloadClasses').disabled=false;$('startStudent').hidden=false;$('switchStudent').hidden=true;$('studentWork').hidden=true;$('submitWork').disabled=true;note('已保留上一位學生的本機進度，請輸入下一位學生資料。');}
async function submitWork(){
 if(!identity)return;const count=CorrectionMonitor.ratedCount(state);if(count!==QS.length){note('還有 '+(QS.length-count)+' 個項目未標記。還不懂也可以選紅色，再一起繳交。',true);return;}
 $('submitWork').disabled=true;const snap=JSON.parse(JSON.stringify(state));note('正在繳交，請稍候……');
 try{const data=await api('submit',{...identity,states:snap});lastSubmission={time:data.submitted_at,states:JSON.stringify(snap)};saveDraft();note('已成功繳交給老師，時間：'+new Date(data.submitted_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'。之後修改標記，請再次繳交。');}
 catch(e){note(e.message||'網路暫時中斷，尚未繳交成功，進度仍保留在這個瀏覽器。',true);}finally{$('submitWork').disabled=false;}
}
async function studentInit(){
 $('startStudent').onclick=startStudent;$('switchStudent').onclick=switchStudent;$('submitWork').onclick=submitWork;
 $('reloadClasses').onclick=loadClasses;await loadClasses();
}
async function loadClasses(){try{const data=await api('config');classesConfig=data.classes;$('studentClass').replaceChildren(new Option('請選擇班級',''));for(const c of data.classes)$('studentClass').add(new Option(c.class_name,c.class_name));note(data.classes.length?'請先填寫班級、座號與姓名。':'老師正在設定班級，請稍後按「重新載入班級」。');}catch(e){note('目前無法讀取班級，請檢查網路後重新載入。',true);}}
function teacherNotice(text,error=false){$('teacherNotice').textContent=text;$('teacherNotice').className=error?'notice error':'notice';}
function setSession(data){session=data;sessionStorage.setItem('nature115-teacher',JSON.stringify(data));}
async function login(mode){
 const email=$('teacherEmail').value.trim(),password=$('teacherPassword').value;
 if(!email||password.length<8){teacherNotice('請填寫教師 Email 與至少 8 碼密碼。',true);return;}
 $('teacherLogin').disabled=true;$('teacherSignup').disabled=true;
 try{
 const url=CFG.url+'/auth/v1/'+(mode==='signup'?'signup':'token?grant_type=password');
 const r=await fetch(url,{method:'POST',headers:{apikey:CFG.key,'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(20000)});const data=await r.json();
 if(!r.ok)throw new Error(mode==='signup'?'無法註冊，請確認 Email 與密碼，或稍後再試。':'登入失敗，請確認帳號、密碼及信箱驗證。');
 $('teacherPassword').value='';
 if(!data.access_token){teacherNotice('已提出註冊申請，請到信箱完成驗證後，回到這一頁登入。');return;}
 setSession(data);await refreshDashboard();
 }catch(e){teacherNotice(e.message||'登入連線失敗。',true);}finally{$('teacherLogin').disabled=false;$('teacherSignup').disabled=false;}
}
async function ensureToken(){
 if(!session)throw new Error('請先登入教師帳號。');
 if(session.expires_at&&session.expires_at*1000<Date.now()+60000){
 const r=await fetch(CFG.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:CFG.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});const d=await r.json();if(!r.ok){session=null;sessionStorage.removeItem('nature115-teacher');throw new Error('登入已過期，請重新登入。');}setSession(d);
 }return session.access_token;
}
async function logout(){if(session){try{await fetch(CFG.url+'/auth/v1/logout',{method:'POST',headers:{apikey:CFG.key,Authorization:'Bearer '+session.access_token}});}catch(e){}}
 session=null;sessionStorage.removeItem('nature115-teacher');teacherData={classes:[],submissions:[]};$('teacherPanel').hidden=true;$('teacherAuth').hidden=false;$('studentRows').replaceChildren();$('redQuestions').replaceChildren();teacherNotice('已登出。');}
async function refreshDashboard(){
 const seq=++requestSeq;try{teacherNotice('正在讀取繳交紀錄……');const token=await ensureToken();const data=await api('dashboard',undefined,token);if(seq!==requestSeq||!session)return;teacherData=data;
 $('teacherAuth').hidden=true;$('teacherPanel').hidden=false;
 const selected=$('classFilter').value||new URLSearchParams(location.search).get('class')||'';
 $('classFilter').replaceChildren(new Option('全部班級',''));for(const c of data.classes)$('classFilter').add(new Option(c.class_name,c.class_name));$('classFilter').value=data.classes.some(c=>c.class_name===selected)?selected:'';
 renderDashboard();teacherNotice('已更新：'+new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei'})+'；每 20 秒自動更新。');
 }catch(e){teacherNotice(e.message||'讀取失敗，請重新整理。',true);if(e.status===401||e.status===403){$('teacherPanel').hidden=true;$('teacherAuth').hidden=false;}}
}
function labelQ(q){return q.label+'第 '+q.num+' 題';}
function questionButton(id,text){const q=QS.find(q=>q.id===id);const b=document.createElement('button');b.className='question-link';b.textContent=text||labelQ(q);b.onclick=()=>openModal(id);return b;}
function td(text){const c=document.createElement('td');c.textContent=text;return c;}
function renderDashboard(){
 const selected=$('classFilter').value;const report=CorrectionMonitor.buildReport(teacherData.classes,teacherData.submissions,selected);
 $('teacherSummary').textContent='應繳 '+report.rows.length+' 人　已繳 '+report.submitted.length+' 人　未繳 '+report.missing+' 人　紅色題目 '+report.reds.size+' 題';
 const filter=$('submissionFilter').value;const search=$('studentSearch').value.trim();$('studentRows').replaceChildren();
 for(const row of report.rows){const s=row.submission;if(filter==='submitted'&&!s||filter==='missing'&&s||filter==='red'&&(!s||!Object.values(s.states).includes('no')))continue;if(search&&!((s?.student_name||'')+' '+row.seat).includes(search))continue;
 const tr=document.createElement('tr');tr.append(td(row.class_name),td(row.seat),td(s?.student_name||'尚未提供'),td(s?'已繳交':'未繳交'),td(s?new Date(s.submitted_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'—'));
 const counts=td(s?'綠 '+Object.values(s.states).filter(x=>x==='ok').length+'／橘 '+Object.values(s.states).filter(x=>x==='partial').length+'／紅 '+Object.values(s.states).filter(x=>x==='no').length:'—');tr.append(counts);
 const cell=document.createElement('td');if(s){for(const q of QS.filter(q=>s.states[q.id]==='no'))cell.append(questionButton(q.id));if(!cell.children.length)cell.textContent='無紅色題目';}else cell.textContent='—';tr.append(cell);$('studentRows').append(tr);
 }
 $('redQuestions').replaceChildren();const sorted=[...report.reds].sort((a,b)=>b[1].length-a[1].length||QS.findIndex(q=>q.id===a[0])-QS.findIndex(q=>q.id===b[0]));
 if(!sorted.length)$('redQuestions').textContent=report.submitted.length?'目前沒有學生將題目標紅。':'尚未收到繳交紀錄。';
 for(const [id,students] of sorted){const q=QS.find(q=>q.id===id);if(!q)continue;const card=document.createElement('article');card.className='red-card';const h=document.createElement('h3');h.append(questionButton(id,labelQ(q)+'｜'+students.length+' 人還不懂'));const p=document.createElement('p');p.textContent=q.q;const names=document.createElement('p');names.className='red-names';names.textContent=students.map(s=>s.class_name+' '+s.seat+' 號 '+s.name).join('、');card.append(h,p,names);$('redQuestions').append(card);}
 const u=new URL(location.href);if(selected)u.searchParams.set('class',selected);else u.searchParams.delete('class');history.replaceState(null,'',u);
 $('classPageLink').href=u.href;$('classPageLink').textContent=selected?'開啟 '+selected+' 監控頁面':'開啟全部班級監控頁面';
}
async function saveClass(){
 const cls=$('newClassName').value.trim(),start=Number($('seatStart').value),end=Number($('seatEnd').value);const omit=$('seatOmit').value.split(/[，,、\s]+/).filter(Boolean).map(Number);
 if(!cls||!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>99||start>end){teacherNotice('請填寫班級與 1～99 之間的座號範圍。',true);return;}
 const seats=Array.from({length:end-start+1},(_,i)=>start+i).filter(n=>!omit.includes(n));
 try{await api('class',{class_name:cls,seats},await ensureToken());await refreshDashboard();teacherNotice(cls+' 班級已儲存，學生可重新載入班級後開始。');}catch(e){teacherNotice(e.message,true);}
}
async function teacherInit(){
 $('studentHeader').hidden=true;$('studentWork').hidden=true;$('studentTools').hidden=true;$('submitWork').hidden=true;$('onlineNotice').hidden=true;$('teacherView').hidden=false;
 $('teacherSignup').onclick=()=>login('signup');$('teacherLogout').onclick=logout;$('refreshDashboard').onclick=refreshDashboard;$('saveClass').onclick=saveClass;
 for(const id of ['classFilter','submissionFilter'])$(id).onchange=renderDashboard;$('studentSearch').oninput=renderDashboard;
 try{session=JSON.parse(sessionStorage.getItem('nature115-teacher')||'null');}catch(e){}if(session)await refreshDashboard();
 setInterval(()=>{if(session&&!document.hidden)refreshDashboard();},20000);
}
