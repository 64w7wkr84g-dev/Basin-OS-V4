const Store = {
  data: null,
  blank(){
    return {
      leads: [],
      investors: [],
      cpas: [],
      notes: [],
      tasks: [],
      activity: [],
      settings: { groqKey:"", groqModel:"llama-3.3-70b-versatile" },
      salesNav: { inmail:{ used:0, resetDate:"", queue:[] }, savedSearches:[] },
      imports: { legacyImported:false }
    };
  },
  load(){
    try{
      const raw = localStorage.getItem(BasinConfig.storeKey);
      this.data = raw ? JSON.parse(raw) : this.blank();
    }catch(e){ this.data = this.blank(); }
    this.normalize();
    return this.data;
  },
  save(){
    this.normalize();
    localStorage.setItem(BasinConfig.storeKey, JSON.stringify(this.data));
    return this.data;
  },
  normalize(){
    const d = this.data || this.blank();
    ["leads","investors","cpas","notes","tasks","activity"].forEach(k => { if(!Array.isArray(d[k])) d[k]=[]; });
    d.settings = Object.assign({groqKey:"", groqModel:"llama-3.3-70b-versatile"}, d.settings||{});
    d.salesNav = d.salesNav || {};
    d.salesNav.inmail = Object.assign({used:0, resetDate:"", queue:[]}, d.salesNav.inmail||{});
    d.salesNav.savedSearches = Array.isArray(d.salesNav.savedSearches) ? d.salesNav.savedSearches : [];
    d.imports = Object.assign({legacyImported:false}, d.imports||{});
    this.data = d;
  },
  export(){
    const blob = new Blob([JSON.stringify(this.data,null,2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "basin-os-v4-backup-" + new Date().toISOString().slice(0,10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  },
  async importFile(file){
    const text = await file.text();
    const obj = JSON.parse(text);
    this.data = Object.assign(this.blank(), obj);
    this.normalize();
    this.save();
  },
  importLegacy(){
    const raw = localStorage.getItem(BasinConfig.legacyStoreKey);
    if(!raw) return {ok:false, reason:"No old Basin OS localStorage found on this browser."};
    let old;
    try{ old = JSON.parse(raw); }catch(e){ return {ok:false, reason:"Old store was not valid JSON."}; }
    const before = {leads:this.data.leads.length, investors:this.data.investors.length, cpas:this.data.cpas.length};
    const addMany = (arr, target, mapper) => (Array.isArray(arr)?arr:[]).forEach(x => {
      const y = mapper(x);
      if(y && !existsByIdentity(this.data[target], y)) this.data[target].push(y);
    });
    addMany(old.radarLeads, "leads", legacyToLead);
    addMany(old.investors, "investors", legacyToInvestor);
    addMany(old.cpas, "cpas", legacyToCpa);
    if(Array.isArray(old.notes)) this.data.notes = mergeById(this.data.notes, old.notes.map(legacyToNote));
    this.data.imports.legacyImported = true;
    this.addActivity("Imported legacy Basin OS browser data.");
    this.save();
    return {ok:true, before, after:{leads:this.data.leads.length, investors:this.data.investors.length, cpas:this.data.cpas.length}};
  },
  addActivity(text){
    this.data.activity.unshift({id:id("act"), text, ts:new Date().toLocaleString()});
    this.data.activity = this.data.activity.slice(0,100);
  }
};

function id(prefix){ return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2); }
function norm(s){ return String(s||"").trim().toLowerCase().replace(/[^a-z0-9]+/g," "); }
function existsByIdentity(arr, item){
  return arr.some(x => {
    if(item.id && x.id === item.id) return true;
    if(item.linkedin && x.linkedin && norm(item.linkedin) === norm(x.linkedin)) return true;
    if(item.email && x.email && norm(item.email) === norm(x.email)) return true;
    return norm(x.name) && norm(x.name) === norm(item.name) && norm(x.company) === norm(item.company);
  });
}
function mergeById(a,b){
  const out = [...a];
  b.forEach(x => { if(!out.some(y => y.id===x.id)) out.push(x); });
  return out;
}
function legacyToLead(x){
  const lead = {
    id: x.id || id("lead"),
    name: cleanLeadName(x.name || x.title || x.person || x.contactName || ""),
    title: x.title || x.role || x.signalType || "",
    company: x.company || x.firm || "",
    location: x.location || x.region || "",
    source: x.source || x.sourceName || "Legacy Radar",
    sourceUrl: x.sourceUrl || x.url || "",
    signal: x.signal || x.notes || x.why || x.summary || "",
    email: x.email || "",
    phone: x.phone || "",
    linkedin: x.linkedin || x.linkedinUrl || "",
    score: Number(x.score || 0),
    grade: x.grade || "",
    day: Number(x.day || 1),
    status: x.status || "Open",
    tasksDone: Array.isArray(x.tasksDone) ? x.tasksDone : [],
    tags: Array.isArray(x.tags) ? x.tags : []
  };
  scoreRecord(lead);
  return lead;
}
function legacyToInvestor(x){
  const inv = {
    id:x.id || id("inv"), name:cleanLeadName(x.name||""), title:x.title||x.role||"", company:x.company||"",
    location:x.location||"", email:x.email||"", phone:x.phone||"", linkedin:x.linkedin||x.linkedinUrl||"",
    source:x.source||"Legacy", signal:x.signal||x.notes||"", score:Number(x.score||0), grade:x.grade||"",
    status:x.status||"New", nextAction:x.nextAction||"", tags:Array.isArray(x.tags)?x.tags:[]
  };
  scoreRecord(inv);
  return inv;
}
function legacyToCpa(x){
  return {id:x.id||id("cpa"), name:x.name||"", firm:x.firm||x.company||"", focus:x.focus||x.title||"CPA", location:x.location||"", score:Number(x.score||72), grade:x.grade||"B", status:x.status||"Prospect", source:x.source||"Legacy", tags:Array.isArray(x.tags)?x.tags:[]};
}
function legacyToNote(x){ return {id:x.id||id("note"), name:x.name||"", type:x.type||x.outcome||"Call Note", text:x.text||x.notes||"", objection:x.objection||"", ts:x.ts||x.date||new Date().toLocaleString()}; }
function cleanLeadName(n){
  n = String(n||"").trim();
  if(!n) return "";
  if(/^(houston|dallas|austin|san antonio|los angeles|new york|chicago|phoenix|denver|midland|okc|nationwide)$/i.test(n)) return "";
  if(/email addresses|via llp|licensure supervision/i.test(n)) return "";
  return n;
}
