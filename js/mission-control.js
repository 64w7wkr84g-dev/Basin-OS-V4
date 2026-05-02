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
function mergedLeads(limit){
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
  const sorted=out.sort((a,b)=>rankGrade(grade(b))-rankGrade(grade(a))||score(b)-score(a));
  return Number.isFinite(limit) ? sorted.slice(0,limit) : sorted;
}
function allLeads(){
  const all=mergedLeads ? mergedLeads() : [];
  return all.filter(validLead).slice(0,100);
}
function trueLeadTotal(){
  const wf=(STORE.leadWorkflow||[]).filter(validLead).length;
  const radar=(STORE.radarLeads||[]).filter(x=>x.status!=='Suppressed').filter(validLead).length;
  const inv=(STORE.investors||[]).filter(validLead).length;
  return wf || radar || inv || (mergedLeads?mergedLeads().filter(validLead).length:0);
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

function isRealHumanName(name){
  name=String(name||'').trim();
  if(!name)return false;
  const lower=name.toLowerCase();
  const bad=[
    'names new','tax strategies','essential financial','bay legal','virtruvian partners',
    'email addresses','licensure supervision','via llp','los angeles','new york','houston',
    'dallas','austin','san antonio','nationwide','how bennett','practice owner',
    'business owner','law partner','attorney','physician','doctor','cpa','tax advisor'
  ];
  if(bad.some(x=>lower===x || lower.includes(x)))return false;
  if(/\b(strategies|financial|partners|legal|capital|ventures|group|llc|inc|firm|clinic|practice|medical|health|associates|company|services|advisors|consulting|solutions|bank|hospital|center)\b/i.test(name))return false;
  if(!/^[A-Z][a-zA-Z'.-]{1,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{1,}$/.test(name))return false;
  return true;
}
function realContactMethod(l){
  if(l?.email && /@/.test(String(l.email)))return true;
  if(l?.phone && String(l.phone).replace(/\D/g,'').length>=10)return true;
  if(l?.linkedin && /linkedin\.com/i.test(String(l.linkedin)))return true;
  const methods=Array.isArray(l?.contactMethods)?l.contactMethods:[];
  if(methods.some(m=>/linkedin|email|phone|google search|source/i.test([m.type,m.value,m.source].join(' '))))return true;
  if(l?.sourceUrl||l?.url)return true; // source URL counts as a research contact path, not direct contact.
  return false;
}
function validLead(l){
  return isRealHumanName(l?.name) && realContactMethod(l);
}
function quarantineInvalidLeads(){
  loadStore();
  let changed=false;
  const now=new Date().toISOString();
  const next=new Date(Date.now()+14*86400000).toISOString();
  STORE.radarRejected=Array.isArray(STORE.radarRejected)?STORE.radarRejected:[];
  function rejectify(l,from){
    const reason=!isRealHumanName(l?.name)?'Rejected: not a named human contact':'Rejected: no contact method/path';
    STORE.radarRejected.push({
      id:'reject-'+Date.now()+'-'+Math.random().toString(16).slice(2),
      name:l?.name||l?.title||'Unknown',
      company:l?.company||'',
      source:l?.source||l?.sourceFeed||from,
      reason,
      skippedAt:now,
      nextEligibleCheck:next,
      original:l
    });
  }
  ['radarLeads','leadWorkflow','investors'].forEach(key=>{
    if(!Array.isArray(STORE[key]))return;
    const before=STORE[key].length;
    STORE[key]=STORE[key].filter(l=>{
      if(validLead(l))return true;
      rejectify(l,key);
      changed=true;
      return false;
    });
    if(before!==STORE[key].length)changed=true;
  });
  if(changed){
    try{
      const k=STORE.__key||'basin_os_integrated';
      localStorage.setItem(k,JSON.stringify(STORE));
    }catch(e){}
  }
  return changed;
}

function tagHtml(l){
  const tags=[];
  tags.push(realContactMethod(l)?'<span class="tag green">Has Contact</span>':'<span class="tag redchip">Needs Verify</span>');
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
  quarantineInvalidLeads();
  const leads=allLeads();
  if(selectedIndex>=leads.length)selectedIndex=0;
  const active=leads[selectedIndex]||{};
  const aCount=leads.filter(l=>grade(l)==='A' && validLead(l)).length;
  const callbacks=(STORE.leadWorkflow||[]).filter(validLead).filter(l=>/callback/i.test([l.bucket,l.status].join(' '))).length;
  const due=(STORE.leadWorkflow||[]).filter(validLead).filter(l=>/^day/i.test(l.bucket||'day1')).length || leads.length;
  const cpas=(STORE.cpas||[]).length;
  const radar=(STORE.radarLeads||[]).filter(l=>l.status!=='Suppressed').filter(validLead).length;
  const total=trueLeadTotal();
  const groqKey=localStorage.getItem('basin_groq_api_key')||localStorage.getItem('basin_groq_key')||'';
  const groqLive=STORE?.api?.groqLive===true || STORE?.api?.groqConnected===true || STORE?.api?.lastConnect;
  const groq=groqKey?(groqLive?'ON':'SAVED'):'OFF';

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
  $('mission-view').classList.add('hidden'); 
  $('core-view').classList.remove('hidden');
  setText('view-title',titles[page]||'Basin OS Workspace'); 
  setText('core-title',titles[page]||'Basin OS Workspace');
  const mapped=page==='salesnav'?'salesnavnpi':page;
  routeCoreFrame(mapped);
}

function routeCoreFrame(mapped){
  const frame=$('core-frame');
  if(!frame)return;

  const targetId='page-'+mapped;

  function hardRoute(){
    try{
      const w=frame.contentWindow;
      const d=frame.contentDocument || (w && w.document);
      if(!w || !d)return false;

      // 1) Directly force the correct page visible in the preserved core app.
      const target=d.getElementById(targetId);
      if(!target)return false;

      d.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      target.classList.add('active');

      // 2) Force the matching old sidebar item active so the embedded core does not look stuck on Dashboard.
      d.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      const nav=[...d.querySelectorAll('.nav-item')].find(n=>{
        const on=n.getAttribute('onclick')||'';
        return on.includes("'"+mapped+"'") || on.includes('"'+mapped+'"');
      });
      if(nav)nav.classList.add('active');

      // 3) Run the core page renderer after the active page is set.
      if(typeof w.updateCounts==='function')w.updateCounts();
      if(typeof w.renderActivePage==='function')w.renderActivePage();
      if(typeof w.refresh==='function'){
        // Do not call refresh first. It can rerender the wrong active page if the class has not stuck.
        setTimeout(()=>{try{w.renderActivePage();w.updateCounts&&w.updateCounts();}catch(e){}},100);
      }

      // 4) Reset scroll positions so the selected page starts at the top.
      try{w.scrollTo(0,0);d.documentElement.scrollTop=0;d.body.scrollTop=0;}catch(e){}

      return true;
    }catch(e){
      return false;
    }
  }

  frame.onload=function(){
    let tries=0;
    const timer=setInterval(function(){
      tries++;
      if(hardRoute() || tries>50)clearInterval(timer);
    },100);
  };

  // Force a fresh iframe URL every time so GitHub/browser cache cannot keep the core on Dashboard.
  frame.src='app-core.html?v=hard-route-'+Date.now()+'#'+encodeURIComponent(mapped);

  setTimeout(hardRoute,250);
  setTimeout(hardRoute,750);
  setTimeout(hardRoute,1500);
  setTimeout(hardRoute,2500);
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
