import fs from 'node:fs';
const KEY=process.env.GEMINI_API_KEY,MODEL=process.env.GEMINI_MODEL||'gemini-flash-latest';
const UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36','Accept-Language':'nl,en;q=0.8',Cookie:'CONSENT=YES+1'};
const rd=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}};
const LIM={nieuws:12,transfers:4,blessures:4,geruchten:4,meningen:4},DAY=864e5,now=Date.now();
const ent=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;|&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n));
const clean=s=>ent(s.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const JUNK=/cookie|javascript|abonne|inloggen|nieuwsbrief|©|alle rechten|privacy/i;
function extract(h,base){
const m=h.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)||h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
let img='';try{img=m?new URL(ent(m[1]),base).href:''}catch{}
const b=(h.match(/<article[\s\S]*?<\/article>/i)||[h])[0].replace(/<(script|style|nav|footer|aside|form|noscript)[\s\S]*?<\/\1>/gi,'');
const ps=[...b.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(x=>clean(x[1])).filter(p=>p.length>60&&!JUNK.test(p));
let t='';for(const p of ps){if((t+p).length>3500)break;t+=p+'\n'}
return t.length>=350?{text:t,img}:null}
async function gnews(url){const id=new URL(url).pathname.split('/').pop();
for(const p of ['articles','rss/articles']){const h=await(await fetch(`https://news.google.com/${p}/${id}`,{headers:UA})).text();
const sg=h.match(/data-n-a-sg="([^"]+)"/)?.[1],ts=h.match(/data-n-a-ts="([^"]+)"/)?.[1];if(!sg||!ts)continue;
const inner=`["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
const r=await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute',{method:'POST',headers:{...UA,'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'f.req='+encodeURIComponent(JSON.stringify([[['Fbv4je',inner]]]))});
const t=(await r.text()).split('\n\n')[1];const u=JSON.parse(JSON.parse(t)[0][2])[1];if(u)return u}
throw new Error('Google-link niet te openen')}
async function page(url){try{if(/news\.google\.com\/(rss\/)?articles\//.test(url))url=await gnews(url);
const r=await fetch(url,{headers:UA,redirect:'follow',signal:AbortSignal.timeout(15000)});if(!r.ok)return null;return extract(await r.text(),r.url)}catch{return null}}
async function ask(batch){
const prompt=`Je bent sportredacteur. Hieronder staan bronteksten van nieuwsartikelen. Schrijf voor elk artikel een korte, zelfstandige nieuwstekst in het Nederlands van 90 tot 140 woorden, in je eigen woorden.
REGELS: gebruik alleen feiten uit de brontekst en verzin niets. Neem geen zinnen letterlijk over; alleen korte citaten van maximaal 6 woorden tussen aanhalingstekens. Vertaal Engelse bronnen naar het Nederlands. Nuchtere toon, geen clickbait, geen emoji, geen uitroeptekens. Noem geruchten expliciet een gerucht. Begin niet met "Het artikel". Schrijf 1 of 2 alinea's, gescheiden door een lege regel.
Geef ALLEEN geldige JSON terug: een lijst van objecten {"id":<nummer>,"tekst":"..."}. Laat een artikel weg als de brontekst geen echt nieuwsbericht is (menu, reclame, cookietekst).

${batch.map((x,n)=>`[${n}] Titel: ${x.i.nl?.title||x.i.title}\nBron: ${x.i.source}\n${x.text.slice(0,2800)}`).join('\n\n')}`;
const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.3,maxOutputTokens:8000,responseMimeType:'application/json'}})});
const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Gemini status '+r.status);
const t=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').replace(/^```(json)?|```$/g,'').trim();
return JSON.parse(t)}
if(process.env.TEST){console.log(extract(process.env.TEST,'https://voorbeeld.nl/a'));process.exit(0)}
const news=rd('data/news.json',null);if(!news){console.log('geen news.json');process.exit(0)}
const cache=rd('data/summaries.json',{});
for(const[k,v]of Object.entries(cache))if(now-v.d>4*DAY)delete cache[k];
try{
if(!KEY)throw new Error('geen GEMINI_API_KEY ingesteld');
const todo=[];
for(const[k,lim]of Object.entries(LIM))(news.tabs[k]||[]).forEach((i,x)=>{if((x<lim||(i.mine&&x<25))&&!cache[i.url]&&!todo.some(t=>t.url===i.url))todo.push(i)});
console.log('te verwerken:',todo.length);
const got=[];
for(let n=0;n<todo.length;n+=5)await Promise.all(todo.slice(n,n+5).map(async i=>{const p=await page(i.url);if(p)got.push({i,...p})}));
console.log('bronteksten opgehaald:',got.length);
for(let n=0;n<got.length;n+=8){const batch=got.slice(n,n+8);
for(const o of await ask(batch)){const x=batch[o.id];if(x&&o.tekst&&o.tekst.length>80)cache[x.i.url]={t:o.tekst.trim(),i:x.img,d:now}}}
}catch(e){console.log('artikelen mislukt (deels):',e.message)}
let n=0;for(const k of Object.keys(news.tabs))for(const i of news.tabs[k]){const c=cache[i.url];if(c){i.ai=c.t;if(c.i)i.img=c.i;n++}}
console.log('items met AI-tekst:',n);
fs.writeFileSync('data/news.json',JSON.stringify(news));fs.writeFileSync('data/summaries.json',JSON.stringify(cache));
