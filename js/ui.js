const Pages = [
  {id:"dashboard", icon:"⚡", label:"Dashboard", group:"Overview"},
  {id:"radar", icon:"📡", label:"Lead Radar", group:"Prospecting Tools"},
  {id:"salesnav", icon:"🧭", label:"SalesNav Builder", group:"Prospecting Tools"},
  {id:"npi", icon:"🏥", label:"NPI Finder", group:"Prospecting Tools"},
  {id:"csv", icon:"📥", label:"CSV Import", group:"Prospecting Tools"},
  {id:"leads", icon:"🧲", label:"Leads Workflow", group:"Pipelines"},
  {id:"investors", icon:"👤", label:"Investor Pipeline", group:"Pipelines"},
  {id:"cpas", icon:"🤝", label:"CPA Pipeline", group:"Pipelines"},
  {id:"sequences", icon:"✉️", label:"Sequence Builder", group:"Execution"},
  {id:"callnotes", icon:"📝", label:"Call Notes", group:"Execution"},
  {id:"callcoach", icon:"🎙️", label:"Call Coach", group:"Execution"},
  {id:"brief", icon:"🌅", label:"Morning Brief", group:"Execution"},
  {id:"settings", icon:"⚙️", label:"Settings", group:"System"}
];
const PageMeta = {
  dashboard:["Dashboard","Top actions, lead counts, high-score leads, and recent activity."],
  radar:["Lead Radar","Load shared GitHub radar and manually add signal-based leads."],
  salesnav:["Sales Navigator Builder","Manual Sales Navigator searches, saved URLs, alert logging, and InMail queue."],
  npi:["NPI Physician Finder","Search the free federal NPI registry and add physicians to the pipeline."],
  csv:["CSV Import","Import manually prepared Sales Navigator or HubSpot CSVs."],
  leads:["Leads Workflow","Day 1 through Day 10 cadence tracker with required task completion before advancement."],
  investors:["Investor Pipeline","A/B/C sorted lead table with contact tags, sequence actions, and handoff support."],
  cpas:["CPA Pipeline","Referral partner pipeline and CPA activation path."],
  sequences:["Sequence Builder","Investor, CPA outreach, and CPA activation sequence content."],
  callnotes:["Call Notes","Log calls, objections, follow-ups, and referrals."],
  callcoach:["Call Coach","Objection handling prioritized by your call-note history."],
  brief:["Morning Brief","Daily execution summary from radar, pipeline, notes, and tasks."],
  settings:["Settings","API keys, import legacy data, and storage controls."]
};
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1800); }
function setPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $("page-"+id).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active", n.dataset.page===id));
  const [title,sub]=PageMeta[id]||PageMeta.dashboard;
  $("pageTitle").textContent=title; $("pageSub").textContent=sub;
  renderTopActions(id);
  location.hash = id;
}
function renderNav(){
  const nav=$("nav");
  const groups=[...new Set(Pages.map(p=>p.group))];
  nav.innerHTML = groups.map(g=>`<div class="nav-section"><div class="nav-label">${esc(g)}</div>${Pages.filter(p=>p.group===g).map(p=>`<button class="nav-item" data-page="${p.id}" onclick="setPage('${p.id}')"><span>${p.icon}</span><span>${esc(p.label)}</span><span class="count" id="nav-count-${p.id}">0</span></button>`).join("")}</div>`).join("");
}
function renderTopActions(id){
  const a=$("topActions");
  const map={
    dashboard:`<button class="btn btn-primary" onclick="buildMorningBrief()">🌅 Build Morning Brief</button><button class="btn btn-ghost" onclick="loadSharedRadarClick()">📡 Load Radar</button>`,
    radar:`<button class="btn btn-primary" onclick="loadSharedRadarClick()">📡 Load Shared Radar</button>`,
    leads:`<button class="btn btn-primary" onclick="setPage('radar')">+ Add / Load Leads</button>`,
    investors:`<button class="btn btn-primary" onclick="quickAddInvestor()">+ Add Investor</button>`,
    cpas:`<button class="btn btn-primary" onclick="quickAddCpa()">+ Add CPA</button>`,
    brief:`<button class="btn btn-primary" onclick="buildMorningBrief()">🌅 Build Morning Brief</button>`,
    settings:`<button class="btn btn-primary" onclick="Store.export()">Export Backup</button>`
  };
  a.innerHTML = map[id] || "";
}
function renderCounts(){
  const d=Store.data;
  const counts={radar:d.leads.length, leads:d.leads.filter(x=>x.status==="Open").length, investors:d.investors.length, cpas:d.cpas.length, callnotes:d.notes.length, dashboard:d.leads.length+d.investors.length, brief:d.activity.length};
  Pages.forEach(p=>{ const el=$("nav-count-"+p.id); if(el) el.textContent = counts[p.id] || 0; });
  $("groqStatus").textContent = Store.data.settings.groqKey ? "ON" : "OFF";
}
function gradeHtml(r){ return `<div class="grade ${esc(r.grade||"D")}">${esc(r.grade||"D")}</div>`; }
function contactTags(r){
  return [r.email&&`<span class="pill green">Email</span>`, r.phone&&`<span class="pill green">Phone</span>`, r.linkedin&&`<span class="pill blue">LinkedIn</span>`, r.sourceUrl&&`<span class="pill blue">Source</span>`, !hasContact(r)&&`<span class="pill red">No Contact</span>`].filter(Boolean).join(" ");
}
function recordTable(records, type){
  records = records.slice().sort(sortByQuality);
  if(!records.length) return `<div class="empty"><div class="icon">📭</div><h3>No records yet</h3><p>Load radar, import CSV, or add a record manually.</p></div>`;
  return `<table class="table"><thead><tr><th>Score</th><th>Name & Contact</th><th>Fit</th><th>Status / Next</th><th></th></tr></thead><tbody>${records.map(r=>`
    <tr>
      <td>${gradeHtml(r)}</td>
      <td><div class="namecell">${esc(r.name || "Unnamed")}</div><div class="metacell">${esc(r.title||"")} ${r.company? "• "+esc(r.company):""} ${r.location? "• "+esc(r.location):""}</div><div style="margin-top:6px">${contactTags(r)}</div></td>
      <td><span class="pill gold">${esc(r.score||0)}</span> <span class="pill">${esc(classifyICP(r))}</span> ${(r.tags||[]).slice(0,3).map(t=>`<span class="pill">${esc(t)}</span>`).join(" ")}</td>
      <td><div class="metacell">${esc(r.status||"Open")}</div><div class="namecell" style="font-size:12px;margin-top:2px">${esc(r.nextAction||r.signal||"Review and disposition")}</div></td>
      <td><div class="actions">${actionsFor(r,type)}</div></td>
    </tr>`).join("")}</tbody></table>`;
}
function actionsFor(r,type){
  if(type==="lead") return `<button class="btn btn-primary btn-sm" onclick="addLeadToPipeline('${r.id}')">Pipeline</button><button class="btn btn-ghost btn-sm" onclick="completeLeadDay('${r.id}')">Complete Day</button><button class="btn btn-ghost btn-sm" onclick="dispositionLead('${r.id}','Callback')">Callback</button><button class="btn btn-danger btn-sm" onclick="dispositionLead('${r.id}','Not Interested')">No</button>`;
  if(type==="investor") return `<button class="btn btn-primary btn-sm" onclick="logTouch('${r.id}')">Log Note</button><button class="btn btn-ghost btn-sm" onclick="queueInMail('${r.id}')">📬 InMail</button><button class="btn btn-ghost btn-sm" onclick="sequenceFor('${r.id}')">Seq</button>`;
  if(type==="cpa") return `<button class="btn btn-primary btn-sm" onclick="cpaActivation('${r.id}')">Activate</button><button class="btn btn-ghost btn-sm" onclick="logCpaNote('${r.id}')">Note</button>`;
  return "";
}
function renderAll(){
  renderCounts();
  renderDashboard();
  renderRadar();
  renderLeads();
  renderInvestors();
  renderCpas();
  renderSalesNav();
  renderNpi();
  renderCsv();
  renderSequences();
  renderCallNotes();
  renderCallCoach();
  renderBrief();
  renderSettings();
}
