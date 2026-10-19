#!/usr/bin/env node
'use strict';
// Automated REHEARSAL of the real-device procedure in headless desktop Chrome. It proves the bundle, guard, seed backup and the
// scriptable parts of the checklist. It is NOT a substitute for iPhone Safari / Home-Screen testing (no iOS engine here).
// Everything runs on 127.0.0.1 with throw-away browser profiles. Usage: node integration/device/rehearse.js [--src dir] [--json out]
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),vm=require('vm'),assert=require('assert');
const {launch}=require('../../tests/lib/cdp');const {build,check,DEFAULT_ALLOW}=require('./build_device_bundle');const {make}=require('./make_disposable_backup');
const args=process.argv.slice(2),opt=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
process.argv.splice(2);
const SRC=path.resolve(opt('--src')||path.join(__dirname,'..','app')),jsonOut=opt('--json');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'pa-rehearse-'));const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png'};
function swap(dir){let root=path.resolve(dir);const s=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');const rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');const f=path.resolve(root,rel);if(!f.startsWith(root)){res.writeHead(403);return res.end()}
 fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(b)})});
 return new Promise(r=>s.listen(0,'127.0.0.1',()=>r({origin:'http://127.0.0.1:'+s.address().port,setRoot:d=>{root=path.resolve(d)},close:()=>new Promise(c=>s.close(c))})))}
const results=[];const step=async(id,title,fn)=>{let error=null;try{await fn()}catch(e){error=String(e.message).split('\n').slice(0,4).join(' | ').slice(0,400)}results.push({id,title,pass:!error,error});console.log(`${error?'FAIL':'PASS'} ${id.padEnd(4)} ${title}${error?'\n      → '+error:''}`)};
const ready=p=>p.waitForFunction('typeof validateBackup==="function"&&document.readyState==="complete"');
const swState=p=>p.eval(async()=>{const reg=await navigator.serviceWorker.getRegistration();return {controller:!!navigator.serviceWorker.controller,waiting:!!reg?.waiting,caches:await caches.keys(),updateVisible:!document.getElementById('updateButton').classList.contains('hidden')}});

(async()=>{
 const A=path.join(work,'A'),B=path.join(work,'B'),G=path.join(work,'G');
 build('A',A,DEFAULT_ALLOW,[]);build('B',B,DEFAULT_ALLOW,[]);build('G',G,DEFAULT_ALLOW,['127.0.0.1']);const N=path.join(work,'N');build('N',N,DEFAULT_ALLOW,['10.9.9.9'],true);
 const seed=path.join(work,'DISPOSABLE_TEST_BACKUP.json');
 await step('D1','Bundles build and differ from the source only by guard, label, title, cache name and manifest name/short_name/id',async()=>{for(const d of [A,B,G,N]){const pr=check(d);assert.deepStrictEqual(pr,[],pr.join('; '))}});
 await step('D2','Origin guard (evaluated in an isolated JS context for 12 hostnames): real/unknown hosts blocked, localhost and tunnel hosts allowed, forbidden host blocked even if otherwise allowed',()=>{
  const g=/<script>\/\*PA-DEVICE-TEST-GUARD\*\/([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(A,'index.html'),'utf8'))[1];
  const g2=/<script>\/\*PA-DEVICE-TEST-GUARD\*\/([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(G,'index.html'),'utf8'))[1];
  const run=(code,host)=>{let blocked=false;const sb={location:{hostname:host},navigator:{},document:{createElement:()=>({setAttribute(){},appendChild(){}}),documentElement:{appendChild(){blocked=true}}},window:{stop(){}}};try{vm.runInNewContext(code,sb)}catch(e){}return blocked||sb.window.__PA_TEST_BLOCKED===true};
  const cases=[['localhost',false],['127.0.0.1',false],['my-test.trycloudflare.com',false],['abc.loca.lt',false],['x.ngrok-free.app',false],
   ['project-america.netlify.app',true],['example.com',true],['trycloudflare.com.evil.example',true],['evil-trycloudflare.com',true],['',true],['192.168.1.20',true],['LOCALHOST.EVIL.COM',true]];
  for(const [h,want] of cases)assert.strictEqual(run(g,h),want,'host '+JSON.stringify(h));
  assert.strictEqual(run(g2,'127.0.0.1'),true,'forbidden host must be blocked');assert.strictEqual(run(g2,'localhost'),false);
 });
 await step('D2b','Private-network option (a phone on the same Wi-Fi): allows 10.x, 192.168.x, 172.16-31.x, 169.254.x and name.local; public addresses, 172.32.x and look-alike names stay blocked; --forbid still wins; the default build allows none of them',()=>{
  const code=f=>/<script>\/\*PA-DEVICE-TEST-GUARD\*\/([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(f,'index.html'),'utf8'))[1];
  const run=(c,host)=>{let blocked=false;const sb={location:{hostname:host},navigator:{},document:{createElement:()=>({setAttribute(){},appendChild(){}}),documentElement:{appendChild(){blocked=true}}},window:{stop(){}}};try{vm.runInNewContext(c,sb)}catch(e){}return blocked||sb.window.__PA_TEST_BLOCKED===true};
  const gN=code(N),gA=code(A);
  for(const h of ['192.168.1.20','10.0.0.5','172.16.4.4','172.31.255.1','169.254.1.1','alexs-iphone.local','localhost'])assert.strictEqual(run(gN,h),false,'should allow '+h);
  for(const h of ['8.8.8.8','172.32.0.1','172.15.0.1','192.169.1.1','11.0.0.1','192.168.1.20.evil.com','evil.local.com','example.com','10.9.9.9'])assert.strictEqual(run(gN,h),true,'should block '+h);
  for(const h of ['192.168.1.20','10.0.0.5','phone.local'])assert.strictEqual(run(gA,h),true,'default build must block '+h)});
 const server=await swap(A);const browser=await launch();const dl=path.join(work,'dl');fs.mkdirSync(dl);
 try{
  await step('D3','A blocked page runs no app code, writes no storage and registers no service worker',async()=>{
   const s=await swap(G);const p=await browser.newPage(dl);
   try{await p.send('Page.navigate',{url:s.origin+'/'});await sleep(1500);
    const r=await p.eval(async()=>({blocked:window.__PA_TEST_BLOCKED===true,app:typeof start,ls:localStorage.length,sw:(await navigator.serviceWorker.getRegistrations()).length,text:document.body.textContent}));
    assert.strictEqual(r.blocked,true);assert.strictEqual(r.app,'undefined');assert.strictEqual(r.ls,0);assert.strictEqual(r.sw,0);assert(/TEST BUILD BLOCKED/.test(r.text))}finally{await p.close();await s.close()}});
  await step('D4','Seed generator makes a valid disposable backup from the app itself (partial, skipped, Giant B intensifier, tag-like cardio text, unfinished draft)',async()=>{
   const r=await make(SRC,seed);assert(fs.existsSync(seed));assert(r.sessions.length===4&&r.sessions.some(s=>s.status==='draft')&&r.sessions.some(s=>s.skips)&&r.sessions.some(s=>s.rotation===0));
   assert(/<Z2>/.test(fs.readFileSync(seed,'utf8')))});
  const p=await browser.newPage(dl);
  await step('D5','Test build loads: TEST label and title visible, distinct manifest, empty storage',async()=>{
   await p.goto(server.origin+'/');const r=await p.eval(async()=>({label:document.getElementById('paTestLabel')?.textContent,title:document.title,man:await (await fetch('./manifest.webmanifest')).json(),pa:Object.keys(localStorage).filter(k=>k.startsWith('pa_')).length,id:localStorage.paTestStoreId}));
   assert(/TEST A\b/.test(r.label)&&/^TEST A/.test(r.title));assert(/PA TEST A/.test(r.man.short_name)&&r.man.id==='/pa-device-test');assert.strictEqual(r.pa,0,'no pa_ data on a new origin');assert(/^[0-9a-f]{1,4}$/.test(r.id),'storage id');assert(/BROWSER/.test(r.label)&&/id [0-9a-f]+/.test(r.label)&&/https|NOT-SECURE/.test(r.label),r.label)});
  await step('D6','Service worker installs and the shell is cached under the device-test cache name',async()=>{
   await p.waitForFunction('navigator.serviceWorker.getRegistration().then(r=>!!r&&!!r.active)',15000);await p.reload();await sleep(500);const s=await swState(p);assert(s.controller&&s.caches.join()==='project-america-shell-devicetest-a',JSON.stringify(s))});
  await step('D7','Import the disposable backup through the real Import screen, then it persists across a refresh',async()=>{
   await p.eval(()=>showData());await p.setFile('#morepage input[type=file]',seed);await p.waitForFunction('document.getElementById("importPreview").textContent.trim().length>0',20000);
   const re=p.waitForLoad(30000).then(()=>true,()=>false);await p.click('button','RESTORE THIS BACKUP');assert(await re);await ready(p);
   const n=await p.eval(()=>({s:JSON.parse(localStorage.pa_sessions_v2).length,h:JSON.parse(localStorage.pa_hist).length,c:JSON.parse(localStorage.pa_cardio_hist)[0].data.pace}));assert.strictEqual(n.s,4);assert(n.h>0);assert.strictEqual(n.c,'easy <Z2> 30 min');
   await p.reload();assert.strictEqual(await p.eval(()=>JSON.parse(localStorage.pa_sessions_v2).length),4)});
  await step('D8','Interrupted workout recovery: the unfinished draft is offered for resume after a reload and keeps its logged set',async()=>{
   await p.reload();const r=await p.eval(()=>({draft:JSON.parse(localStorage.pa_sessions_v2).filter(s=>s.status==='draft').length,home:document.getElementById('homePlan').textContent}));assert.strictEqual(r.draft,1);assert(/RESUME/i.test(r.home),r.home.slice(0,200));
   await p.click('#n-home');await p.click('#homePlan button.secondary','RESUME Giant A');assert(await p.eval(()=>Object.values(currentSession.forms||{}).length>0||JSON.parse(localStorage.pa_hist).some(h=>h.sessionId===currentSession.id)))});
  await step('D9','Offline: with the network disabled the app reloads from the service worker cache, starts a workout and logs a set; data persists after going back online',async()=>{
   await p.reload();await sleep(500);await p.offline(true);
   try{await p.reload();await p.waitForFunction('typeof start==="function"');const before=await p.eval(()=>JSON.parse(localStorage.pa_hist).length);
    await p.eval(()=>{currentSession=null;start('a');(slots.a||[]).forEach((x,i)=>{currentSession.modes[i+':'+selected('a',i)]='Straight Sets'});render();const i=0,j=2,key=formKey(i,j,'Straight Sets','');const put=(f,v)=>{document.querySelector(`#exs input[data-save="${key}${f}"]`).value=v};put('w','50');put('r','10');put('rir','2');logSet(null,i,j)});
    assert.strictEqual(await p.eval(()=>JSON.parse(localStorage.pa_hist).length),before+1);
   }finally{await p.offline(false)}
   await p.reload();assert(await p.eval(()=>JSON.parse(localStorage.pa_hist).length)>1)});
  await step('D10','Backup round trip: export, wipe the disposable origin, import the export: every pa_ key is identical',async()=>{
   const snap=()=>p.eval(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('pa_')&&!k.startsWith('pa_restore_rollback')).sort().map(k=>[k,localStorage.getItem(k)])));
   await p.eval(()=>showData());const before=await snap();
   const payload=await p.eval(()=>backupPayload());const file=path.join(work,'roundtrip.json');fs.writeFileSync(file,JSON.stringify(payload));
   await p.eval(()=>{Object.keys(localStorage).filter(k=>k.startsWith('pa_')).forEach(k=>localStorage.removeItem(k))});await p.reload();assert.strictEqual(await p.eval(()=>Object.keys(localStorage).filter(k=>k.startsWith('pa_hist')).length&&localStorage.pa_hist?JSON.parse(localStorage.pa_hist).length:0),0);
   await p.eval(()=>showData());await p.setFile('#morepage input[type=file]',file);await p.waitForFunction('document.getElementById("importPreview").textContent.trim().length>0',20000);
   const re=p.waitForLoad(30000).then(()=>true,()=>false);await p.click('button','RESTORE THIS BACKUP');assert(await re);await ready(p);
   const after=await snap();const diff=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>before[k]!==after[k]);assert.deepStrictEqual(diff,[],'keys differ after round trip: '+diff.join(','))});
  await step('D11','Specialized intensifier logging: a Giant B Myo-Reps cluster saves as one structured record with its efforts',async()=>{
   const r=await p.eval(()=>{currentSession=null;start('b');const i=[3,4,1,5,0,6].find(i=>todayInt(i,selected('b',i))==='Myo-Reps');if(i===undefined)return null;const n=selected(active,i),j=workSetCount(i),mode=setMode(i,j,n),key=formKey(i,j,mode,''),labels=methodStages(mode);
    for(let k=0;k<2;k++){document.querySelector(`#exs input[data-save="${key}w${k}"]`).value='30';document.querySelector(`#exs input[data-save="${key}r${k}"]`).value='12'}saveCluster(i,j);
    const rec=JSON.parse(localStorage.pa_hist).filter(h=>h.sessionId===currentSession.id);return {n:rec.length,structured:rec[0]?.structured,m:rec[0]?.intensifier,e:(rec[0]?.efforts||[]).length}});
   assert(r&&r.n===1&&r.structured===true&&r.m==='Myo-Reps'&&r.e>=2,JSON.stringify(r))});
  await step('D12','Service-worker update: build A is installed; build B is deployed; the update prompt appears without replacing the running workout; after the tap B runs, A\'s cache is deleted, and the draft and history survive',async()=>{
   const draft=await p.eval(()=>currentSession.id);const hist=await p.eval(()=>JSON.parse(localStorage.pa_hist).length);
   server.setRoot(B);await p.eval(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
   await p.waitForFunction('document.getElementById("updateButton")&&!document.getElementById("updateButton").classList.contains("hidden")',15000);
   assert(/TEST A\b/.test(await p.eval(()=>document.getElementById('paTestLabel').textContent)),'page changed before the tap');assert.strictEqual(await p.eval(()=>currentSession.id),draft);
   await p.click('#n-home');const re=p.waitForLoad(20000).then(()=>true,()=>false);await p.click('#updateButton');assert(await re);await ready(p);await sleep(500);
   const s=await swState(p);assert.strictEqual(s.caches.join(),'project-america-shell-devicetest-b');assert(/TEST B\b/.test(await p.eval(()=>document.getElementById('paTestLabel').textContent)));
   assert.strictEqual(await p.eval(()=>JSON.parse(localStorage.pa_hist).length),hist);assert(await p.eval(d=>JSON.parse(localStorage.pa_sessions_v2).some(x=>x.id===d),draft))});
 }finally{await browser.close();await server.close()}
 const failed=results.filter(r=>!r.pass).length;console.log(`\n${results.length-failed} passed, ${failed} failed, ${results.length} total (desktop headless rehearsal; iPhone testing NOT done)`);
 if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify({date:new Date().toISOString(),src:SRC,passed:results.length-failed,failed,note:'headless desktop rehearsal only; real-device testing not performed',results},null,1));
 fs.rmSync(work,{recursive:true,force:true});process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=2});
