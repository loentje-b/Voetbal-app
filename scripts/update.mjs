import fs from 'node:fs';
const UA={'User-Agent':'Mozilla/5.0 (compatible; VoetbalApp/1.0)'};
const Q=(q,en)=>`https://news.google.com/rss/search?q=${encodeURIComponent(q+' when:2d')}&hl=${en?'en-GB':'nl'}&gl=${en?'GB':'NL'}&ceid=${en?'GB:en':'NL:nl'}`;
const NL=u=>({u,l:'nl'}),EN=u=>({u,l:'en'});
// Voeg hier eigen feeds toe. NL = Nederlands, EN = Engels (wordt vertaald).
const FEEDS={
nieuws:[NL('https://feeds.nos.nl/nossportvoetbal'),NL(Q('FC Groningen')),NL(Q('Keuken Kampioen Divisie')),NL(Q('Eredivisie')),NL(Q('Premier League OR La Liga OR Serie A OR Bundesliga OR Ligue 1 voetbal')),NL(Q('KNVB Beker OR FA Cup OR Copa del Rey OR DFB-Pokal OR Coppa Italia')),NL(Q('Oranje voetbal interland')),NL(Q('Liverpool voetbal')),EN('https://feeds.bbci.co.uk/sport/football/rss.xml'),EN('https://www.theguardian.com/football/liverpool/rss')],
transfers:[NL(Q('transfer voetbal officieel')),NL(Q('FC Groningen transfer')),NL(Q('Liverpool transfer')),EN(Q('transfer news confirmed',1))],
blessures:[NL(Q('voetbal blessure geblesseerd')),NL(Q('FC Groningen blessure')),NL(Q('Liverpool blessure')),EN(Q('football injury update ruled out',1))],
geruchten:[NL(Q('transfergerucht voetbal')),NL(Q('Liverpool gerucht')),EN(Q('transfer rumours linked',1))],
meningen:[NL(Q('voetballer interview zegt over')),NL(Q('oud-voetballer analyse mening')),EN(Q('footballer interview says reflects',1))]};
const COMPS={PL:'Premier League',PD:'La Liga',SA:'Serie A',BL1:'Bundesliga',FL1:'Ligue 1',DED:'Eredivisie',CL:'Champions League'};
const MAX_EN=6;
// Clickbait-filter: titels die hierop matchen worden weggelaten. Pas gerust aan.
const BAIT=/(geloof je|je gelooft|you won'?t believe|unbelievable|shocking|schokkend|ongelooflijk|bizar|\bwow\b|moet je zien|dit moet je|wat er daarna|dit is waarom|here'?s why|going viral|gaat viraal|sensati|\?\s*$|!|…|\.\.\.$|\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b)/i;
const BAIT_CAPS=/\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b/;
const ent=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n));
const clean=s=>ent(s.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const tag=(s,n)=>{const m=s.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`));return m?clean(m[1]):''};
const isBait=t=>BAIT.test(t)&&!(/^[^A-Z]*$/.test(t)&&false)||BAIT_CAPS.test(t);
async function rss({u,l}){try{const x=await(await fetch(u,{headers:UA,signal:AbortSignal.timeout(15000)})).text();
return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>{const i=m[1],src=tag(i,'source'),d=new Date(tag(i,'pubDate'));let title=tag(i,'title');
if(src&&title.endsWith(' - '+src))title=title.slice(0,-src.length-3);
const link=ent(i.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'').trim()||'');
const google=/news\.google\./.test(link);
return{title,url:link,date:isNaN(d)?new Date().toISOString():d.toISOString(),source:src||new URL(u).hostname.replace(/^(www|feeds)\./,''),lang:l,text:google?'':tag(i,'description').slice(0,600)}})}catch(e){console.log('fout',u,e.message);return[]}}
const cache=new Map();
async function body(url){if(cache.has(url))return cache.get(url);
const p=(async()=>{try{const r=await fetch(url,{headers:UA,redirect:'follow',signal:AbortSignal.timeout(12000)});
if(/google\./.test(new URL(r.url).hostname))return{url,text:''};
const h=await r.text();const ps=[...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m=>clean(m[1])).filter(p=>p.length>70&&!/cookie|javascript|abonn/i.test(p));
let t='';for(const p of ps){if((t+p).length>1100)break;t+=(t?'\n\n':'')+p}
if(!t){const m=h.match(/<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]*)"/i);t=m?clean(m[1]):''}
return{url:r.url,text:t}}catch{return{url,text:''}}})();cache.set(url,p);return p}
const EMAIL=process.env.MYMEMORY_EMAIL||'';let trOff=false;
async function tr(t){if(!t||trOff)return null;const ch=[];let c='';
for(const s of t.split(/(?<=[.!?])\s+/)){if((c+' '+s).length>450&&c){ch.push(c);c=s}else c+=(c?' ':'')+s}if(c)ch.push(c);
try{const out=[];for(const x of ch){const r=await(await fetch('https://api.mymemory.translated.net/get?langpair=en|nl&q='+encodeURIComponent(x.slice(0,450))+(EMAIL?'&de='+encodeURIComponent(EMAIL):''))).json();
if(r.responseStatus!=200)throw new Error('limiet');out.push(ent(r.responseData.translatedText))}return out.join(' ')}catch(e){console.log('vertalen uit:',e.message);trOff=true;return null}}
fs.mkdirSync('data',{recursive:true});
const tabs={};let dropped=0;
for(const[k,us]of Object.entries(FEEDS)){const seen=new Set();
let items=(await Promise.all(us.map(rss))).flat().filter(i=>{if(!i.title||seen.has(i.title))return false;seen.add(i.title);if(isBait(i.title)){dropped++;return false}return true}).sort((a,b)=>b.date.localeCompare(a.date));
let en=0;items=items.filter(i=>i.lang!=='en'||++en<=MAX_EN).slice(0,30);
for(let n=0;n<items.length;n+=6)await Promise.all(items.slice(n,n+6).map(async i=>{const b=await body(i.url);if(b.text)i.text=b.text;i.url=b.url||i.url}));
for(const i of items){i.mine=/groningen|liverpool/i.test(i.title);if(i.lang==='en'){const t=await tr(i.title);if(t)i.nl={title:t,text:await tr((i.text||'').slice(0,500))||''}}}
tabs[k]=items}
console.log('clickbait weggelaten:',dropped);
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
const T=i=>i.nl?.title||i.title;
const mine=tabs.nieuws.filter(i=>i.mine).slice(0,2),rest=tabs.nieuws.filter(i=>!i.mine).slice(0,4);
const res=matches.filter(m=>m.status==='FINISHED'&&/groningen|liverpool/i.test(m.home+m.away)).slice(-2).map(m=>`⚽ ${m.home} ${m.hs}-${m.as} ${m.away}`);
const body=[...res,...mine.map(i=>'★ '+T(i)),...rest.map(i=>'• '+T(i))].join('\n')||'Geen nieuws gevonden.';
const h={Title:'Voetbal van vandaag'};if(process.env.APP_URL)h.Click=process.env.APP_URL;
await fetch('https://ntfy.sh/'+process.env.NTFY_TOPIC,{method:'POST',headers:h,body:Buffer.from(body)})}
