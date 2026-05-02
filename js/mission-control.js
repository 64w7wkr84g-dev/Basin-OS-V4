const STORE_KEYS=['basin_os_integrated','basin_os_v4'];
let STORE={}, selectedIndex=0;

function $(id){return document.getElementById(id)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function norm(s){return String(s||'').trim().toLowerCase()}
function loadStore(){
  for(const k of STORE_KEYS){
    try{
      const raw=localStorage.getItem(k);
      if(raw){ STORE=JSON.parse(raw); STORE.__key=k; return STORE; }
    }catch(e){}
  }
  STORE={radarLeads:[],leadWorkflow:[],investors:[],cpas:[],notes:[],activity:[],api:{},apiUsage:{}};
  return STORE;
}
function score(l){return Number(l?.score||l?.leadScore||0)}
function grade(l){const g=l?.grade; if(g)return g; const s=score(l); return s>=82?'A':s>=68?'B':s>=52?'C':'D'}
function rankGrade(g){return {A:4,B:3,C:2,D:1}[g]||0}
function allLeads(){
  loadStore();
  const inv=(STORE.investors||[]).map(x=>({...x,_type:'Investor'}));
  const wf=(STORE.leadWorkflow||[]).map(x=>({...x,_type:'Workflow'}));
  const rad=(STORE.radarLeads||[]).filter(x=>x.status!=='Suppressed').map(x=>({...x,_type:'Radar'}));
  const pool=[...inv,...wf,...rad];
  const seen=new Set(), out=[];
  for(const l of pool){
    const key=norm([l.name,l.company,l.email,l.linkedin,l.url,l.sourceUrl].filter(Boolean).join('|'));
    if(!key||seen.has(key))continue;
    seen.add(key); out.push(l);
  }
  return out.sort((a,b)=>rankGrade(grade(b))-rankGrade(grade(a))||score(b)-score(a)).slice(0,100);
}
function contactPath(l){
  if(l?.linkedin)return 'LinkedIn';
  if(l?.email&&l?.phone)return 'Email + Phone';
  if(l?.email)return 'Email';
  if(l?.phone)return 'Phone';
  if((l?.contactMethods||[]).length)return l.contactMethods.slice(0,2).map(x=>x.type||x.value).join(' + ');
  if(l?.sourceUrl||l?.url)return 'Source + Google Search';
  return 'Needs verification';
}
function segment(l){
  const blob=[l?.icp,l?.title,l?.company,l?.source,l?.sourceFeed,l?.summary,l?.signal].join(' ').toLowerCase();
  if(/physician|surgeon|medical|doctor|clinic|npi/.test(blob))return 'Physician / Medical';
  if(/cpa|tax|accounting/.test(blob))return 'CPA / Tax';
  if(/attorney|law|partner/.test(blob))return 'Law Partner';
  if(/oil|gas|energy|mineral|royalty/.test(blob))return 'Energy Executive';
  if(/real estate|developer/.test(blob))return 'Real Estate';
  if(/owner|founder|ceo|president/.test(blob))return 'Business Owner';
  return l?._type||'Prospect';
}
function nextAction(l){return l?.nextAction||l?.requiredToday||l?.status||l?.bucket||'Review and disposition'}
function hasContact(l){return !!(l?.email||l?.phone||l?.linkedin||l?.sourceUrl||l?.url||(l?.contactMethods||[]).length)}
function tagHtml(l){
  const tags=[];
  tags.push(hasContact(l)?'<span class="tag green">Has Contact</span>':'<span class="tag redchip">Needs Verify</span>');
  if(/linkedin/i.test(JSON.stringify(l||{})))tags.push('<span class="tag bluechip">LinkedIn</span>');
  if(/npi/i.test(JSON.stringify(l||{})))tags.push('<span class="tag bluechip">NPI</span>');
  if(/referral/i.test(JSON.stringify(l||{})))tags.push('<span class="tag goldchip">Referral</span>');
  return tags.join('');
}
function leadCard(l,i){
  const g=grade(l), sc=score(l), cls=g==='A'?'':(g==='B'?'b':'c');
  return `<div class="lead ${i===selectedIndex?'active':''}" data-select="${i}">
    <div class="score ${cls}">${esc(g)} ${esc(sc)}</div>
    <div><h3>${esc(l.name||l.title||'Unnamed Lead')}</h3><p>${esc((l.title||l.company||segment(l))+' • '+nextAction(l))}</p><div class="tags">${tagHtml(l)}</div></div>
  </div>`;
}
function setText(id,val){const el=$(id); if(el)el.textContent=val}
function render(){
  const leads=allLeads();
  if(selectedIndex>=leads.length)selectedIndex=0;
  const active=leads[selectedIndex]||{};
  const aCount=leads.filter(l=>grade(l)==='A').length;
  const callbacks=(STORE.leadWorkflow||[]).filter(l=>/callback/i.test([l.bucket,l.status].join(' '))).length;
  const due=(STORE.leadWorkflow||[]).filter(l=>/^day/i.test(l.bucket||'day1')).length || leads.length;
  const cpas=(STORE.cpas||[]).length;
  const radar=(STORE.radarLeads||[]).filter(l=>l.status!=='Suppressed').length;
  const total=leads.length;
  const groq=localStorage.getItem('basin_groq_api_key')||localStorage.getItem('basin_groq_key')?'ON':'OFF';

  setText('kpi-total',total); setText('kpi-a',aCount); setText('kpi-due',due); setText('kpi-callbacks',callbacks); setText('kpi-cpas',cpas);
  setText('nav-total',total); setText('nav-radar',radar); setText('nav-leads',(STORE.leadWorkflow||[]).length); setText('nav-investors',(STORE.investors||[]).length); setText('nav-cpas',cpas); setText('nav-notes',(STORE.notes||[]).length);
  setText('status-radar','Loaded '+radar); setText('status-groq',groq); setText('operator-status','● Groq '+groq);

  $('priority-queue').innerHTML=leads.length?leads.slice(0,20).map(leadCard).join(''):'<div class="empty">No leads yet. Run GitHub radar or load shared radar in the core workspace.</div>';
  setText('active-name',active.name||'Select a Lead');
  setText('active-meta',active.name?`${segment(active)} • Score ${score(active)} • ${nextAction(active)}`:'No lead selected');
  setText('active-score',active.name?`${grade(active)} ${score(active)}`:'--');
  setText('active-contact',contactPath(active));
  setText('active-segment',segment(active));
  setText('active-next',nextAction(active).slice(0,90));
  setText('active-status',active.qualificationStatus||active.status||'Qualified');
  setText('active-angle',(active.aiAngle||active.bestAngle||(active.ai&&active.ai.bestAngle)||active.summary||active.signal||'Use the source signal as the opener. Keep it compliant, short, and focused on whether a director call is worth their time.').slice(0,500));
  setText('active-objection',(active.likelyObjection||(active.ai&&active.ai.likelyObjection)||'Need to review with CPA first. Reframe: the director call helps decide whether it is worth CPA review.').slice(0,240));

  const brief=(STORE.briefs&&STORE.briefs[0]&&STORE.briefs[0].text)||STORE.morningBrief||'Build Morning Brief after radar runs. Groq can summarize the highest leverage action, top leads, overdue work, and likely objections.';
  $('morning-brief').innerHTML=brief.split(/\n+/).filter(Boolean).slice(0,5).map(x=>`<div class="brief-item"><div class="check">✓</div><div>${esc(x).slice(0,180)}</div></div>`).join('');
  const health=Math.min(99,Math.max(1,Math.round((aCount/Math.max(1,total))*100)||86));
  setText('health-percent',health+'%');
  setText('health-risk',`${due} leads need task completion or disposition before moving forward.`);
  const acts=(STORE.activity||[]).slice(0,4);
  $('activity-stream').innerHTML=(acts.length?acts:[{ts:'Now',m:'Mission Control loaded'},{ts:'Now',m:'Radar records detected: '+radar}]).map(a=>`<div class="time"><small>${esc(a.ts||'Now')}</small><p>${esc(a.m||a.text||a.message||'Activity')}</p></div>`).join('');
}
function openCore(page){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  const titles={radar:'Lead Radar',leads:'Leads Workflow',investors:'Investor Pipeline',cpas:'CPA Pipeline',coach:'Call Coach',apicenter:'API Command Center',notes:'Call Notes',analytics:'Analytics',followups:'Follow-Up Dashboard',calendar:'Appointment Calendar',handoffs:'Director Handoffs',sequences:'7-Channel Sequence Builder',linkedinbuilder:'LinkedIn Builder',salesnav:'SalesNav + NPI',rssmonitor:'RSS Signal Monitor',playbook:'Master Playbook',settings:'Settings'};
  if(page==='dashboard'){showMission();return;}
  $('mission-view').classList.add('hidden'); $('core-view').classList.remove('hidden');
  setText('view-title',titles[page]||'Basin OS Workspace'); setText('core-title',titles[page]||'Basin OS Workspace');
  const mapped=page==='salesnav'?'salesnavnpi':page;
  $('core-frame').src='app-core.html#'+mapped;
}
function showMission(){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page==='dashboard'));
  $('core-view').classList.add('hidden'); $('mission-view').classList.remove('hidden'); setText('view-title','Mission Control'); render();
}
document.addEventListener('click',e=>{
  const nav=e.target.closest('.nav-btn'); if(nav){openCore(nav.dataset.page);}
  const btn=e.target.closest('[data-open]'); if(btn){openCore(btn.dataset.open);}
  const lead=e.target.closest('[data-select]'); if(lead){selectedIndex=Number(lead.dataset.select)||0;render();}
});
$('back-dashboard').addEventListener('click',showMission);
$('global-search').addEventListener('click',()=>openCore('leads'));
window.addEventListener('storage',render);
setInterval(render,10000);
render();
