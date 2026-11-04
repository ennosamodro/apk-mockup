(function(){
"use strict";
const C = PAC1, M = C.modules;
const $ = (s,el=document)=>el.querySelector(s);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const fmt = (n,d=2)=> (isFinite(n)? Number(n).toLocaleString("en-US",{maximumFractionDigits:d,minimumFractionDigits:0}) : "–");
// URL web app Apps Script (Deploy > Web app). Bukan rahasia: keamanan dicek di server.
const API_URL = window.LMS_API || "https://script.google.com/macros/s/AKfycbwMtPvxUCGKa8kwHhuNq-xgWRHgfWKN8Hr0rmkAiZeHey_EoYN4MG8lYp9179z254LMxg/exec";
const LKEY = "apk-lms-pac1-v2", KKEY = "apk-lms-kode";

// ---------------- state ----------------
const S = { mode:"db", kode:null, me:null, isPT:false, canWrite:true,
  data:{ modules:{}, final:null, profile:{ role:"", start:"" } }, sign:{}, history:[],
  all:{}, allSign:{}, allHist:{}, names:{}, view:"home", mod:"m1", sub:"materi", ptSel:null, quizState:{}, exam:null, busy:false };

function blankData(){ return { modules:{}, final:null, profile:{ role:"", start:"" } }; }
function loadLocal(id){ try{ const t = localStorage.getItem(LKEY+":"+id); return t ? JSON.parse(t) : null; }catch(e){ return null; } }
function saveLocal(){ if(!S.me) return; try{ localStorage.setItem(LKEY+":"+S.me.id, JSON.stringify({ me:S.me, data:S.data, sign:S.sign, history:S.history, pending:[...dirtyMods], prof:dirtyProf })); }catch(e){} }
function md(id){ if(!S.data.modules[id]) S.data.modules[id] = { quiz:null, essays:{}, tasks:{} }; return S.data.modules[id]; }

// --------------- API (Apps Script) ---------------
async function api(action, payload, opt){
  const body = JSON.stringify(Object.assign({ action, kode:S.kode }, payload||{}));
  const r = await fetch(API_URL, Object.assign({ method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body, redirect:"follow" }, opt||{}));
  const j = await r.json();
  if(!j.ok){ if(j.error==="kode_salah" && action!=="login" && S.me) logout("Your access code is no longer valid. Please sign in again."); throw Object.assign(new Error(j.error||"gagal"), { code:j.error }); }
  return j;
}

// --------------- saving (debounced, only changed modules) ---------------
const dirtyMods = new Set(); let dirtyProf=false, writing=false, timer=null;
function persist(modId){ if(modId) dirtyMods.add(modId); saveLocal(); clearTimeout(timer); timer=setTimeout(flush,1500); setStatus("Saving…"); }
function savePayload(){
  const modules = {}; dirtyMods.forEach(id=>{ const d=S.data.modules[id]||{}; modules[id] = { essays:d.essays||{}, tasks:d.tasks||{} }; });
  const p = { modules }; if(dirtyProf) p.profile = S.data.profile; return p;
}
async function flush(){
  if(writing || (!dirtyMods.size && !dirtyProf) || !S.me) return; writing=true;
  const p = savePayload(), sent=[...dirtyMods], prof=dirtyProf; dirtyMods.clear(); dirtyProf=false;
  try{ await api("save", p); setStatus("Saved"); }
  catch(e){ sent.forEach(id=>dirtyMods.add(id)); if(prof) dirtyProf=true; setStatus("Save failed — retrying…"); timer=setTimeout(flush,4000); }
  writing=false; saveLocal(); if(dirtyMods.size||dirtyProf){ clearTimeout(timer); timer=setTimeout(flush,1500); }
}
addEventListener("pagehide", ()=>{ if(!S.me || (!dirtyMods.size && !dirtyProf)) return;
  try{ fetch(API_URL,{ method:"POST", keepalive:true, headers:{ "Content-Type":"text/plain;charset=utf-8" }, body:JSON.stringify(Object.assign({ action:"save", kode:S.kode }, savePayload())) }); }catch(e){} });
function setStatus(t){ $("#status").textContent = t; }

// --------------- progress math ---------------
const taskKeys = m => [...m.tasks.lapangan.map((_,i)=>"lap-"+i), ...m.tasks.sales.map((_,i)=>"sal-"+i), ...m.tasks.k3.map((_,i)=>"k3-"+i)];
function prog(m, d, sign){
  d = d || {quiz:null,essays:{},tasks:{}};
  const qp = d.quiz && d.quiz.best >= C.program.pass ? 1 : 0;
  const ea = m.essays.filter((_,i)=> (d.essays||{})[i] && String(d.essays[i]).trim().length>15).length;
  const keys = taskKeys(m); const td = keys.filter(k=>(d.tasks||{})[k]).length;
  const sg = sign && sign[m.id] && sign[m.id].ok ? 1 : 0;
  const pct = Math.round(qp*25 + ea/m.essays.length*25 + td/keys.length*30 + sg*20);
  return { pct, qp, ea, et:m.essays.length, td, tt:keys.length, sg, best: d.quiz ? d.quiz.best : null };
}
const overall = (data,sign)=> Math.round(M.reduce((a,m)=>a+prog(m,(data.modules||{})[m.id],sign).pct,0)/M.length);
const lvl = p => p>=100?3 : p>=50?2 : p>0?1:0;

function weekDates(w){
  const s = S.data.profile && S.data.profile.start; if(!s) return "";
  const d0 = new Date(s+"T00:00:00"); if(isNaN(d0)) return "";
  const a = new Date(d0); a.setDate(a.getDate()+(w-1)*7); const b = new Date(a); b.setDate(b.getDate()+4);
  const o = {day:"numeric",month:"short"}; return a.toLocaleDateString("en-GB",o)+" – "+b.toLocaleDateString("en-GB",o);
}

// --------------- render: chrome ---------------
function renderTabs(){
  const tabs = [["home","Home"],["modul","Modules"],["kalkulator","Calculators"],["ujian","Final Exam"],["glosarium","Glossary"]];
  if(S.isPT) tabs.push(["pt","PT Dashboard"]);
  $("#tabs").innerHTML = tabs.map(([k,l])=>`<button type="button" data-tab="${k}" aria-current="${S.view===k}">${l}</button>`).join("");
}
function renderRail(){
  $("#rail").innerHTML = `<h4>8-week path</h4>` + M.map(m=>{
    const p = prog(m, S.data.modules[m.id], S.sign);
    return `<button type="button" class="wk" data-mod="${m.id}" aria-current="${S.view==="modul"&&S.mod===m.id}">
      <span class="n">${m.week}</span><span><span class="t">${esc(m.title)}</span>
      <div class="bar ${p.pct>=100?"done":""}" role="img" aria-label="Progress ${p.pct}%"><i style="width:${p.pct}%"></i></div></span></button>`;
  }).join("");
}
function render(){
  renderTabs(); renderRail();
  const v = S.view;
  const html = v==="home"?vHome(): v==="modul"?vModule(): v==="kalkulator"?vCalc(): v==="ujian"?vExam(): v==="glosarium"?vGloss(): v==="pt"?vPT(): "";
  $("#main").innerHTML = html;
  if(v==="kalkulator") initCalcs();
}

// --------------- views ---------------
function storageNote(){
  return `<p class="notice ok">Signed in as <b>${esc(S.me?S.me.nama:"")}</b>. Your progress is saved to the LMS and visible to your PT.</p>`;
}
const JENIS = { quiz:"Module quiz", exam:"Final exam", signoff:"PT sign-off", signoff_dicabut:"Sign-off removed" };
function histTable(h){
  if(!h || !h.length) return `<p class="lead">No activity yet. Quiz attempts, exam results and PT sign-offs will appear here.</p>`;
  return `<div class="tw"><table><thead><tr><th>Date</th><th>Week</th><th>Activity</th><th>Score</th><th>Note</th></tr></thead><tbody>
  ${h.slice(0,200).map(r=>`<tr><td><small>${r.at?new Date(r.at).toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"–"}</small></td>
    <td>${r.week?"W"+esc(r.week):r.modul==="final"?"Final":"–"}</td><td>${esc(JENIS[r.jenis]||r.jenis)}</td>
    <td>${r.skor!=null?`<span class="pill ${r.skor>=C.program.pass?"good":"bad"}">${r.skor}%</span>`:"–"}</td><td><small>${esc(r.catatan||"")}</small></td></tr>`).join("")}
  </tbody></table></div>`;
}
function weekSummary(h){
  // best quiz score per week + number of attempts, from history
  const W = {}; (h||[]).forEach(r=>{ if(r.jenis!=="quiz"||!r.week) return; const w=W[r.week]||(W[r.week]={best:0,n:0,last:null}); w.n++; w.best=Math.max(w.best,r.skor||0); if(!w.last||r.at>w.last) w.last=r.at; });
  return `<div class="tw"><table><thead><tr>${M.map(m=>`<th>W${m.week}</th>`).join("")}</tr></thead><tbody><tr>
    ${M.map(m=>{ const w=W[m.week]; return `<td>${w?`<span class="cell c${w.best>=C.program.pass?3:1}" title="${w.n} attempt(s)">${w.best}</span><br><small>${w.n}×</small>`:"–"}</td>`; }).join("")}</tr></tbody></table></div>`;
}
function vHome(){
  const ov = overall(S.data,S.sign);
  const next = M.find(m=>prog(m,S.data.modules[m.id],S.sign).pct<100) || M[M.length-1];
  const P = S.data.profile||{};
  return `
  <section class="card">
    <div class="sec-h"><span class="k">PAC 1 program · ${C.program.weeks} weeks</span><span class="pill acc">Overall progress ${ov}%</span></div>
    <h1>${esc(C.program.title)}</h1>
    <p class="lead">${esc(C.program.subtitle)}. Technical program for new APK Sales, Technical Sales and Service Engineers: from basic water chemistry and coagulation–flocculation through clarification, biological treatment, sludge handling and special applications. Every week follows the same pattern:</p>
    <div class="flow">${C.program.flow.map((f,i)=>`<span>${i+1}. ${esc(f)}</span>`).join('<em>→</em>')}</div>
    ${storageNote()}
    <div class="row"><button class="btn" type="button" data-mod="${next.id}">Continue: Week ${next.week}</button></div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>Training profile</h2><span class="k">used for your weekly dates</span></div>
    <div class="grid3">
      <label for="pf-role">Track<select id="pf-role" data-prof="role">
        ${["","Sales","Technical Sales","Service Engineer"].map(r=>`<option value="${r}" ${P.role===r?"selected":""}>${r||"— select —"}</option>`).join("")}</select></label>
      <label for="pf-start">PAC 1 start date<input id="pf-start" type="date" data-prof="start" value="${esc(P.start||"")}"></label>
    </div>
  </section>
  <section>
    <div class="grid3">${M.map(m=>{ const p = prog(m,S.data.modules[m.id],S.sign); return `
      <button type="button" class="mcard" data-mod="${m.id}">
        <span class="wkl">Week ${m.week} · ${esc(m.lessons)}${weekDates(m.week)?" · "+weekDates(m.week):""}</span>
        <h3>${esc(m.title)}</h3>
        <div class="bar ${p.pct>=100?"done":""}"><i style="width:${p.pct}%"></i></div>
        <span class="chips">
          <span class="pill ${p.qp?"good":p.best!=null?"bad":""}">Quiz ${p.best!=null?p.best+"%":"–"}</span>
          <span class="pill ${p.ea===p.et?"good":p.ea?"warn":""}">Written ${p.ea}/${p.et}</span>
          <span class="pill ${p.td===p.tt?"good":p.td?"warn":""}">Tasks ${p.td}/${p.tt}</span>
          <span class="pill ${p.sg?"good":""}">${p.sg?"PT signed off ✓":"Not signed off"}</span>
        </span></button>`; }).join("")}
    </div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>Track record</h2><span class="k">best quiz score per week · attempts</span></div>
    ${weekSummary(S.history)}
    <h3>History</h3>${histTable(S.history)}
  </section>
  <section class="card">
    <h2>Roles in the program</h2>
    <div class="tw"><table><tbody>${C.program.roles.map(r=>`<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}</tbody></table></div>
    <p class="lead">To complete: every module quiz ≥ ${C.program.pass}%, final exam ≥ ${C.program.pass}%, proposal presented to your PT and manager, and the oral competency exam.</p>
  </section>`;
}

function vModule(){
  const m = M.find(x=>x.id===S.mod) || M[0]; const d = md(m.id); const p = prog(m,d,S.sign);
  const sg = S.sign[m.id];
  const subs = [["materi","Module"],["kuis","Quiz"],["esai","Technical Lesson"],["tugas","Tasks & Safety"]];
  let body = "";
  if(S.sub==="materi") body = `
    <section class="card">
      <h2>Learning objectives</h2><ul class="clean">${m.objectives.map(o=>`<li>${esc(o)}</li>`).join("")}</ul>
      <h3>Reference reading</h3>
      <p class="lead"><b>Tech. Ref.:</b> ${m.refs.teknis.map(esc).join(" · ")}<br><b>App. Ref.:</b> ${m.refs.aplikasi.map(esc).join(" · ")}</p>
    </section>
    ${(m.figs&&m.figs.length)?`<section class="card"><h2>Diagrams</h2><div class="figs">${m.figs.map(k=>FIGS[k]?`<figure class="fig">${FIGS[k].svg}<figcaption><b>${esc(FIGS[k].t)}</b>${esc(FIGS[k].c)}</figcaption></figure>`:"").join("")}</div></section>`:""}
    ${(m.photos&&m.photos.length)?`<section class="card" data-photos="1"><h2>In the field</h2><div class="photos">${m.photos.map(p=>`<figure class="photo"><img src="img/${p[0]}.jpg" alt="${esc(p[1])}" loading="lazy" onerror="var s=this.closest('section');this.closest('figure').remove();if(s&&!s.querySelector('figure'))s.remove();"><figcaption>${esc(p[1])}</figcaption></figure>`).join("")}</div></section>`:""}
    <section class="card">${m.summary.map(s=>`<div class="sum-block"><h3>${esc(s.h)}</h3>${s.p?`<p>${esc(s.p)}</p>`:""}${s.list?`<ul class="clean">${s.list.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}</div>`).join("")}</section>
    <section class="card"><h2>Key formulas</h2><div class="grid2">${m.formulas.map(f=>`<div class="formula"><b>${esc(f.n)}</b><pre>${esc(f.f)}</pre></div>`).join("")}</div>
      <div class="sum-block"><h3>${esc(m.example.h)}</h3><p>${esc(m.example.p)}</p></div>
      <p><button class="btn ghost sm" type="button" data-tab="kalkulator">Open calculators</button></p></section>
    <section class="apk"><b>Link to APK products & business</b><p>${esc(m.apk)}</p></section>`;
  if(S.sub==="kuis") body = quizHTML(m);
  if(S.sub==="esai") body = `<section class="card"><div class="sec-h"><h2>Technical Lesson — ${esc(m.lessons)}</h2><span class="pill ${p.ea===p.et?"good":"warn"}">${p.ea}/${p.et} answered</span></div>
    <p class="lead">Answer in your own words and show your working for calculations. Answers save automatically and your PT reviews them. You may answer in English or Bahasa Indonesia.</p>
    ${m.essays.map((q,i)=>`<div class="essay"><label for="es-${m.id}-${i}"><span class="n">${i+1}.</span>${esc(q)}</label>
      <textarea id="es-${m.id}-${i}" data-essay="${i}" ${S.mode==="db"&&!S.canWrite?"readonly":""}>${esc((d.essays||{})[i]||"")}</textarea></div>`).join("")}
    ${sg&&sg.note?`<div class="notice ok"><b>PT note:</b> ${esc(sg.note)}</div>`:""}</section>`;
  if(S.sub==="tugas"){
    const grp = (k,label,arr)=>`<div class="tgroup"><h4>${label}</h4>${arr.map((t,i)=>{const key=k+"-"+i, on=!!(d.tasks||{})[key];
      return `<label class="task ${on?"done":""}" for="tk-${m.id}-${key}"><input type="checkbox" id="tk-${m.id}-${key}" data-task="${key}" ${on?"checked":""}><span>${esc(t)}</span></label>`;}).join("")}</div>`;
    body = `<section class="card"><div class="sec-h"><h2>Week ${m.week} tasks</h2><span class="pill ${p.td===p.tt?"good":"warn"}">${p.td}/${p.tt} done</span></div>
      ${grp("lap","Field tasks",m.tasks.lapangan)}${grp("sal","Sales tasks",m.tasks.sales)}${grp("k3","Safety (HSE)",m.tasks.k3)}</section>
      <section class="card"><h3>PT review</h3><p>${esc(m.review)}</p>
      ${sg&&sg.ok?`<p class="notice ok">Signed off by PT: ${esc(sg.at?new Date(sg.at).toLocaleDateString("en-GB"):"")}${sg.note?" — "+esc(sg.note):""}</p>`:`<p class="lead">Your PT has not signed off this module yet.</p>`}</section>`;
  }
  return `<section class="card">
      <div class="sec-h"><span class="k">Week ${m.week} · ${esc(m.lessons)}${weekDates(m.week)?" · "+weekDates(m.week):""}</span><span class="pill ${p.pct>=100?"good":"acc"}">Progress ${p.pct}%</span></div>
      <h1>${esc(m.title)}</h1>
      <div class="subtabs" role="tablist">${subs.map(([k,l])=>`<button type="button" data-sub="${k}" aria-current="${S.sub===k}">${l}</button>`).join("")}</div>
    </section>${body}`;
}

function quizHTML(m){
  const st = S.quizState[m.id] || (S.quizState[m.id] = {ans:{},done:false});
  const d = md(m.id);
  return `<section class="card">
    <div class="sec-h"><h2>Week ${m.week} quiz</h2><span class="pill ${d.quiz&&d.quiz.best>=C.program.pass?"good":""}">Best score: ${d.quiz?d.quiz.best+"%":"–"}${d.quiz?" · "+d.quiz.tries+" attempt(s)":""}</span></div>
    <p class="lead">${m.quiz.length} multiple-choice questions. Pass mark ${C.program.pass}%. You can retake it; your best score counts.</p>
    <div data-quiz="${m.id}">${m.quiz.map((q,i)=>qBlock(q,i,st,"q-"+m.id)).join("")}</div>
    ${st.done?`<p class="score">${st.score}% <span class="pill ${st.score>=C.program.pass?"good":"bad"}">${st.score>=C.program.pass?"Passed":"Not passed"}</span></p>`:""}
    <div class="row"><button class="btn" type="button" data-submitquiz="${m.id}" ${st.done||S.busy?"disabled":""}>${S.busy&&!st.done?"Checking…":"Check answers"}</button>
    <button class="btn ghost" type="button" data-resetquiz="${m.id}">Retake quiz</button></div></section>`;
}
function qBlock(q,i,st,prefix){
  // answer key comes from the server only after the attempt is scored
  const a = st.done && st.key ? st.key[i] : null;
  return `<div class="q"><p class="qt">${i+1}. ${esc(q.q)}</p>${q.o.map((o,j)=>{
    let cls=""; if(st.done){ if(j===a) cls="right"; else if(st.ans[i]===j) cls="wrong"; }
    return `<label class="${cls}" for="${prefix}-${i}-${j}"><input type="radio" name="${prefix}-${i}" id="${prefix}-${i}-${j}" data-qi="${i}" data-oi="${j}" ${st.ans[i]===j?"checked":""} ${st.done?"disabled":""}>${String.fromCharCode(65+j)}. ${esc(o)}</label>`;
  }).join("")}${st.done&&a!=null?`<p class="why">${st.ans[i]===a?"Correct.":"Answer: "+String.fromCharCode(65+a)+"."} ${esc((st.why||[])[i]||"")}</p>`:""}</div>`;
}

// ---------- final exam ----------
// question ids "m3:4" -> question object (the server picks and scores them)
const qById = id => { const [m,i] = String(id).split(":"); const mod = M.find(x=>x.id===m); return mod && mod.quiz[+i] ? Object.assign({ mod:mod.week }, mod.quiz[+i]) : { q:"(question not found)", o:[] }; };
function vExam(){
  const f = S.data.final; const ex = S.exam;
  const head = `<section class="card"><div class="sec-h"><h1>PAC 1 Final Exam</h1><span class="pill ${f&&f.best>=C.program.pass?"good":""}">Best score: ${f?f.best+"%":"–"}</span></div>
    <p class="lead">20 random questions from all modules. Pass mark ${C.program.pass}%. Take it after passing every module quiz; the oral exam is scheduled with your manager and PT.</p>
    ${!ex?`<button class="btn" type="button" data-startexam="1" ${S.busy?"disabled":""}>${S.busy?"Preparing…":"Start exam"}</button>`:""}</section>`;
  if(!ex) return head;
  return head + `<section class="card" data-exam="1">${ex.qs.map((id,i)=>qBlock(qById(id),i,ex,"ex")).join("")}
    ${ex.done?`<p class="score">${ex.score}% <span class="pill ${ex.score>=C.program.pass?"good":"bad"}">${ex.score>=C.program.pass?"Passed":"Not passed"}</span></p>`:""}
    <div class="row"><button class="btn" type="button" data-submitexam="1" ${ex.done||S.busy?"disabled":""}>${S.busy&&!ex.done?"Scoring…":"Finish & score"}</button><button class="btn ghost" type="button" data-startexam="1" ${S.busy?"disabled":""}>New exam</button></div></section>`;
}

function vGloss(){
  return `<section class="card"><h1>Glossary</h1><dl class="gl">${C.glossary.map(g=>`<dt>${esc(g[0])}</dt><dd>${esc(g[1])}</dd>`).join("")}</dl></section>`;
}

// ---------- calculators ----------
const CALCS = [
  { id:"dt", t:"Detention time & surface rise rate (clarifier/DAF)", f:[["shape","Shape (1=circular, 2=rectangular)",1],["d","Diameter / length (m)",18],["w","Width (m, rectangular)",6],["h","Depth (m)",4],["q","Flow (m³/h)",400]],
    run:v=>{ const A = v.shape==2? v.d*v.w : Math.PI*(v.d/2)**2; const V=A*v.h; return `Area = ${fmt(A,1)} m²   Volume = ${fmt(V,0)} m³\nDT  = ${fmt(V/v.q,2)} h (${fmt(V/v.q*60,0)} min)\nSRR = ${fmt(v.q/A,2)} m/h  (${fmt(v.q*24/A,1)} m³/m²·day)`; } },
  { id:"wor", t:"Weir overflow rate", f:[["dw","Weir diameter (m) — 0 to use length",17],["lw","Weir length (m)",0],["q","Flow (m³/h)",400]],
    run:v=>{ const L = v.dw>0? Math.PI*v.dw : v.lw; return `Weir length = ${fmt(L,1)} m\nWOR = ${fmt(v.q*24/L,1)} m³/m·day  (typical 125–500)`; } },
  { id:"sl", t:"Solids loading", f:[["s","Solids in (kg/day)",45400],["a","Surface area (m²)",120.8]],
    run:v=>`SL = ${fmt(v.s/v.a,1)} kg/m²·day` },
  { id:"dose", t:"Chemical usage & cost", f:[["q","Flow (m³/h)",45.4],["c","Product dose (mg/L)",80],["p","Price (Rp/kg)",10000],["h","Operating hours/day",24]],
    run:v=>{ const kg=v.q*v.h*v.c/1000; return `Usage = ${fmt(kg,1)} kg/day  (${fmt(kg*30,0)} kg/month)\nCost  = Rp ${fmt(kg*v.p,0)} /day  ·  Rp ${fmt(kg*v.p*30,0)} /month\nCost per m³ of water = Rp ${fmt(v.c/1000*v.p,1)}`; } },
  { id:"jar", t:"Jar test: stock solution volume", f:[["s","Stock strength (%)",0.5],["v","Sample volume (mL)",500],["c","Target dose (mg/L)",10]],
    run:v=>{ const ml = v.c*v.v/(v.s*10000); return `Add ${fmt(ml,2)} mL of ${fmt(v.s,2)}% solution to ${fmt(v.v,0)} mL sample\n(1 mL of stock = ${fmt(v.s*10000/v.v,1)} mg/L)`; } },
  { id:"alk", t:"Alkalinity split (mg/L as CaCO₃)", f:[["p","P alkalinity",20],["m","M alkalinity",150]],
    run:v=>{ const P=v.p,Mm=v.m; let oh=0,co=0,hc=0;
      if(P<=0){hc=Mm}else if(P<Mm/2){co=2*P;hc=Mm-2*P}else if(P===Mm/2){co=Mm}else if(P<Mm){oh=2*P-Mm;co=2*(Mm-P)}else{oh=Mm}
      return `OH⁻   = ${fmt(oh,1)}\nCO₃²⁻ = ${fmt(co,1)}\nHCO₃⁻ = ${fmt(hc,1)}\nP/M = ${Mm?fmt(P/Mm*100,0):"–"}%  ${P<=0?"(pH ≤ 8,3)":P/Mm<0.5?"(pH ≈ 8,3–10)":"(pH > 10)"}`; } },
  { id:"svi", t:"Sludge volume index", f:[["sv","30-min settled volume (mL/L)",350],["ml","MLSS (mg/L)",3200]],
    run:v=>{ const s=v.sv*1000/v.ml; return `SVI = ${fmt(s,0)} mL/g  ${s<80?"(very dense / possible pin floc)":s<=150?"(normal)":s<=200?"(watch)":"(likely bulking)"}`; } },
  { id:"fm", t:"F/M ratio", f:[["q","Flow (m³/h)",113.6],["b","Influent BOD (mg/L)",2000],["v","Aeration volume (m³)",14200],["x","MLSS (mg/L)",4000]],
    run:v=>{ const F=v.q*24*v.b/1000, X=v.v*v.x/1000; return `BOD load = ${fmt(F,0)} kg/day\nMLSS mass = ${fmt(X,0)} kg\nF/M = ${fmt(F/X,3)} kg/kg·day`; } },
  { id:"mcrt", t:"Sludge age (MCRT) & WAS needed", f:[["va","Aeration volume (m³)",1893],["xa","Aeration MLSS (mg/L)",2500],["vc","Clarifier volume (m³)",2650],["xc","Clarifier TSS (mg/L)",500],["qw","WAS flow (m³/h)",6.3],["xw","WAS TSS (mg/L)",10000],["qe","Effluent flow (m³/h)",394],["xe","Effluent TSS (mg/L)",20],["t","Target MCRT (days)",5]],
    run:v=>{ const inv=(v.va*v.xa+v.vc*v.xc)/1000, out=(v.qw*v.xw+v.qe*v.xe)*24/1000; const was=inv/v.t - v.qe*v.xe*24/1000;
      return `Solids inventory = ${fmt(inv,0)} kg\nSolids leaving = ${fmt(out,0)} kg/day\nMCRT = ${fmt(inv/out,1)} days\nWAS for ${fmt(v.t,0)}-day target = ${fmt(was,0)} kg/day (${fmt(was/(v.xw/1000)/24,2)} m³/h at WAS TSS)`; } },
  { id:"sc", t:"Dewatering solids capture", f:[["cs","Cake solids (%)",20],["is","Feed solids (%)",5],["fs","Filtrate solids (%)",0.1]],
    run:v=>`Solids capture = ${fmt(v.cs*(v.is-v.fs)/(v.is*(v.cs-v.fs))*100,1)} %` },
  { id:"pc", t:"Polymer cost per dry tonne", f:[["vs","Polymer solution used (m³)",3.79],["cp","Solution strength (%)",0.5],["sg","Product SG",1.05],["vl","Sludge volume (m³)",189],["ts","Sludge solids (%)",5],["cap","Solids capture (%)",96],["pr","Polymer price (Rp/kg)",60000]],
    run:v=>{ const kg=v.vs*v.cp/100*v.sg*1000, ds=v.vl*v.ts/100*v.cap/100; return `Polymer = ${fmt(kg,1)} kg product\nDry solids = ${fmt(ds,2)} tonnes DS\nDose = ${fmt(kg/ds,2)} kg/tonne DS\nCost = Rp ${fmt(kg*v.pr/ds,0)} /tonne DS`; } },
  { id:"daf", t:"DAF: hydraulic loading & retention", f:[["d","Diameter (m)",3.66],["h","Depth (m)",4.57],["q","Influent flow (m³/h)",34.08],["r","Recycle (%)",50]],
    run:v=>{ const A=Math.PI*(v.d/2)**2, Q=v.q*(1+v.r/100); return `Area = ${fmt(A,2)} m²  Total flow = ${fmt(Q,1)} m³/h\nHLR = ${fmt(Q/A,2)} m/h\nHRT = ${fmt(A*v.h/Q*60,0)} min`; } }
];
function vCalc(){
  return `<section class="card"><h1>PAC 1 field calculators</h1><p class="lead">Metric units. Results update as you type. Starting values are the worked examples from the modules.</p></section>
  <div class="grid2">${CALCS.map(c=>`<section class="card calc" data-calc="${c.id}"><h3>${esc(c.t)}</h3><div class="fields">${c.f.map(([k,l,dv])=>`<label for="c-${c.id}-${k}">${esc(l)}<input type="number" step="any" id="c-${c.id}-${k}" data-k="${k}" value="${dv}"></label>`).join("")}</div><div class="out" aria-live="polite"></div></section>`).join("")}</div>`;
}
function runCalc(el){
  const c = CALCS.find(x=>x.id===el.dataset.calc); const v={};
  el.querySelectorAll("input").forEach(i=>v[i.dataset.k]=parseFloat(i.value)||0);
  try{ el.querySelector(".out").textContent = c.run(v); }catch(e){ el.querySelector(".out").textContent="Check the inputs."; }
}
function initCalcs(){ document.querySelectorAll("[data-calc]").forEach(runCalc); }

// ---------- PT dashboard ----------
function vPT(){
  const ids = Object.keys(S.all);
  const refresh = `<button class="btn ghost sm" type="button" data-ptrefresh="1" ${S.busy?"disabled":""}>${S.busy?"Refreshing…":"Refresh data"}</button>`;
  if(!ids.length) return `<section class="card"><div class="sec-h"><h1>PT Dashboard</h1>${refresh}</div><p class="lead">No active trainee yet. Add trainees to the <b>Users</b> sheet (role <code>trainee</code>) and give them their access code.</p></section>`;
  const nm = id => S.names[id] || id;
  let detail = "";
  if(S.ptSel && S.all[S.ptSel]){
    const id=S.ptSel, d=S.all[id], sg=S.allSign[id]||{};
    detail = `<section class="card"><div class="sec-h"><h2>${esc(nm(id))}</h2><span class="k">${esc((d.profile||{}).role||"Track not set")} · starts ${esc((d.profile||{}).start||"–")}</span></div>
    ${M.map(m=>{ const dm=(d.modules||{})[m.id]||{}; const p=prog(m,dm,sg); const s=sg[m.id]||{};
      return `<details ${S.ptOpen===m.id?"open":""} data-ptmod="${m.id}"><summary><b>Week ${m.week}</b> — ${esc(m.title)} <span class="cell c${lvl(p.pct)}">${p.pct}%</span></summary>
      <p class="lead">Best quiz: ${p.best!=null?p.best+"%":"–"} · Written ${p.ea}/${p.et} · Tasks ${p.td}/${p.tt}</p>
      ${m.essays.map((q,i)=>`<div class="essay"><b><span class="n">${i+1}.</span>${esc(q)}</b><div class="out">${esc((dm.essays||{})[i]||"— not answered —")}</div></div>`).join("")}
      <div class="essay"><label for="pn-${m.id}">PT note to trainee</label><textarea id="pn-${m.id}" data-ptnote="${m.id}">${esc(s.note||"")}</textarea></div>
      <div class="row"><button class="btn sm" type="button" data-sign="${m.id}">${s.ok?"Update sign-off":"Sign off this module"}</button>${s.ok?`<button class="btn ghost sm" type="button" data-unsign="${m.id}">Remove sign-off</button><span class="pill good">Signed off ${s.at?new Date(s.at).toLocaleDateString("en-GB"):""}</span>`:""}</div>
      </details>`; }).join("")}
    <h3>Track record</h3>${weekSummary(S.allHist[id])}<h3>History</h3>${histTable(S.allHist[id])}</section>`;
  }
  return `<section class="card"><div class="sec-h"><h1>PT Dashboard</h1>${refresh}</div><p class="lead">Progress of every PAC 1 trainee. Click a name to read written answers, leave notes and sign off modules.</p>
  <div class="tw"><table><thead><tr><th>Trainee</th>${M.map(m=>`<th>W${m.week}</th>`).join("")}<th>Exam</th><th>Total</th><th>Updated</th></tr></thead><tbody>
  ${ids.map(id=>{ const d=S.all[id], sg=S.allSign[id]||{}; return `<tr><td><button class="btn ghost sm" type="button" data-ptsel="${esc(id)}">${esc(nm(id))}</button><br><small>${esc((d.profile||{}).role||"")}</small></td>
    ${M.map(m=>{const p=prog(m,(d.modules||{})[m.id],sg);return `<td><span class="cell c${lvl(p.pct)}" title="Quiz ${p.best??"–"} · Written ${p.ea}/${p.et} · Tasks ${p.td}/${p.tt}">${p.pct}${p.sg?"✓":""}</span></td>`}).join("")}
    <td>${d.final?`<span class="cell c${d.final.best>=C.program.pass?3:1}">${d.final.best}</span>`:"–"}</td><td><b>${overall(d,sg)}%</b></td><td><small>${d.updated?new Date(d.updated).toLocaleDateString("en-GB"):"–"}</small></td></tr>`; }).join("")}
  </tbody></table></div><p class="lead">Numbers are module progress % (quiz 25, written 25, tasks 30, sign-off 20). ✓ = signed off.</p></section>${detail}`;
}
async function writeSign(id, mod, ok){
  if(!S.isPT || !id) return;
  const note = (document.querySelector(`[data-ptnote="${mod}"]`)||{}).value || "";
  S.ptOpen = mod; setStatus("Saving sign-off…");
  try{ const r = await api("sign", { target:id, modul:mod, ok, note }); S.allSign[id] = r.sign || {};
    await refreshTrainees(true); setStatus("Sign-off saved"); }
  catch(e){ setStatus("Sign-off not saved — try again"); }
  render();
}
function applyTrainees(list){
  S.all={}; S.allSign={}; S.allHist={}; S.names={};
  (list||[]).forEach(t=>{ S.all[t.id]=t.data; S.allSign[t.id]=t.sign||{}; S.allHist[t.id]=t.history||[]; S.names[t.id]=t.nama; });
}
async function refreshTrainees(quiet){
  if(!S.isPT) return;
  if(!quiet){ S.busy=true; render(); }
  try{ const r = await api("trainees"); applyTrainees(r.trainees); if(!quiet) setStatus("PT data updated"); }
  catch(e){ if(!quiet) setStatus("Could not refresh PT data"); }
  if(!quiet){ S.busy=false; render(); }
}
const pushHist = (h)=>{ S.history.unshift(h); saveLocal(); };

async function submitQuiz(m){
  const st=S.quizState[m.id]; if(!st || S.busy) return;
  if(Object.keys(st.ans).length < m.quiz.length && !confirm("Some questions are unanswered. Submit anyway?")) return;
  S.busy=true; render();
  try{
    const r = await api("quiz", { modul:m.id, ans:m.quiz.map((_,i)=> st.ans[i]==null ? null : st.ans[i]) });
    Object.assign(st, { done:true, score:r.score, key:r.key, why:r.why });
    md(m.id).quiz = r.quiz; pushHist({ at:new Date().toISOString(), week:m.week, modul:m.id, jenis:"quiz", skor:r.score });
    setStatus("Quiz saved");
  }catch(e){ setStatus(e.code==="server_sibuk"?"Server busy — try again":"Quiz not sent — check your connection"); }
  S.busy=false; render();
}
async function startExam(){
  if(S.busy) return; S.busy=true; S.exam=null; render();
  try{ const r = await api("examStart"); S.exam = { qs:r.qs, ans:{}, done:false }; }
  catch(e){ setStatus("Could not start the exam — check your connection"); }
  S.busy=false; render(); window.scrollTo(0,0);
}
async function submitExam(){
  const ex=S.exam; if(!ex || ex.done || S.busy) return;
  if(Object.keys(ex.ans).length < ex.qs.length && !confirm("Some questions are unanswered. Submit anyway?")) return;
  S.busy=true; render();
  try{
    const r = await api("examSubmit", { ans:ex.qs.map((_,i)=> ex.ans[i]==null ? null : ex.ans[i]) });
    Object.assign(ex, { done:true, score:r.score, key:r.key, why:r.why });
    S.data.final = r.final; pushHist({ at:new Date().toISOString(), week:"", modul:"final", jenis:"exam", skor:r.score });
    setStatus("Exam saved");
  }catch(e){ setStatus(e.code==="exam_kedaluwarsa"?"This exam expired — start a new one":"Exam not sent — check your connection and press Finish again"); }
  S.busy=false; render();
}

// ---------- events ----------
document.addEventListener("click", e=>{
  const t = e.target.closest("button,[data-mod],[data-tab]"); if(!t) return;
  if(t.dataset.tab){ S.view=t.dataset.tab; render(); window.scrollTo(0,0); if(S.view==="pt") refreshTrainees(); return; }
  if(t.dataset.mod){ S.view="modul"; S.mod=t.dataset.mod; S.sub="materi"; render(); window.scrollTo(0,0); return; }
  if(t.dataset.sub){ S.sub=t.dataset.sub; render(); return; }
  if(t.dataset.submitquiz){ submitQuiz(M.find(x=>x.id===t.dataset.submitquiz)); return; }
  if(t.dataset.resetquiz){ S.quizState[t.dataset.resetquiz]={ans:{},done:false}; render(); return; }
  if(t.dataset.startexam){ startExam(); return; }
  if(t.dataset.submitexam){ submitExam(); return; }
  if(t.dataset.ptsel){ S.ptSel=t.dataset.ptsel; S.ptOpen=null; render(); return; }
  if(t.dataset.ptrefresh){ refreshTrainees(); return; }
  if(t.dataset.sign){ writeSign(S.ptSel, t.dataset.sign, true); return; }
  if(t.dataset.unsign){ writeSign(S.ptSel, t.dataset.unsign, false); return; }
  if(t.id==="logout"){ if(confirm("Sign out of the LMS on this device?")) logout(); return; }
});
document.addEventListener("change", e=>{
  const t=e.target;
  if(t.dataset.qi!==undefined){ const box=t.closest("[data-quiz],[data-exam]"); const st = box.dataset.exam? S.exam : S.quizState[box.dataset.quiz]; st.ans[+t.dataset.qi]=+t.dataset.oi; return; }
  if(t.dataset.task){ const d=md(S.mod); d.tasks=d.tasks||{}; d.tasks[t.dataset.task]=t.checked; t.closest(".task").classList.toggle("done",t.checked); persist(S.mod); renderRail(); return; }
  if(t.dataset.prof){ S.data.profile=S.data.profile||{}; S.data.profile[t.dataset.prof]=t.value; dirtyProf=true; persist(); render(); return; }
});
let essayT=null;
document.addEventListener("input", e=>{
  const t=e.target;
  if(t.dataset.essay!==undefined){ const d=md(S.mod), mod=S.mod; d.essays=d.essays||{}; d.essays[t.dataset.essay]=t.value; clearTimeout(essayT); essayT=setTimeout(()=>{persist(mod); renderRail();},800); return; }
  const c=t.closest("[data-calc]"); if(c) runCalc(c);
});

// ---------- login ----------
function showLogin(msg){
  $("#app").hidden = true; $("#login").hidden = false;
  $("#login-msg").textContent = msg || ""; $("#login-msg").hidden = !msg;
  const i=$("#login-kode"); i.value=""; setTimeout(()=>i.focus(),50);
}
function showApp(){
  $("#login").hidden = true; $("#app").hidden = false;
  $("#who").textContent = S.me ? S.me.nama + (S.isPT ? " · PT" : "") : "";
  $("#logout").hidden = !S.me;
}
function applyLogin(r){
  S.me = r.user; S.isPT = r.user.peran==="pt";
  S.data = Object.assign(blankData(), r.data||{}); S.data.profile = Object.assign({ role:"", start:"" }, (r.data||{}).profile||{});
  S.sign = r.sign||{}; S.history = r.history||[];
  if(S.isPT) applyTrainees(r.trainees);
  // re-send anything typed offline that never reached the server
  const loc = loadLocal(S.me.id);
  if(loc && loc.pending && loc.pending.length){
    loc.pending.forEach(id=>{ const lm=(loc.data.modules||{})[id]; if(!lm) return; const d=md(id); d.essays=lm.essays||{}; d.tasks=lm.tasks||{}; dirtyMods.add(id); });
  }
  if(loc && loc.prof && loc.data && loc.data.profile){ S.data.profile = loc.data.profile; dirtyProf=true; }
  saveLocal(); if(dirtyMods.size||dirtyProf) flush();
}
async function login(kode, silent){
  S.kode = String(kode||"").trim().toUpperCase();
  if(!silent){ $("#login-btn").disabled=true; $("#login-btn").textContent="Checking…"; }
  try{
    const r = await api("login");
    try{ localStorage.setItem(KKEY, S.kode); }catch(e){}
    applyLogin(r); showApp(); render(); setStatus("Synced");
  }catch(e){
    if(e.code==="kode_salah"){ try{ localStorage.removeItem(KKEY); }catch(_){} S.me=null; showLogin("Access code not recognised. Check it with your PT or admin."); }
    else if(silent && S.me){ setStatus("Offline — showing your last saved data"); }
    else showLogin("Can't reach the server. Check your connection and try again.");
  }
  if(!silent){ $("#login-btn").disabled=false; $("#login-btn").textContent="Sign in"; }
}
function logout(msg){
  flush(); try{ localStorage.removeItem(KKEY); if(S.me) localStorage.removeItem(LKEY+":"+S.me.id); }catch(e){}
  Object.assign(S, { kode:null, me:null, isPT:false, data:blankData(), sign:{}, history:[], all:{}, allSign:{}, allHist:{}, names:{}, view:"home", ptSel:null, quizState:{}, exam:null });
  dirtyMods.clear(); dirtyProf=false; showLogin(msg);
}
$("#login-form").addEventListener("submit", e=>{ e.preventDefault(); const k=$("#login-kode").value; if(k.trim()) login(k); });

// ---------- boot ----------
(function boot(){
  let kode=null; try{ kode = localStorage.getItem(KKEY); }catch(e){}
  if(!kode){ showLogin(); return; }
  // show the last known data immediately, then sync with the server
  let cached=null; try{ const ids = Object.keys(localStorage).filter(k=>k.indexOf(LKEY+":")===0); cached = ids.length===1 ? JSON.parse(localStorage.getItem(ids[0])) : null; }catch(e){}
  S.kode = kode;
  if(cached && cached.me){ S.me=cached.me; S.isPT=cached.me.peran==="pt"; }
  if(cached && cached.data){ S.data=Object.assign(blankData(),cached.data); S.sign=cached.sign||{}; S.history=cached.history||[]; }
  showApp(); render(); setStatus("Connecting…");
  login(kode, true);
})();
})();
