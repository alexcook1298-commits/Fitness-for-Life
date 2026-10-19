#!/usr/bin/env node
'use strict';
// Headless check (needs Chrome; developer use only): the committed, re-dated seed backup passes the app's own validateBackup and imports through the real Import screen.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),assert=require('assert');
const {launch}=require('../../tests/lib/cdp');const {redate}=require('./seed_tools');
const app=path.join(__dirname,'..','app');const work=fs.mkdtempSync(path.join(os.tmpdir(),'pa-seedcheck-'));
const seed=path.join(work,'seed.json');fs.writeFileSync(seed,JSON.stringify(redate(JSON.parse(fs.readFileSync(path.join(__dirname,'seed','DISPOSABLE_TEST_BACKUP.json'),'utf8')),Date.now())));
const T={'.html':'text/html','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png'};
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x').pathname;const f=path.join(app,u==='/'?'index.html':u);fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});r.end(b)})});
(async()=>{await new Promise(r=>srv.listen(0,'127.0.0.1',r));const o='http://127.0.0.1:'+srv.address().port;const b=await launch();const p=await b.newPage(work);
 try{await p.goto(o+'/');await p.waitForFunction('typeof validateBackup==="function"');
  const v=await p.eval(s=>{try{validateBackup(JSON.parse(s));return 'valid'}catch(e){return 'INVALID: '+e.message}},fs.readFileSync(seed,'utf8'));assert.strictEqual(v,'valid',v);
  await p.eval(()=>showData());await p.setFile('#morepage input[type=file]',seed);await p.waitForFunction('document.getElementById("importPreview").textContent.trim().length>0',20000);
  const re=p.waitForLoad(30000).then(()=>true,()=>false);await p.click('button','RESTORE THIS BACKUP');assert(await re);await p.waitForFunction('typeof validateBackup==="function"&&document.readyState==="complete"');
  const r=await p.eval(()=>({full:document.getElementById('homePlan').textContent.replace(/\s+/g,' '),sessions:JSON.parse(localStorage.pa_sessions_v2).map(s=>s.status),hist:JSON.parse(localStorage.pa_hist).length}));
  console.log(JSON.stringify(r,null,1));assert(/RESUME Giant A/i.test(r.full),'RESUME Giant A not offered');console.log('SEED OK')}finally{await b.close();srv.close()}})().catch(e=>{console.error('SEED FAIL',e.message);process.exit(1)});
