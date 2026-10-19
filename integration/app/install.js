(()=>{
 const status=document.getElementById('offlineStatus'),install=document.getElementById('installButton'),update=document.getElementById('updateButton');
 let prompt=null,registration=null,ready=false,updating=false;
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 function refresh(){status.textContent=ready?(navigator.onLine?'Ready offline • Workouts save on this device.':'Offline • Workouts and local logging are available.'):'Offline access is not ready yet. Connect to the internet and reopen this app.';if(standalone())install.classList.add('hidden')}
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;if(!standalone())install.classList.remove('hidden')});
 install.addEventListener('click',async()=>{if(!prompt)return;const p=prompt;prompt=null;install.classList.add('hidden');try{await p.prompt();await p.userChoice}catch{status.textContent='Use your browser’s Add to Home Screen menu.'}});
 window.addEventListener('appinstalled',()=>{prompt=null;install.classList.add('hidden')});
 window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
 update.addEventListener('click',()=>{if(!registration?.waiting)return;if(typeof saveDraft==='function')saveDraft();updating=true;update.disabled=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'})});
 if(!('serviceWorker' in navigator)||!window.isSecureContext){status.textContent='Open the HTTPS Netlify site to enable installation and offline access.';return}
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating){location.reload();return}ready=true;update.classList.add('hidden');refresh()});
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
  registration=reg;const showUpdate=()=>{update.classList.toggle('hidden',!(reg.waiting&&navigator.serviceWorker.controller))};showUpdate();
  reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed')showUpdate()})});
  navigator.serviceWorker.ready.then(()=>{ready=true;update.classList.add('hidden');refresh()});
 }).catch(()=>{status.textContent='Offline setup failed. Keep using the app online and try reloading when connected.'});
})();

