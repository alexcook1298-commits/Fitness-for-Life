#!/usr/bin/env node
'use strict';
// Cross-platform (Windows, macOS, Linux) launcher for the Tier 1 iPhone test. Needs only Node.js. No Chrome, no bash, no HTTPS certificate, no tunnel.
// Builds disposable test builds A and B from integration/app, checks them, writes the re-dated synthetic backup, and starts the private LAN server for A.
// Usage: node integration/device/lan_up.js [--forbid your-real-host.example] [--bind 192.168.x.y] [--port 8787] [--ttl 120]
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const major=+process.versions.node.split('.')[0];
if(major<18){console.error('Node.js 18 or newer is required (found '+process.version+'). Install the LTS version from https://nodejs.org/ and open a new terminal.');process.exit(2)}
const D=__dirname,ROOT=path.resolve(D,'..','..'),SRC=path.join(ROOT,'integration','app');
const a=process.argv.slice(2),opt=n=>a.reduce((r,x,i)=>x===n?[...r,a[i+1]]:r,[]);
const need=[path.join(SRC,'index.html'),path.join(SRC,'sw.js'),path.join(D,'seed','DISPOSABLE_TEST_BACKUP.json'),path.join(D,'lan_test_server.js'),path.join(D,'build_device_bundle.js')];
const missing=need.filter(f=>!fs.existsSync(f));
if(missing.length){console.error('Missing files (wrong branch or incomplete download?):\n  '+missing.join('\n  '));process.exit(2)}
const {build,check,DEFAULT_ALLOW}=require('./build_device_bundle');const {redate}=require('./seed_tools');
const forbid=opt('--forbid');
if(!forbid.length)console.warn('NOTE: no --forbid given. The guard still blocks every public host; add --forbid <your real app host> for an extra block.\n');
const dist=path.join(D,'dist');fs.mkdirSync(dist,{recursive:true});
for(const tag of ['A','B']){const out=path.join(dist,tag);build(tag,out,DEFAULT_ALLOW,forbid,true);const pr=check(out);if(pr.length){console.error('Bundle check failed:\n - '+pr.join('\n - '));process.exit(1)}console.log(`built and verified test build ${tag}`)}
const seedOut=path.join(dist,'DISPOSABLE_TEST_BACKUP.json');
fs.writeFileSync(seedOut,JSON.stringify(redate(JSON.parse(fs.readFileSync(path.join(D,'seed','DISPOSABLE_TEST_BACKUP.json'),'utf8'))),null,2));console.log('wrote synthetic backup '+seedOut);
const pass=[];for(const o of ['--bind','--port','--ttl'])opt(o).forEach(v=>pass.push(o,v));
const child=spawn(process.execPath,[path.join(D,'lan_test_server.js'),path.join(dist,'A'),'--seed',seedOut,...pass],{stdio:'inherit'});
child.on('exit',c=>process.exit(c??0));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill());
