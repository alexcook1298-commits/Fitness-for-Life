const CACHE='project-america-shell-v2-3-phase2-20261019';
const FILES=['/','/index.html','/install.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
// Do not take over a running workout until the user saves and updates.
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('project-america-shell-')&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'&&(url.pathname==='/'||url.pathname==='/index.html')){
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('/index.html'))||fetch(event.request)));return;
 }
 if(FILES.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
});
