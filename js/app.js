Store.load();

function init(){
  renderNav();
  bindGlobal();
  const importResult = Store.data.imports.legacyImported ? null : Store.importLegacy();
  if(importResult && importResult.ok) toast("Imported old Basin OS browser data");
  renderAll();
  setPage((location.hash||"#dashboard").replace("#","") || "dashboard");
}
function bindGlobal(){
  $("exportAllBtn").onclick = () => Store.export();
  $("importBackupInput").onchange = async e => {
    if(e.target.files[0]){ await Store.importFile(e.target.files[0]); toast("Backup imported"); renderAll(); }
  };
}

async function loadSharedRadarClick(){
  try{ const r=await loadSharedRadar(); toast(`Radar loaded: ${r.added} added`); renderAll(); }
  catch(e){ toast("Radar load failed"); console.error(e); }
}

function renderDashboard(){
  const d=Store.data;
  const top = d.investors.concat(d.leads).filter(x=>x.name).sort(sortByQuality).slice(0,10);
  $("page-dashboard").innerHTML = `
    <div class="grid4">
      <div class="stat"><div class="num">${d.leads.length}</div><div class="lbl">Radar Leads</div><div class="sub">Visible named leads</div></div>
      <div class="stat"><div class="num">${d.investors.length}</div><div class="lbl">Investors</div><div class="sub">Pipeline records</div></div>
      <div class="stat"><div class="num">${d.investors.filter(x=>x.grade==="A").length}</div><div class="lbl">A Leads</div><div class="sub">Highest priority</div></div>
      <div class="stat"><div class="num">${d.cpas.length}</div><div class="lbl">CPA Partners</div><div class="sub">Referral network</div></div>
    </div>
    <div class="grid2" style="margin-top:16px">
      <div class="panel"><div class="panel-hd"><div><div class="panel-title">Quick Actions</div><div class="panel-sub">Cleaner execution buttons</div></div></div>
        <div class="panel-bd grid">
          <button class="btn btn-primary btn-full" onclick="setPage('radar')">📡 Load / Add Radar Leads</button>
          <button class="btn btn-teal btn-full" onclick="setPage('npi')">🏥 Search NPI Physicians</button>
          <button class="btn btn-ghost btn-full" onclick="setPage('salesnav')">🧭 Sales Navigator Tools</button>
          <button class="btn btn-ghost btn-full" onclick="setPage('callcoach')">🎙️ Call Coach</button>
          <button class="btn btn-ghost btn-full" onclick="setPage('brief')">🌅 Morning Brief</button>
        </div>
      </div>
      <div class="panel"><div class="panel-hd"><div><div class="panel-title">Top Leads by Score</div><div class="panel-sub">Names always visible, A first</div></div></div><div class="panel-bd">${recordTable(top,"lead")}</div></div>
    </div>
    <div class="panel" style="margin-top:16px"><div class="panel-hd"><div><div class="panel-title">Recent Activity</div><div class="panel-sub">Latest system actions</div></div></div><div class="panel-bd">${activityHtml()}</div></div>`;
}
function activityHtml(){
  const a=Store.data.activity.slice(0,12);
  return a.length ? a.map(x=>`<div class="card"><div class="card-title">${esc(x.text)}</div><div class="card-meta">${esc(x.ts)}</div></div>`).join("") : `<div class="empty"><div class="icon">📋</div><h3>No activity yet</h3><p>Load radar or log a note.</p></div>`;
}
function renderRadar(){
  $("page-radar").innerHTML = `
  <div class="grid2">
    <div class="panel"><div class="panel-hd"><div><div class="panel-title">Manual Lead / Signal</div><div class="panel-sub">Only named contacts should become leads</div></div></div>
      <div class="panel-bd">
        <div class="field"><label class="label">Name</label><input id="manualName" class="input" placeholder="Dr. Sarah Chen"></div>
        <div class="row2"><div class="field"><label class="label">Title / Role</label><input id="manualTitle" class="input" placeholder="Orthopedic Surgeon / Owner"></div><div class="field"><label class="label">Company</label><input id="manualCompany" class="input" placeholder="Smith Orthopedics"></div></div>
        <div class="row2"><div class="field"><label class="label">Email / Phone / LinkedIn</label><input id="manualContact" class="input" placeholder="email, phone, or LinkedIn"></div><div class="field"><label class="label">Location</label><input id="manualLocation" class="input" placeholder="Dallas, TX"></div></div>
        <div class="field"><label class="label">Signal / Notes</label><textarea id="manualSignal" class="textarea" placeholder="Why are they a fit?"></textarea></div>
        <button class="btn btn-primary btn-full" onclick="manualAddLead()">+ Add Lead / Signal</button>
      </div>
    </div>
    <div class="panel"><div class="panel-hd"><div><div class="panel-title">Loaded Radar Leads</div><div class="panel-sub">Names visible immediately, sorted A to D</div></div><button class="btn btn-primary btn-sm" onclick="loadSharedRadarClick()">Reload Shared GitHub Radar</button></div><div class="panel-bd">${recordTable(Store.data.leads,"lead")}</div></div>
  </div>`;
}
function manualAddLead(){
  const contact=$("manualContact").value.trim();
  const lead={id:id("lead"),name:$("manualName").value.trim(),title:$("manualTitle").value.trim(),company:$("manualCompany").value.trim(),location:$("manualLocation").value.trim(),signal:$("manualSignal").value.trim(),source:"Manual",day:1,status:"Open",tasksDone:[],tags:["Manual"]};
  if(!lead.name) return toast("Name required");
  if(/@/.test(contact)) lead.email=contact; else if(/linkedin/i.test(contact)) lead.linkedin=contact; else if(/\d{7,}/.test(contact.replace(/\D/g,""))) lead.phone=contact; else lead.sourceUrl=contact;
  scoreRecord(lead);
  if(!existsByIdentity(Store.data.leads,lead)){ Store.data.leads.push(lead); Store.addActivity("Manual lead added: "+lead.name); Store.save(); }
  toast("Lead added"); renderAll();
}
function renderLeads(){
  const open=Store.data.leads.filter(x=>x.status==="Open").sort(sortByQuality);
  const counts=BasinConfig.stages.map(s=>open.filter(x=>(x.day||1)===s.day).length);
  $("page-leads").innerHTML = `
    <div class="stage-grid">${BasinConfig.stages.slice(0,10).map((s,i)=>`<div class="stage-box ${i===0?"active":""}" onclick="filterLeadDay(${s.day})"><div class="stage-num">${counts[i]}</div><div class="stage-lbl">${s.label}</div></div>`).join("")}</div>
    <div class="toolbar"><input id="leadSearch" class="input" placeholder="Search name, company, signal..." oninput="renderLeadsFiltered()"><select id="leadGrade" class="select" onchange="renderLeadsFiltered()"><option value="">All Grades</option><option>A</option><option>B</option><option>C</option><option>D</option></select><select id="leadDay" class="select" onchange="renderLeadsFiltered()"><option value="">All Days</option>${BasinConfig.stages.map(s=>`<option value="${s.day}">${s.label}</option>`).join("")}</select></div>
    <div id="leadsTable">${recordTable(open,"lead")}</div>`;
}
function filterLeadDay(day){ $("leadDay").value=day; renderLeadsFiltered(); }
function renderLeadsFiltered(){
  const q=norm($("leadSearch").value), g=$("leadGrade").value, day=$("leadDay").value;
  const rows=Store.data.leads.filter(x=>x.status==="Open").filter(x=>(!q||norm([x.name,x.company,x.signal,x.title].join(" ")).includes(q))&&(!g||x.grade===g)&&(!day||String(x.day||1)===String(day))).sort(sortByQuality);
  $("leadsTable").innerHTML = recordTable(rows,"lead");
}
function renderInvestors(){
  $("page-investors").innerHTML = `<div class="toolbar"><input id="invSearch" class="input" placeholder="Search investor..." oninput="renderInvestorsFiltered()"><select id="invGrade" class="select" onchange="renderInvestorsFiltered()"><option value="">All Grades</option><option>A</option><option>B</option><option>C</option><option>D</option></select></div><div id="investorTable">${recordTable(Store.data.investors,"investor")}</div>`;
}
function renderInvestorsFiltered(){
  const q=norm($("invSearch").value), g=$("invGrade").value;
  $("investorTable").innerHTML = recordTable(Store.data.investors.filter(x=>(!q||norm([x.name,x.company,x.title].join(" ")).includes(q))&&(!g||x.grade===g)),"investor");
}
function renderCpas(){ $("page-cpas").innerHTML = `<div class="toolbar"><button class="btn btn-primary" onclick="quickAddCpa()">+ Add CPA</button></div>${recordTable(Store.data.cpas,"cpa")}`; }
function renderSalesNav(){
  const queue=Store.data.salesNav.inmail.queue.map(id=>Store.data.investors.find(x=>x.id===id)).filter(Boolean);
  $("page-salesnav").innerHTML = `<div class="grid2"><div class="panel"><div class="panel-hd"><div><div class="panel-title">Sales Navigator Searches</div><div class="panel-sub">Manual, no scraping</div></div></div><div class="panel-bd grid">${BasinConfig.salesNavSearches.map(s=>`<a class="btn btn-ghost btn-full" target="_blank" href="https://www.linkedin.com/sales/search/people?keywords=${encodeURIComponent(s[1])}">${esc(s[0])}</a>`).join("")}</div></div><div class="panel"><div class="panel-hd"><div><div class="panel-title">InMail Queue</div><div class="panel-sub">${50-Number(Store.data.salesNav.inmail.used||0)} remaining this month</div></div></div><div class="panel-bd">${recordTable(queue.length?queue:Store.data.investors.filter(x=>["A","B"].includes(x.grade)&&!x.email).slice(0,20),"investor")}</div></div></div>`;
}
function renderNpi(){
  $("page-npi").innerHTML = `<div class="grid2"><div class="panel"><div class="panel-hd"><div><div class="panel-title">NPI Physician Finder</div><div class="panel-sub">Federal public registry, no API key</div></div></div><div class="panel-bd"><div class="field"><label class="label">Specialty</label><select id="npiSpecialty" class="select"><option>Orthopedic Surgery</option><option>Cardiology</option><option>Gastroenterology</option><option>Dermatology</option><option>Ophthalmology</option><option>Plastic Surgery</option><option>Neurology</option><option>Anesthesiology</option><option>Radiology</option><option>Urology</option><option>Internal Medicine</option><option>Family Medicine</option><option>Psychiatry</option><option>Oral Surgery</option></select></div><div class="row3"><input id="npiState" class="input" value="TX"><input id="npiCity" class="input" placeholder="City"><select id="npiLimit" class="select"><option>20</option><option>50</option><option>100</option></select></div><br><button class="btn btn-primary btn-full" onclick="searchNpi()">Search NPI</button></div></div><div class="panel"><div class="panel-hd"><div><div class="panel-title">NPI Results</div><div class="panel-sub">Add named physicians to pipeline</div></div></div><div class="panel-bd" id="npiResults"><div class="empty"><h3>No search yet</h3></div></div></div></div>`;
}
async function searchNpi(){
  const url=new URL("https://npiregistry.cms.hhs.gov/api/");
  url.searchParams.set("version","2.1"); url.searchParams.set("taxonomy_description",$("npiSpecialty").value); url.searchParams.set("state",$("npiState").value); if($("npiCity").value) url.searchParams.set("city",$("npiCity").value); url.searchParams.set("limit",$("npiLimit").value);
  $("npiResults").innerHTML="Searching...";
  const data=await (await fetch(url)).json(); const arr=data.results||[];
  window._npi=arr;
  $("npiResults").innerHTML = arr.map((x,i)=>{ const b=x.basic||{}, a=(x.addresses||[]).find(a=>a.address_purpose==="LOCATION")||(x.addresses||[])[0]||{}, t=(x.taxonomies||[])[0]||{}; const name=[b.first_name,b.last_name].filter(Boolean).join(" ")||b.organization_name; return `<div class="card"><div class="card-top"><div><div class="card-title">${esc(name)}</div><div class="card-meta">${esc(b.credential||"")} • ${esc(t.desc||"")} • ${esc([a.city,a.state].filter(Boolean).join(", "))}</div><div style="margin-top:7px">${a.telephone_number?`<span class="pill green">${esc(fmtPhone(a.telephone_number))}</span>`:""}</div></div><button class="btn btn-primary btn-sm" onclick="addNpi(${i})">Add</button></div></div>`}).join("") || "<div class='empty'><h3>No results</h3></div>";
}
function fmtPhone(p){ p=String(p||"").replace(/\D/g,""); return p.length===10?`(${p.slice(0,3)}) ${p.slice(3,6)}-${p.slice(6)}`:p; }
function addNpi(i){ const x=window._npi[i], b=x.basic||{}, a=(x.addresses||[]).find(a=>a.address_purpose==="LOCATION")||(x.addresses||[])[0]||{}, t=(x.taxonomies||[])[0]||{}; const inv={id:id("inv"),name:[b.first_name,b.last_name].filter(Boolean).join(" ")||b.organization_name,title:[b.credential,t.desc].filter(Boolean).join(" • "),company:b.organization_name||"",location:[a.city,a.state].filter(Boolean).join(", "),phone:fmtPhone(a.telephone_number),source:"NPI Registry",tags:["NPI","Physician"],status:"New"}; scoreRecord(inv); if(!existsByIdentity(Store.data.investors,inv)) Store.data.investors.push(inv); Store.save(); toast("NPI lead added"); renderAll(); }
function renderCsv(){ $("page-csv").innerHTML = `<div class="panel"><div class="panel-hd"><div><div class="panel-title">CSV Import</div><div class="panel-sub">Sales Navigator manual CSV or HubSpot export</div></div></div><div class="panel-bd"><textarea id="csvText" class="textarea" style="min-height:180px" placeholder="First Name,Last Name,Title,Company,Email,LinkedIn Profile URL,Location,Note"></textarea><br><br><button class="btn btn-primary" onclick="importCsvText()">Import CSV</button></div></div>`; }
function importCsvText(){ const rows=parseCsv($("csvText").value); if(rows.length<2)return toast("Paste CSV first"); const h=rows[0].map(x=>x.trim().toLowerCase()); let added=0; rows.slice(1).forEach(r=>{ const get=n=>r[h.findIndex(x=>x.includes(n))]||""; const name=([get("first"),get("last")].filter(Boolean).join(" ")||get("name")).trim(); const inv={id:id("inv"),name,title:get("title"),company:get("company"),email:get("email"),linkedin:get("linkedin"),location:get("location"),signal:get("note"),source:"CSV Import",tags:["CSV"]}; scoreRecord(inv); if(name&&!existsByIdentity(Store.data.investors,inv)){Store.data.investors.push(inv);added++;}}); Store.save(); toast(`${added} imported`); renderAll(); }
function parseCsv(text){ const rows=[]; let row=[],cur="",q=false; for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1]; if(c=='"'&&q&&n=='"'){cur+='"';i++;}else if(c=='"')q=!q;else if(c==","&&!q){row.push(cur);cur="";}else if((c=="\n"||c=="\r")&&!q){if(c=="\r"&&n=="\n")i++;row.push(cur);if(row.some(x=>x.trim()))rows.push(row);row=[];cur="";}else cur+=c;} row.push(cur); if(row.some(x=>x.trim()))rows.push(row); return rows; }
function renderSequences(){ $("page-sequences").innerHTML = `<div class="brief">Sequence Builder V4 placeholder is clean and ready for the next migration step. Current priority was fixing visible names, lead workflow, data import, and unified tools.</div>`; }
function renderCallNotes(){ $("page-callnotes").innerHTML = `<div class="panel"><div class="panel-hd"><div><div class="panel-title">Log Call Note</div></div></div><div class="panel-bd"><div class="row2"><input id="noteName" class="input" placeholder="Name"><input id="noteObj" class="input" placeholder="Objection"></div><br><textarea id="noteText" class="textarea" placeholder="Call notes"></textarea><br><br><button class="btn btn-primary" onclick="saveCallNote()">Save Note</button></div></div>${Store.data.notes.slice(0,20).map(n=>`<div class="card"><div class="card-title">${esc(n.name||n.type)}</div><div class="card-meta">${esc(n.ts)}</div><div class="card-note">${esc(n.text||n.objection)}</div></div>`).join("")}`; }
function saveCallNote(){ Store.data.notes.unshift({id:id("note"),name:$("noteName").value,type:"Call Note",objection:$("noteObj").value,text:$("noteText").value,ts:new Date().toLocaleString()}); Store.addActivity("Call note logged: "+$("noteName").value); Store.save(); renderAll(); toast("Note saved"); }
function renderCallCoach(){ const counts={}; Store.data.notes.forEach(n=>{const k=(n.objection||"").toLowerCase(); if(k)counts[k]=(counts[k]||0)+1;}); const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]; $("page-callcoach").innerHTML = `<div class="highlight"><h2>${top?`Most common objection: ${esc(top[0])}`:"No objection history yet"}</h2><p style="color:var(--muted);margin-top:6px">${top?`${top[1]} occurrence(s). Use the response below.`:"Log call notes to prioritize coaching."}</p></div><br><div class="brief">Acknowledge. Reframe. Ask for the next small commitment.\n\nCPA objection example:\n“Absolutely, you should involve your CPA. The reason for a short director call first is so you know whether there is even anything worth asking them to review. If it looks relevant, then your CPA can evaluate the tax side before any decision.”</div>`; }
function buildMorningBrief(){ const top=Store.data.investors.concat(Store.data.leads).sort(sortByQuality).slice(0,5); const text=`BASIN MORNING BRIEF\n\nHighest leverage action: work the top A/B leads with named contacts and contact routes first.\n\nTop leads:\n${top.map((x,i)=>`${i+1}. ${x.name} — ${x.grade}${x.score} — ${x.title||""} ${x.company||""}`).join("\n")}\n\nOpen radar leads: ${Store.data.leads.filter(x=>x.status==="Open").length}\nInvestor pipeline: ${Store.data.investors.length}\nCPA partners: ${Store.data.cpas.length}\n\nFocus: do not chase city names, articles, or records with no contact path. Move usable leads forward and disposition the rest.`; Store.data.morningBrief=text; Store.addActivity("Morning brief built."); Store.save(); renderBrief(); toast("Morning brief built"); }
function renderBrief(){ $("page-brief").innerHTML = `<div class="panel"><div class="panel-hd"><div><div class="panel-title">Morning Brief</div><div class="panel-sub">Built from current V4 data</div></div><button class="btn btn-primary btn-sm" onclick="buildMorningBrief()">Build</button></div><div class="panel-bd"><div class="brief">${esc(Store.data.morningBrief||"No brief yet. Click Build Morning Brief.")}</div></div></div>`; }
function renderSettings(){ $("page-settings").innerHTML = `<div class="grid2"><div class="panel"><div class="panel-hd"><div><div class="panel-title">Storage + Migration</div></div></div><div class="panel-bd"><button class="btn btn-primary btn-full" onclick="manualLegacyImport()">Import Old Basin OS Browser Data</button><br><br><button class="btn btn-ghost btn-full" onclick="Store.export()">Export V4 Backup</button></div></div><div class="panel"><div class="panel-hd"><div><div class="panel-title">API Settings</div></div></div><div class="panel-bd"><label class="label">Groq API Key</label><input id="groqKey" class="input" type="password" value="${esc(Store.data.settings.groqKey||"")}"><br><br><button class="btn btn-primary" onclick="saveSettings()">Save Settings</button></div></div></div>`; }
function saveSettings(){ Store.data.settings.groqKey=$("groqKey").value; Store.save(); renderAll(); toast("Settings saved"); }
function manualLegacyImport(){ const r=Store.importLegacy(); toast(r.ok?"Legacy imported":r.reason); renderAll(); }
function quickAddInvestor(){ const name=prompt("Investor name"); if(!name)return; const inv={id:id("inv"),name,status:"New",source:"Manual"}; scoreRecord(inv); Store.data.investors.push(inv); Store.save(); renderAll(); }
function quickAddCpa(){ const name=prompt("CPA name / firm"); if(!name)return; Store.data.cpas.push({id:id("cpa"),name,firm:name,score:72,grade:"B",status:"Prospect",source:"Manual"}); Store.save(); renderAll(); }
function queueInMail(idv){ const q=Store.data.salesNav.inmail.queue; if(!q.includes(idv)) q.push(idv); Store.save(); toast("Queued for InMail"); renderAll(); }
function sequenceFor(idv){ setPage("sequences"); }
function logTouch(idv){ const r=Store.data.investors.find(x=>x.id===idv); setPage("callnotes"); setTimeout(()=>{ if($("noteName")) $("noteName").value=r?.name||""; },50); }
function cpaActivation(idv){ setPage("sequences"); }
function logCpaNote(idv){ setPage("callnotes"); }
init();
