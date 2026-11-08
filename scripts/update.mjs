import fs from 'node:fs';
const UA={'User-Agent':'Mozilla/5.0 (compatible; VoetbalApp/1.0)'};
const H=36e5,now=Date.now();
const FRESH_H=12;      // alleen nieuws van de laatste 12 uur in de ochtendmelding
const RESULT_H=10;     // alleen uitslagen van de laatste 10 uur
const Q=(q,en)=>`https://news.google.com/rss/search?q=${encodeURIComponent(q+' when:2d')}&hl=${en?'en-GB':'nl'}&gl=${en?'GB':'NL'}&ceid=${en?'GB:en':'NL:nl'}`;
const NL=(u,d)=>({u,l:'nl',d}),EN=(u,d)=>({u,l:'en',d});
const FEEDS={
nieuws:[NL('https://feeds.nos.nl/nossportvoetbal',1),NL(Q('FC Groningen')),NL(Q('Keuken Kampioen Divisie')),NL(Q('Eredivisie')),NL(Q('Premier League OR La Liga OR Serie A OR Bundesliga OR Ligue 1 voetbal')),NL(Q('KNVB Beker OR FA Cup OR Copa del Rey OR DFB-Pokal OR Coppa Italia')),NL(Q('Oranje voetbal interland')),NL(Q('Liverpool voetbal')),EN('https://feeds.bbci.co.uk/sport/football/rss.xml',1),EN('https://www.theguardian.com/football/liverpool/rss',1)],
transfers:[NL(Q('transfer voetbal officieel')),NL(Q('FC Groningen transfer')),NL(Q('Liverpool transfer')),EN(Q('transfer news confirmed',1))],
blessures:[NL(Q('voetbal blessure geblesseerd')),NL(Q('FC Groningen blessure')),NL(Q('Liverpool blessure')),EN(Q('football injury update ruled out',1))],
geruchten:[NL(Q('transfergerucht voetbal')),NL(Q('Liverpool gerucht')),EN(Q('transfer rumours linked',1))],
meningen:[NL(Q('voetballer interview zegt over')),NL(Q('oud-voetballer analyse mening')),EN(Q('footballer interview says reflects',1))]};
const COMPS={PL:'Premier League',PD:'La Liga',SA:'Serie A',BL1:'Bundesliga',FL1:'Ligue 1',DED:'Eredivisie',CL:'Champions League'};
const MAX_EN=6,MY=/groningen|liverpool/i;
const BAIT=/(geloof je|je gelooft|you won'?t believe|unbelievable|shocking|schokkend|ongelooflijk|bizar|\bwow\b|moet je zien|dit moet je|wat er daarna|dit is waarom|here'?s why|going viral|gaat viraal|sensati|\?\s*$|!|…|\.\.\.$)/i;
const BAIT_CAPS=/\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b/;
const isBait=t=>BAIT.test(t)||BAIT_CAPS.test(t);
const FOOT=/voetbal|football|soccer|eredivisie|\bkkd\b|keuken kampioen|knvb|oranje|premier league|champions league|europa league|conference league|la liga|serie a|bundesliga|ligue 1|fifa|uefa|keeper|doelman|spits|aanvaller|verdediger|middenvelder|scheidsrechter|wedstrijd|opstelling|transfer|blessure|trainer|coach|ajax|psv|feyenoord|twente|groningen|heerenveen|vitesse|sparta|utrecht|graafschap|cambuur|liverpool|arsenal|chelsea|tottenham|manchester|barcelona|real madrid|bayern|juventus|napoli|\bpsg\b/i;
const BLOCK_T=/nfl|ncaa|college|quarterback|\bqb\b|touchdown|notre dame|pensioen|pension|schaats|formule 1|verstappen|darts|tennis|handbal|volleybal|voorspelling|odds|wedtips|\btips\b|mediamarkt|korting|aanbieding|oordopjes/i;
const BLOCK_S=/bet365|bookmaker|casino|wedden|vietnam\.vn|yahoo sports|gainesville|south bend|adelaide|\bon3\b|birmingham live|head topics/i;
const BLOCK_U=/bbc\.co\.uk\/(sounds|iplayer)/;
const ENW=new Set('the and of to was that for with his her after over says from against win vs match fans team are will has have'.split(' ')),NLW=new Set('de het een van en dat niet met voor op zijn ook aan bij naar maar na wel hij'.split(' '));
const detect=t=>{const w=t.toLowerCase().match(/[a-z']+/g)||[];const c=s=>w.filter(x=>s.has(x)).length;return c(ENW)>c(NLW)?'en':'nl'};
const ent=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n));
const clean=s=>ent(s.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const tag=(s,n)=>{const m=s.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`));return m?clean(m[1]):''};
async function rss({u,l,d}){try{const x=await(await fetch(u,{headers:UA,signal:AbortSignal.timeout(15000)})).text();
return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>{const i=m[1],src=tag(i,'source'),dt=new Date(tag(i,'pubDate'));let title=tag(i,'title');
if(src&&title.endsWith(' - '+src))title=title.slice(0,-src.length-3);
const link=ent((i.match(/<link>([\s\S]*?)<\/link>/)?.[1]||'').replace(/<!\[CDATA\[|\]\]>/g,'').trim());
return{title,url:link,date:isNaN(dt)?new Date().toISOString():dt.toISOString(),source:src||new URL(u).hostname.replace(/^(www|feeds)\./,''),lang:l,d,text:/news\.google\./.test(link)?'':tag(i,'description').slice(0,600)}})}catch(e){console.log('fout',u,e.message);return[]}}
const EMAIL=process.env.MYMEMORY_EMAIL||'';let trOff=false;
async function tr(t){if(!t||trOff)return null;try{const r=await(await fetch('https://api.mymemory.translated.net/get?langpair=en|nl&q='+encodeURIComponent(t.slice(0,450))+(EMAIL?'&de='+encodeURIComponent(EMAIL):''))).json();
if(r.responseStatus!=200)throw new Error('limiet');return ent(r.responseData.translatedText)}catch(e){console.log('vertalen uit:',e.message);trOff=true;return null}}
fs.mkdirSync('data',{recursive:true});
const tabs={};let dropped=0;
for(const[k,us]of Object.entries(FEEDS)){const seen=new Set();
let items=(await Promise.all(us.map(rss))).flat().filter(i=>{if(!i.title||!i.url||seen.has(i.title))return false;seen.add(i.title);
if(now-new Date(i.date)>48*H)return false;
if(isBait(i.title)||BLOCK_S.test(i.source)||BLOCK_T.test(i.title)||BLOCK_U.test(i.url)||!(i.d||FOOT.test(i.title))){dropped++;return false}return true}).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);
items=items.map(i=>({...i,lang:i.d?i.lang:detect(i.title)}));
let en=0;items=items.filter(i=>i.lang!=='en'||++en<=MAX_EN);
for(const i of items){delete i.d;i.mine=MY.test(i.title);if(i.lang==='en'){const t=await tr(i.title);if(t)i.nl={title:t,text:''}}}
tabs[k]=items}
console.log('weggefilterd:',dropped);
fs.writeFileSync('data/news.json',JSON.stringify({updated:new Date().toISOString(),tabs}));
let matches=[],tables={};
const fd=async p=>{const r=await fetch('https://api.football-data.org/v4'+p,{headers:{'X-Auth-Token':process.env.FD_KEY}});if(!r.ok)throw new Error(p+' '+r.status);return r.json()};
if(process.env.FD_KEY){
const day=n=>new Date(now+n*864e5).toISOString().slice(0,10);
try{const j=await fd(`/matches?dateFrom=${day(-1)}&dateTo=${day(5)}`);
matches=j.matches.filter(m=>COMPS[m.competition.code]).map(m=>({comp:COMPS[m.competition.code],date:m.utcDate,home:m.homeTeam.shortName||m.homeTeam.name,away:m.awayTeam.shortName||m.awayTeam.name,hs:m.score.fullTime.home,as:m.score.fullTime.away,status:m.status}))}catch(e){console.log(e.message)}
for(const c in COMPS){try{const s=await fd(`/competitions/${c}/standings`);
tables[COMPS[c]]=s.standings.find(x=>x.type==='TOTAL').table.map(t=>({pos:t.position,team:t.team.shortName||t.team.name,pl:t.playedGames,gd:t.goalDifference,pts:t.points}))}catch(e){console.log(e.message)}}}
fs.writeFileSync('data/matches.json',JSON.stringify({matches,tables}));
// Ochtendmelding en wekdienst-tekst: alleen actueel
const T=i=>i.nl?.title||i.title,fresh=tabs.nieuws.filter(i=>now-new Date(i.date)<FRESH_H*H);
const hhmm=d=>new Date(d).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'});
const res=matches.filter(m=>m.status==='FINISHED'&&now-new Date(m.date)<RESULT_H*H&&MY.test(m.home+m.away)).map(m=>`${m.home} ${m.hs}-${m.as} ${m.away}`);
const today=matches.filter(m=>['TIMED','SCHEDULED'].includes(m.status)&&new Date(m.date)-now>0&&new Date(m.date)-now<24*H&&MY.test(m.home+m.away)).map(m=>`${m.home} - ${m.away} om ${hhmm(m.date)}`);
const mine=fresh.filter(i=>i.mine).slice(0,2),rest=fresh.filter(i=>!i.mine).slice(0,4);
const lines=[...res.map(x=>'⚽ '+x),...today.map(x=>'📅 Vandaag: '+x),...mine.map(i=>'★ '+T(i)),...rest.map(i=>'• '+T(i))];
const body=lines.join('\n')||'Geen nieuw voetbalnieuws sinds gisteravond.';
const say=['Goedemorgen. Dit is het voetbalnieuws.',...res.map(x=>'Uitslag: '+x+'.'),...today.map(x=>'Vandaag: '+x+'.'),...[...mine,...rest].map(i=>T(i).replace(/[^\p{L}\p{N}\s,.:'-]/gu,'')+'.')].join(' ');
fs.writeFileSync('data/briefing.txt',lines.length?say:'Goedemorgen. Er is geen nieuw voetbalnieuws sinds gisteravond.');
