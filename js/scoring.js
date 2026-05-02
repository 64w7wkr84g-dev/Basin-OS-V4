function scoreRecord(r){
  const blob = [r.name,r.title,r.company,r.location,r.source,r.signal,(r.tags||[]).join(" ")].join(" ").toLowerCase();
  let s = Number(r.score || 45);
  const hasHuman = /\b[a-z]+ [a-z]+\b/i.test(r.name||"");
  const contact = !!(r.email || r.phone || r.linkedin || r.sourceUrl);
  if(hasHuman) s += 12; else s -= 25;
  if(contact) s += 12; else s -= 18;
  if(/physician|doctor|surgeon|orthopedic|cardiology|gastro|dermatology|urology|radiology|medical practice|clinic/.test(blob)) s += 23;
  if(/owner|founder|ceo|president|principal|partner|managing|executive|director/.test(blob)) s += 18;
  if(/cpa|tax|accounting|advisor/.test(blob)) s += 14;
  if(/law firm|attorney|partner/.test(blob)) s += 11;
  if(/oil|gas|energy|mineral|royalty|idc|depletion/.test(blob)) s += 12;
  if(/texas|tx|dallas|fort worth|houston|austin|midland|odessa|san antonio/.test(blob)) s += 5;
  if(/referral/.test(blob)) s += 20;
  s = Math.max(1, Math.min(99, Math.round(s)));
  r.score = s;
  r.grade = s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : "D";
  return r;
}
function classifyICP(r){
  const blob = [r.title,r.company,r.signal,(r.tags||[]).join(" ")].join(" ").toLowerCase();
  for(const [k, words] of Object.entries(BasinConfig.icpKeywords)){
    if(words.some(w => blob.includes(w))) return k;
  }
  return "general";
}
function gradeRank(g){ return ({A:4,B:3,C:2,D:1}[g] || 0); }
function sortByQuality(a,b){ return gradeRank(b.grade)-gradeRank(a.grade) || (b.score||0)-(a.score||0) || String(a.name||"").localeCompare(String(b.name||"")); }
function hasContact(r){ return !!(r.email || r.phone || r.linkedin || r.sourceUrl); }
function isUsLikely(r){ return !r.location || /usa|united states|tx|texas|ca|ny|fl|az|co|ok|la|ga|nc|sc|tn|oh|pa|il|dallas|houston|austin|fort worth|midland|denver|phoenix|chicago|new york|los angeles/i.test([r.location,r.signal,r.source].join(" ")); }
