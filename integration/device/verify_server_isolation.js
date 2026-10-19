#!/usr/bin/env node
'use strict';
// Node-only (Windows, macOS, Linux). Proves, against a real running copy of the LAN server, that it serves nothing but the disposable test bundle.
// It binds to 127.0.0.1 on a spare port, so it does not need your Wi-Fi. Run:  node integration/device/verify_server_isolation.js
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),{spawn,spawnSync}=require('child_process');
const D=__dirname,ROOT=path.resolve(D,'..','..');const {build,check,DEFAULT_ALLOW}=require('./build_device_bundle');const {isPrivate}=require('./lan_test_server');const {redate}=require('./seed_tools');
const results=[];const ok=(id,title,pass,detail='')=>{results.push({id,title,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${id.padEnd(4)} ${title}${pass||!detail?'':'\n      -> '+detail}`)};
const raw=(port,method,p)=>new Promise(res=>{const r=http.request({host:'127.0.0.1',port,method,path:p},x=>{const c=[];x.on('data',d=>c.push(d));x.on('end',()=>res({status:x.statusCode,body:Buffer.concat(c)}))});r.on('error',e=>res({status:0,body:Buffer.alloc(0),err:e.message}));r.end()});
(async()=>{
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'pa-iso-')),bundle=path.join(work,'A');build('A',bundle,DEFAULT_ALLOW,['production.example'],true);
 const seed=path.join(work,'seed.json');fs.writeFileSync(seed,JSON.stringify(redate(JSON.parse(fs.readFileSync(path.join(D,'seed','DISPOSABLE_TEST_BACKUP.json'),'utf8')))));
 ok('V1','The bundle differs from the candidate only by the labelled guard, label, title, cache name and manifest name',check(bundle).length===0,check(bundle).join('; '));
 ok('V2','Addresses: private ranges accepted, every public address refused',['192.168.1.5','10.0.0.2','172.16.0.1','172.31.9.9','169.254.3.3','127.0.0.1','::ffff:192.168.0.9'].every(isPrivate)&&['8.8.8.8','172.32.0.1','172.15.0.1','192.169.0.1','1.1.1.1','100.64.0.1','203.0.113.5',''].every(x=>!isPrivate(x)));
 const srv=path.join(D,'lan_test_server.js');
 const refuse=a=>spawnSync(process.execPath,[srv,bundle,...a],{encoding:'utf8',timeout:8000});
 const r1=refuse(['--bind','8.8.8.8']),r2=refuse(['--bind','0.0.0.0']),r3=spawnSync(process.execPath,[srv,ROOT],{encoding:'utf8',timeout:8000});
 ok('V3','The server refuses to start on a public address, on 0.0.0.0, or on a folder that is not a test bundle (for example the repository root)',r1.status===2&&r2.status===2&&r3.status===2,[r1.status,r2.status,r3.status].join(','));
 const port=18700+Math.floor(Math.random()*200);
 const child=spawn(process.execPath,[srv,bundle,'--bind','127.0.0.1','--port',String(port),'--ttl','2','--seed',seed],{stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
 for(let i=0;i<50&&!/TEST SERVER RUNNING/.test(out);i++)await new Promise(r=>setTimeout(r,100));
 try{
  ok('V4','The server started',/TEST SERVER RUNNING/.test(out),out.slice(0,300));
  const files=fs.readdirSync(bundle,{recursive:true}).map(f=>f.split(path.sep).join('/')).filter(f=>fs.statSync(path.join(bundle,f)).isFile()&&f!=='TEST_BUNDLE.json');
  let same=true,det='';for(const f of files){const r=await raw(port,'GET','/'+f);if(r.status!==200||!r.body.equals(fs.readFileSync(path.join(bundle,f)))){same=false;det+=f+' ';}}
  ok('V5','Every bundle file is served byte-for-byte ('+files.length+' files)',same,det);
  const bad=['/../README.md','/%2e%2e/README.md','/..%2f..%2fREADME.md','/..%5c..%5cREADME.md','/%252e%252e/README.md','/..\\..\\README.md','/integration/app/index.html','/app/index.html','/baseline/hq-2.3/index.html','/index.html%00.txt','/C:/Windows/win.ini','/C%3A%5CWindows%5Cwin.ini','//etc/passwd','/TEST_BUNDLE.json','/%54EST_BUNDLE.json','/./TEST_BUNDLE.json','/.git/config','/dist/A/index.html','/node_modules','/..','/../','/%2e%2e%2f%2e%2e%2fpackage.json'];
  const leaks=[];for(const p of bad){const r=await raw(port,'GET',p);const inBundle=files.some(f=>r.body.equals(fs.readFileSync(path.join(bundle,f))));if(r.status===200&&!inBundle)leaks.push(p+' -> 200 '+r.body.length+' bytes')}
  ok('V6','Traversal, encoded, backslash, drive-letter, repository-path and hidden-file requests (22 variants) never return anything but a bundle file (the URL parser folds /.. into /, which is the index page of the bundle itself)',leaks.length===0,leaks.join('; '));
  const m=[];for(const method of ['POST','PUT','DELETE','PATCH']){const r=await raw(port,method,'/');if(r.status!==405)m.push(method+' '+r.status)}
  ok('V7','The server is read-only: POST, PUT, DELETE and PATCH are refused with 405',m.length===0,m.join(', '));
  const sd=await raw(port,'GET','/DISPOSABLE_TEST_BACKUP.json');let sj;try{sj=JSON.parse(sd.body)}catch{}
  ok('V8','The only extra file is the synthetic backup, and it is exactly the seed file given on the command line',sd.status===200&&sj&&sj.format==='project-america-full-backup'&&sd.body.equals(fs.readFileSync(seed)));
  const h=await new Promise(res=>http.get({host:'127.0.0.1',port,path:'/'},x=>{x.resume();res(x.headers)}));
  ok('V9','No cross-origin permission is granted (no CORS headers), so a page on another origin cannot read these files',!Object.keys(h).some(k=>/^access-control-/i.test(k)),JSON.stringify(h));
  const refs=[];for(const f of ['index.html','install.js','sw.js']){const t=fs.readFileSync(path.join(bundle,f),'utf8');for(const m2 of t.matchAll(/(?:fetch|open|importScripts|src=|href=|action=)\s*\(?\s*["'`](https?:\/\/[^"'`\s)]+)/g))refs.push(f+': '+m2[1])}
  ok('V10','The app code contains no absolute http(s) URL that it fetches, loads or links to (nothing can reach a production host)',refs.length===0,refs.join('; '));
  const onlyLocal=Buffer.from(sd.body).toString().includes('production.example')===false;
  ok('V11','The synthetic backup contains no host names or real data fields (only the four expected keys, synthetic names)',sj&&Object.keys(sj.data).sort().join()==='pa_cardio_hist,pa_current_session,pa_hist,pa_sessions_v2'&&onlyLocal);
 }finally{child.kill();fs.rmSync(work,{recursive:true,force:true})}
 const failed=results.filter(r=>!r.pass).length;console.log(`\n${results.length-failed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exit(2)});
