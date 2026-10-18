'use strict';
// Minimal Chrome DevTools Protocol driver built on Node's global WebSocket (Node >= 22).
// No third-party packages: it launches the locally installed Chrome in headless mode.
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');

const CHROME=process.env.CHROME_BIN||['/usr/local/bin/google-chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));

async function launch(){
 if(!CHROME)throw Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pa-chrome-'));
 const proc=spawn(CHROME,['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--disable-background-networking','--disable-component-update','--disable-sync','--metrics-recording-only','--password-store=basic','about:blank'],{stdio:['ignore','ignore','pipe']});
 const wsUrl=await new Promise((resolve,reject)=>{
  let buf='';const t=setTimeout(()=>reject(Error('Chrome did not start: '+buf.slice(-500))),20000);
  proc.stderr.on('data',d=>{buf+=d;const m=buf.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(t);resolve(m[1])}});
  proc.on('exit',c=>{clearTimeout(t);reject(Error('Chrome exited '+c+': '+buf.slice(-500)))});
 });
 const ws=new WebSocket(wsUrl);
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
 let id=0;const pending=new Map(),listeners=new Set();
 ws.onmessage=ev=>{
  const msg=JSON.parse(ev.data);
  if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message+' ('+p.method+')')):p.resolve(msg.result);return}
  for(const fn of listeners)fn(msg);
 };
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const m={id:++id,method,params};if(sessionId)m.sessionId=sessionId;pending.set(m.id,{resolve,reject,method});ws.send(JSON.stringify(m))});
 const waitFor=(pred,timeout=15000,label='event')=>new Promise((resolve,reject)=>{
  const t=setTimeout(()=>{listeners.delete(fn);reject(Error('Timed out waiting for '+label))},timeout);
  const fn=msg=>{if(pred(msg)){clearTimeout(t);listeners.delete(fn);resolve(msg)}};listeners.add(fn);
 });
 const browser={
  send,waitFor,on:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
  async close(){try{await send('Browser.close')}catch{}try{proc.kill('SIGKILL')}catch{}try{fs.rmSync(profile,{recursive:true,force:true})}catch{}},
  // Each page gets a fresh incognito-like browser context: isolated localStorage, cache and service workers.
  async newPage(downloadDir){
   const {browserContextId}=await send('Target.createBrowserContext',{disposeOnDetach:true});
   const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});
   const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
   if(downloadDir)await send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloadDir,browserContextId,eventsEnabled:true});
   const page=new Page(browser,sessionId,targetId,browserContextId,downloadDir);
   await page.init();return page;
  }
 };
 return browser;
}

class Page{
 constructor(b,sessionId,targetId,contextId,downloadDir){Object.assign(this,{b,sessionId,targetId,contextId,downloadDir});this.errors=[];this.requests=[];this.dialogs=[]}
 send(method,params){return this.b.send(method,params,this.sessionId)}
 async init(){
  this.b.on(msg=>{
   if(msg.sessionId!==this.sessionId)return;
   if(msg.method==='Runtime.exceptionThrown')this.errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);
   if(msg.method==='Network.requestWillBeSent')this.requests.push(msg.params.request.url);
   if(msg.method==='Page.javascriptDialogOpening'){this.dialogs.push(msg.params.message);this.send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{})}
  });
  await this.send('Page.enable');await this.send('Runtime.enable');await this.send('Network.enable');await this.send('DOM.enable');
 }
 async goto(url){const load=this.b.waitFor(m=>m.sessionId===this.sessionId&&m.method==='Page.loadEventFired',20000,'load '+url);await this.send('Page.navigate',{url});await load;await this.waitForFunction('typeof validateBackup==="function"&&document.readyState==="complete"')}
 async reload(){const load=this.b.waitFor(m=>m.sessionId===this.sessionId&&m.method==='Page.loadEventFired',20000,'reload');await this.send('Page.reload',{ignoreCache:false});await load;await this.waitForFunction('typeof validateBackup==="function"&&document.readyState==="complete"')}
 waitForLoad(timeout=20000){return this.b.waitFor(m=>m.sessionId===this.sessionId&&m.method==='Page.loadEventFired',timeout,'page load')}
 // Evaluates an expression or a function (serialized with JSON arguments) in the page.
 async eval(fnOrExpr,...args){
  const expression=typeof fnOrExpr==='function'?`(${fnOrExpr})(...${JSON.stringify(args)})`:fnOrExpr;
  const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  if(r.exceptionDetails)throw Error('Page evaluation failed: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));
  return r.result.value;
 }
 async waitForFunction(expr,timeout=10000){const end=Date.now()+timeout;for(;;){try{if(await this.eval(expr))return}catch{}if(Date.now()>end)throw Error('Timed out waiting for: '+expr);await new Promise(r=>setTimeout(r,50))}}
 // Real mouse click at the centre of the first visible element matching selector (and optional exact text).
 async click(selector,text){
  const box=await this.eval((sel,txt)=>{const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null&&(txt==null||e.textContent.trim()===txt));if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}},selector,text??null);
  if(!box)throw Error('No visible element '+selector+(text?' "'+text+'"':''));
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await this.send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
 }
 async type(selector,value){await this.eval(sel=>{const el=document.querySelector(sel);el.scrollIntoView({block:'center'});el.focus();el.select?.()},selector);await this.send('Input.insertText',{text:value})}
 async setFile(selector,file){const {root}=await this.send('DOM.getDocument',{depth:-1,pierce:true});const {nodeId}=await this.send('DOM.querySelector',{nodeId:root.nodeId,selector});if(!nodeId)throw Error('No file input '+selector);await this.send('DOM.setFileInputFiles',{nodeId,files:[file]})}
 async download(trigger){
  // Completion can arrive before trigger() resolves for small files, so record it from the start.
  const done=new Set();const off=this.b.on(m=>{if(m.method==='Browser.downloadProgress'&&m.params.state==='completed')done.add(m.params.guid)});
  try{
   const begin=this.b.waitFor(m=>m.method==='Browser.downloadWillBegin',15000,'download start');await trigger();const {params:{guid,suggestedFilename}}=await begin;
   const end=Date.now()+15000;while(!done.has(guid)){if(Date.now()>end)throw Error('Timed out waiting for download complete');await new Promise(r=>setTimeout(r,25))}
   return {file:path.join(this.downloadDir,guid),name:suggestedFilename};
  }finally{off()}
 }
 async offline(on){await this.send('Network.emulateNetworkConditions',{offline:on,latency:0,downloadThroughput:-1,uploadThroughput:-1})}
 async close(){try{await this.b.send('Target.disposeBrowserContext',{browserContextId:this.contextId})}catch{}}
}

module.exports={launch};
