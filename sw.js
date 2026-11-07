const C='vb1',S=['./','index.html','manifest.webmanifest','icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(S))));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin)return;
if(u.pathname.includes('/data/'))e.respondWith(fetch(e.request).then(r=>{const k=r.clone();caches.open(C).then(c=>c.put(e.request,k));return r}).catch(()=>caches.match(e.request)));
else e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
