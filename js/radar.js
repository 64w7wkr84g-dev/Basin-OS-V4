async function fetchJsonAny(urls){
  for(const url of urls){
    try{
      const res = await fetch(url + (url.includes("?") ? "&" : "?") + "v=" + Date.now(), {cache:"no-store"});
      if(res.ok) return await res.json();
    }catch(e){}
  }
  throw new Error("No radar JSON source loaded.");
}
async function loadSharedRadar(){
  const urls = [
    "data/radar-leads.json",
    "radar-leads.json",
    BasinConfig.oldRepoRawBase + "/data/radar-leads.json",
    BasinConfig.oldRepoRawBase + "/radar-leads.json"
  ];
  const data = await fetchJsonAny(urls);
  const arr = Array.isArray(data) ? data : (data.leads || data.items || data.radarLeads || []);
  let added=0, skipped=0;
  arr.forEach(x => {
    const lead = normalizeRadarLead(x);
    if(!lead.name || !hasContact(lead) || !isUsLikely(lead)){ skipped++; return; }
    if(!existsByIdentity(Store.data.leads, lead) && !existsByIdentity(Store.data.investors, lead)){
      Store.data.leads.push(lead); added++;
    } else skipped++;
  });
  Store.addActivity(`Loaded shared radar: ${added} added, ${skipped} skipped.`);
  Store.save();
  return {added, skipped};
}
function normalizeRadarLead(x){
  const lead = legacyToLead(x);
  lead.id = lead.id || id("lead");
  lead.status = lead.status || "Open";
  lead.day = Number(lead.day || 1);
  lead.tasksDone = Array.isArray(lead.tasksDone) ? lead.tasksDone : [];
  lead.source = lead.source || "Shared Radar";
  scoreRecord(lead);
  return lead;
}
function addLeadToPipeline(leadId){
  const l = Store.data.leads.find(x=>x.id===leadId);
  if(!l) return;
  const inv = Object.assign({}, l, {id:id("inv"), status:"New", nextAction:"Day " + (l.day||1) + " outreach", source:l.source||"Lead Workflow"});
  scoreRecord(inv);
  if(!existsByIdentity(Store.data.investors, inv)) Store.data.investors.push(inv);
  l.status = "Moved to Pipeline";
  Store.addActivity("Moved lead to investor pipeline: " + inv.name);
  Store.save();
  renderAll();
}
function completeLeadDay(leadId){
  const l = Store.data.leads.find(x=>x.id===leadId);
  if(!l) return;
  const stage = BasinConfig.stages[(l.day||1)-1] || BasinConfig.stages[0];
  l.tasksDone = stage.tasks.slice();
  if(l.day < 10) l.day += 1;
  l.status = "Open";
  Store.addActivity(`Completed ${l.name} and moved to Day ${l.day}.`);
  Store.save();
  renderAll();
}
function dispositionLead(leadId, status){
  const l = Store.data.leads.find(x=>x.id===leadId);
  if(!l) return;
  l.status = status;
  Store.addActivity(`${l.name} dispositioned as ${status}.`);
  Store.save();
  renderAll();
}
