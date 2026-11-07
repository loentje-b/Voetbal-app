import fs from 'node:fs';
const Q=(q,en)=>`https://news.google.com/rss/search?q=${encodeURIComponent(q+' when:2d')}&hl=${en?'en-GB':'nl'}&gl=${en?'GB':'NL'}&ceid=${en?'GB:en':'NL:nl'}`;
const FEEDS={
nieuws:['https://feeds.nos.nl/nossportvoetbal','https://feeds.bbci.co.uk/sport/football/rss.xml',Q('FC Groningen'),Q('Liverpool FC',1),Q('Keuken Kampioen Divisie'),Q('Eredivisie'),Q('Premier League OR La Liga OR Serie A OR Bundesliga OR Ligue 1',1),Q('FA Cup OR Copa del Rey OR DFB-Pokal OR Coppa Italia OR Coupe de France',1),Q('Champions League',1),Q('Oranje voetbal interland')],
transfers:[Q('transfer voetbal officieel'),Q('transfer news confirmed',1),Q('Liverpool transfer',1),Q('FC Groningen transfer')],
blessures:[Q('voetbal blessure geblesseerd'),Q('football injury update ruled out',1),Q('Liverpool injury',1),Q('FC Groningen blessure')],
geruchten:[Q('transfergerucht voetbal'),Q('transfer rumours linked',1),Q('Liverpool rumours linked',1)],
meningen:[Q('voetballer interview zegt over'),Q('oud-voetballer analyse mening'),Q('footballer interview opens up says',1),Q('pundit says legend claims',1)]};
const COMPS={PL:'Premier League',PD:'La Liga',SA:'Serie A',BL1:'Bundesliga',FL1:'Ligue 1',DED:'Eredivisie',CL:'Champions League'};
const tag=(s,n)=>{const m=s.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`));return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim():''};
async function rss(u){try{const x=await(await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}})).text();
return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>{const i=m[1],src=tag(i,'source'),d=new Date(tag(i,'pubDate'));let title=tag(i,'title');
if(src&&title.endsWith(' - '+src))title=title.slice(0,-src.length-3);
return{title,url:tag(i,'link'),date:isNaN(d)?new Date().toISOString():d.toISOString(),source:src||new URL(u).hostname.replace(/^(www|feeds)\./,'')}})}catch(e){console.log('fout',u,e.message);return[]}}
fs.mkdirSync('data',{recursive:true});
const tabs={};
for(const[k,us]of Object.entries(FEEDS)){const seen=new Set();
tabs[k]=(await Promise.all(us.map(rss))).flat().filter(i=>i.title&&!seen.has(i.title)&&seen.add(i.title)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40).map(i=>({...i,mine:/groningen|liverpool/i.test(i.title)}))}
fs.writeFileSync('data/news.json',JSON.stringify({updated:new Date().toISOString(),tabs}));
let matches=[],tables={};
const fd=async p=>{const r=await fetch('https://api.football-data.org/v4'+p,{headers:{'X-Auth-Token':process.env.FD_KEY}});if(!r.ok)throw new Error(p+' '+r.status);return r.json()};
if(process.env.FD_KEY){
const day=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
try{const j=await fd(`/matches?dateFrom=${day(-3)}&dateTo=${day(5)}`);
matches=j.matches.filter(m=>COMPS[m.competition.code]).map(m=>({comp:COMPS[m.competition.code],date:m.utcDate,home:m.homeTeam.shortName||m.homeTeam.name,away:m.awayTeam.shortName||m.awayTeam.name,hs:m.score.fullTime.home,as:m.score.fullTime.away,status:m.status}))}catch(e){console.log(e.message)}
for(const c in COMPS){try{const s=await fd(`/competitions/${c}/standings`);
tables[COMPS[c]]=s.standings.find(x=>x.type==='TOTAL').table.map(t=>({pos:t.position,team:t.team.shortName||t.team.name,pl:t.playedGames,gd:t.goalDifference,pts:t.points}))}catch(e){console.log(e.message)}}}
fs.writeFileSync('data/matches.json',JSON.stringify({matches,tables}));
if(process.env.NTFY_TOPIC){
const mine=tabs.nieuws.filter(i=>i.mine).slice(0,2),rest=tabs.nieuws.filter(i=>!i.mine).slice(0,4);
const res=matches.filter(m=>m.status==='FINISHED'&&/groningen|liverpool/i.test(m.home+m.away)).slice(-2).map(m=>`⚽ ${m.home} ${m.hs}-${m.as} ${m.away}`);
const body=[...res,...mine.map(i=>'⭐ '+i.title),...rest.map(i=>'• '+i.title)].join('\n')||'Geen nieuws gevonden.';
const h={Title:'Voetbal van vandaag'};if(process.env.APP_URL)h.Click=process.env.APP_URL;
await fetch('https://ntfy.sh/'+process.env.NTFY_TOPIC,{method:'POST',headers:h,body:Buffer.from(body)})}
