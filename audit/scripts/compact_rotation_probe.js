'use strict';
// Read-only probe: does a finished COMPACT Giant B advance the intensifier rotation (giantBRotation)?
// Usage: node audit/scripts/compact_rotation_probe.js <appDir> <out.json>
const fs=require('fs');
const {launch}=require('../../tests/lib/cdp.js'),{serve}=require('../../tests/lib/server.js');
const [appDir,outFile]=process.argv.slice(2);
(async()=>{const s=await serve(appDir),b=await launch();const p=await b.newPage('/tmp');await p.goto(s.origin+'/');
 const r=await p.eval(()=>{
  const mk=(id,c)=>({id,template:'b',status:'complete',compact:c,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()});
  const f=()=>[3,4,1,5,0,6].map(i=>slots.b[i][0]+': '+giantBRotation(i,slots.b[i][1][0]));
  const out={};sessions=[];out.noSessions=f();sessions=[mk('1',true)];out.afterOneCompactB=f();sessions=[mk('1',false)];out.afterOneFullB=f();
  out.identical=JSON.stringify(out.afterOneCompactB)===JSON.stringify(out.afterOneFullB);return out});
 fs.writeFileSync(outFile,JSON.stringify(r,null,1));console.log(JSON.stringify(r));
 await p.close();await b.close();await s.close()})().catch(e=>{console.error(e);process.exit(1)});
