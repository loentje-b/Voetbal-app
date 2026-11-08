import fs from 'node:fs';
const KEY=process.env.GEMINI_API_KEY,MODEL=process.env.GEMINI_MODEL||'gemini-flash-latest',APP=(process.env.APP_URL||'').replace(/\/?$/,'/');
const now=Date.now(),H=36e5,MY=/groningen|liverpool/i,TZ='Europe/Amsterdam';
const rd=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}};
const news=rd('data/news.json',{tabs:{}}),M=rd('data/matches.json',{matches:[],tables:{}});
const day=d=>new Date(d).toLocaleDateString('sv-SE',{timeZone:TZ}),hm=d=>new Date(d).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:TZ}),lab=d=>new Date(d).toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:TZ});
const today=day(now);
const Q=q=>`https://news.google.com/rss/search?q=${encodeURIComponent(q+' when:7d')}&hl=nl&gl=NL&ceid=NL:nl`;
const WQ=['Eredivisie','FC Groningen','Liverpool voetbal','Premier League OR La Liga OR Serie A OR Bundesliga voetbal','Champions League voetbal','Oranje interland voetbal'];
const tg=(s,n)=>(s.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`))?.[1]||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/\s+/g,' ').trim();
async function wk(q){try{const x=await(await fetch(Q(q),{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)})).text();
return[...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>{const i=m[1],s=tg(i,'source');let t=tg(i,'title');if(s&&t.endsWith(' - '+s))t=t.slice(0,-s.length-3);return{title:t,source:s,date:new Date(tg(i,'pubDate')).getTime()}}).filter(i=>i.title&&!isNaN(i.date))}catch{return[]}}
const BLOCK=/nfl|ncaa|college|pensioen|pension|schaats|formule 1|verstappen|darts|tennis|handbal|volleybal|voorspelling|odds|\btips\b|korting|bet365|bookmaker|casino/i;
async function ping(body,click){if(!process.env.NTFY_TOPIC)return;const h={Title:'Wekdienst voetbal'};if(click)h.Click=click;
await fetch('https://ntfy.sh/'+process.env.NTFY_TOPIC,{method:'POST',headers:h,body:Buffer.from(body)})}
const T=i=>i.nl?.title||i.title;
const kind={nieuws:'',transfers:'[transfer] ',blessures:'[blessure] ',geruchten:'[GERUCHT] '};
const seen=new Set(),fresh=[];
for(const k of Object.keys(kind))for(const i of news.tabs[k]||[])if(now-new Date(i.date)<14*H&&!seen.has(i.title)){seen.add(i.title);fresh.push(`${kind[k]}${T(i)} (${i.source})`)}
try{
const week=[];for(const r of await Promise.all(WQ.map(wk)))for(const i of r)if(now-i.date>=14*H&&!BLOCK.test(i.title)&&!seen.has(i.title)){seen.add(i.title);week.push(i)}
week.sort((a,b)=>b.date-a.date);
const ms=M.matches||[],mm=m=>`${m.comp}: ${m.home} - ${m.away}`;
const td=ms.filter(m=>day(m.date)===today).sort((a,b)=>a.date.localeCompare(b.date)).map(m=>`${mm(m)} om ${hm(m.date)}${MY.test(m.home+m.away)?' ★':''}`);
const up=ms.filter(m=>day(m.date)>today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,40).map(m=>`${lab(m.date)}: ${mm(m)} ${hm(m.date)}${MY.test(m.home+m.away)?' ★':''}`);
const rs=ms.filter(m=>m.status==='FINISHED'&&day(m.date)<today).slice(-25).map(m=>`${m.comp}: ${m.home} ${m.hs}-${m.as} ${m.away} (${lab(m.date)})`);
const st=Object.entries(M.tables||{}).map(([c,t])=>`${c}: ${t.slice(0,3).map(r=>`${r.pos}. ${r.team} ${r.pts}`).join(', ')}${t.filter(r=>MY.test(r.team)).map(r=>` | ${r.team} staat ${r.pos}e met ${r.pts} punten uit ${r.pl} duels`).join('')}`);
const L=(a,e='(geen gegevens)')=>a.length?a.join('\n'):e;
const prompt=`Je bent sportredacteur en schrijft de ochtendbriefing ("wekdienst") van een voetbalapp, voor ${new Date(now).toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:TZ})}. De lezer volgt de top 5 competities, de Eredivisie, de Keuken Kampioen Divisie, bekers en interlands, en is vooral fan van FC Groningen en Liverpool (met ★ gemarkeerd).

STRIKTE REGELS
- Gebruik UITSLUITEND de gegevens hieronder. Verzin geen scores, citaten, blessures, transfers of aftrapttijden. Staat iets er niet in, laat het weg.
- Items met [GERUCHT] of die als gerucht gemeld worden, noem je expliciet een gerucht. Presenteer geen geruchten als feit.
- Schrijf nuchter en helder, zoals de NOS. Geen clickbait, geen emoji, geen uitroeptekens.
- Tijden zijn Nederlandse tijd. Totaal 250 tot 400 woorden.
- Besteed extra aandacht aan FC Groningen en Liverpool als daar iets over in de gegevens staat.

FORMAAT (exact zo):
TITEL: <korte, zakelijke titel van max 70 tekens>
## Vandaag
<belangrijkste wedstrijden en gebeurtenissen van vandaag, als korte alinea's of regels beginnend met "- ">
## De afgelopen week
<korte samenvatting van wat er de afgelopen week speelde en zich ontwikkelde, op basis van de koppen en uitslagen>
## De komende dagen
<hoe dit zich naar verwachting verder ontwikkelt: de komende wedstrijden en lopende kwesties. Geen voorspellingen over uitslagen.>

GEGEVENS
Wedstrijden vandaag:
${L(td,'(geen wedstrijden in de lijst)')}

Nieuws van de laatste 14 uur:
${L(fresh)}

Koppen van de afgelopen week (nieuwste bovenaan):
${L(week.slice(0,40).map(i=>`${lab(i.date)}: ${i.title} (${i.source})`))}

Recente uitslagen:
${L(rs)}

Wedstrijden de komende dagen:
${L(up)}

Standen:
${L(st)}`;
if(process.env.DRY){console.log(prompt);process.exit(0)}
if(!KEY)throw new Error('geen GEMINI_API_KEY ingesteld');
const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.4,maxOutputTokens:4000}})});
const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Gemini status '+r.status);
const text=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();if(!text)throw new Error('lege reactie');
const title=(text.match(/^TITEL:\s*(.+)$/m)?.[1]||'Voetbal: wat je vandaag moet weten').replace(/\*+/g,'').trim();
const body=text.replace(/^TITEL:.*\n?/m,'').replace(/\*\*/g,'').trim();
fs.mkdirSync('data',{recursive:true});
fs.writeFileSync('data/briefing.json',JSON.stringify({date:new Date(now).toISOString(),title,body}));
fs.writeFileSync('data/briefing.txt',title+'. '+body.replace(/^## /gm,'').replace(/^- /gm,''));
const v=body.split(/^## /m).find(s=>/^Vandaag/i.test(s))||body;
const teaser=v.replace(/^Vandaag\s*/i,'').trim().slice(0,320);
await ping(`${title}\n\n${teaser}${teaser.length>=320?'…':''}\n\nLees verder in de app.`,APP.length>1?APP+'ochtend.html':'');
console.log('briefing verstuurd:',title);
}catch(e){console.log('briefing mislukt:',e.message);
await ping(fresh.length?'Voetbal vandaag (wekdienst kon niet worden geschreven):\n'+fresh.slice(0,5).map(x=>'• '+x).join('\n'):'Geen nieuw voetbalnieuws sinds gisteravond.',APP.length>1?APP:'')}
