#!/usr/bin/env node
'use strict';
// Builds a clearly-labelled, disposable TEST bundle of the Phase 3 candidate for real-device trials on a SEPARATE origin.
// The candidate itself (integration/app), the original baseline and app/ are only read, never changed.
//
// What the bundle changes (and nothing else):
//   index.html     title prefix, an origin guard at the very top of <head>, a fixed "TEST BUILD" label
//   sw.js          cache name (project-america-shell-devicetest-<tag>) so it can never share or delete another build's cache
//   manifest       name, short_name, id so a test install is visibly distinct from any real install
// `--check` proves the claim: reverse the three edits and the result is byte-identical to the source.
//
// Usage:
//   node integration/device/build_device_bundle.js --tag A --out integration/device/dist/A [--src integration/app]
//        [--allow host|.suffix ...] [--forbid host ...]
//   node integration/device/build_device_bundle.js --check integration/device/dist/A [--src integration/app]
// Guard rules, evaluated in the browser before any app code runs:
//   * hostname matches --forbid               -> blocked
//   * hostname is not localhost/127.0.0.1/[::1] and matches no --allow entry -> blocked
//   Default --allow list: .trycloudflare.com .loca.lt .ngrok-free.app .ngrok.app .ngrok.io .serveo.net .localhost.run .lhr.life
//   Add your own tunnel/test host with --allow. Add your real deployment host with --forbid (recommended).
// A blocked page shows a message, creates no storage, registers no service worker, and runs no app code.
const fs=require('fs'),path=require('path'),crypto=require('crypto');

const args=process.argv.slice(2);
const many=n=>args.reduce((a,x,i)=>x===n?[...a,args[i+1]]:a,[]);
const one=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
const SRC=path.resolve(one('--src')||path.join(__dirname,'..','app'));
const DEFAULT_ALLOW=['.trycloudflare.com','.loca.lt','.ngrok-free.app','.ngrok.app','.ngrok.io','.serveo.net','.localhost.run','.lhr.life'];

const GUARD=(allow,forbid)=>`<script>/*PA-DEVICE-TEST-GUARD*/(function(){var h=location.hostname.toLowerCase(),A=${JSON.stringify(allow)},F=${JSON.stringify(forbid)};
var local=h==='localhost'||h==='127.0.0.1'||h==='[::1]'||h==='::1'||/\\.localhost$/.test(h);
function m(l){return l.some(function(x){x=x.toLowerCase();return x.charAt(0)==='.'?h.slice(-x.length)===x:h===x})}
if(m(F)||(!local&&!m(A))){window.__PA_TEST_BLOCKED=true;try{window.stop()}catch(e){}
var b=document.createElement('body');b.setAttribute('style','background:#300;color:#fff;font:18px -apple-system,sans-serif;padding:24px');var t=document.createElement('h1');t.textContent='TEST BUILD BLOCKED';var q=document.createElement('p');q.textContent='This disposable test build refuses to run on '+(h||'(unknown host)')+'. It is only for a separate test origin. Nothing was read or written.';b.appendChild(t);b.appendChild(q);document.documentElement.appendChild(b);throw new Error('PA test build blocked on '+h)}})();</script>`;
const LABEL=tag=>`<div id="paTestLabel" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;background:#b00020;color:#fff;font:700 11px/16px -apple-system,sans-serif;text-align:center;padding-top:env(safe-area-inset-top)">TEST BUILD ${tag} • DISPOSABLE DATA ONLY • NOT YOUR TRAINING RECORDS</div>`;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

function build(tag,out,allow,forbid){
 if(!/^[A-Za-z0-9]{1,12}$/.test(tag))throw Error('--tag must be 1-12 letters/digits');
 fs.rmSync(out,{recursive:true,force:true});fs.cpSync(SRC,out,{recursive:true});
 const idx=path.join(out,'index.html');let h=fs.readFileSync(idx,'utf8');
 const need=(s,what)=>{if(h.split(s).length!==2)throw Error('expected exactly one '+what+' in index.html')};
 need('<meta charset="utf-8">','charset meta');need('<title>Project America HQ 2.3</title>','title');need('<body>','body tag');
 h=h.replace('<meta charset="utf-8">',()=>'<meta charset="utf-8">'+GUARD(allow,forbid));
 h=h.replace('<title>Project America HQ 2.3</title>',()=>'<title>TEST '+tag+' • Project America HQ 2.3</title>');
 h=h.replace('<body>',()=>'<body>'+LABEL(tag));
 fs.writeFileSync(idx,h);
 const swp=path.join(out,'sw.js');let sw=fs.readFileSync(swp,'utf8');const m=/const CACHE='(project-america-shell-[^']+)';/.exec(sw);if(!m)throw Error('no CACHE constant in sw.js');
 fs.writeFileSync(swp,sw.replace(m[0],()=>`const CACHE='project-america-shell-devicetest-${tag.toLowerCase()}';`));
 const mp=path.join(out,'manifest.webmanifest');const man=JSON.parse(fs.readFileSync(mp,'utf8'));
 man.name='PA TEST '+tag+' (disposable)';man.short_name='PA TEST '+tag;man.id='/pa-device-test';
 fs.writeFileSync(mp,JSON.stringify(man,null,2)+'\n');
 fs.writeFileSync(path.join(out,'TEST_BUNDLE.json'),JSON.stringify({tag,source:path.relative(process.cwd(),SRC),sourceIndexSha256:sha(fs.readFileSync(path.join(SRC,'index.html'))),sourceSwSha256:sha(fs.readFileSync(path.join(SRC,'sw.js'))),allow,forbid,builtAt:new Date().toISOString()},null,1)+'\n');
 return out;
}

function check(dir){
 const problems=[];const rd=f=>fs.readFileSync(path.join(dir,f),'utf8');const rs=f=>fs.readFileSync(path.join(SRC,f),'utf8');
 const meta=JSON.parse(rd('TEST_BUNDLE.json'));
 let h=rd('index.html');
 const g=h.indexOf('<script>/*PA-DEVICE-TEST-GUARD*/'),ge=h.indexOf('</script>',g)+9;
 if(g<0)problems.push('guard missing');else h=h.slice(0,g)+h.slice(ge);
 const ls=h.indexOf('<div id="paTestLabel"'),le=h.indexOf('</div>',ls)+6;if(ls<0)problems.push('label missing');else h=h.slice(0,ls)+h.slice(le);
 h=h.replace('<title>TEST '+meta.tag+' • Project America HQ 2.3</title>','<title>Project America HQ 2.3</title>');
 if(h!==rs('index.html'))problems.push('index.html differs from the source beyond guard, label and title');
 const swSrc=rs('sw.js'),swNow=rd('sw.js');const c=/const CACHE='[^']+';/;
 if(swNow.replace(c,'')!==swSrc.replace(c,''))problems.push('sw.js differs from the source beyond the cache name');
 if(!/const CACHE='project-america-shell-devicetest-[a-z0-9]+';/.test(swNow))problems.push('sw.js cache name is not a device-test name');
 const man=JSON.parse(rd('manifest.webmanifest')),ms=JSON.parse(rs('manifest.webmanifest'));
 for(const k of ['name','short_name','id'])delete man[k],delete ms[k];
 if(JSON.stringify(man)!==JSON.stringify(ms))problems.push('manifest differs beyond name, short_name, id');
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 const rel=d=>walk(d).map(f=>path.relative(d,f)).sort();
 const extra=rel(dir).filter(f=>!rel(SRC).includes(f));if(extra.join()!=='TEST_BUNDLE.json')problems.push('unexpected extra files: '+extra.join(','));
 for(const f of rel(SRC))if(!['index.html','sw.js','manifest.webmanifest'].includes(f)&&(!fs.existsSync(path.join(dir,f))||sha(fs.readFileSync(path.join(dir,f)))!==sha(fs.readFileSync(path.join(SRC,f)))))problems.push('file changed or missing: '+f);
 return problems;
}

if(require.main===module){
 const chk=one('--check');
 if(chk){const p=check(path.resolve(chk));if(p.length){console.error('BUNDLE CHECK FAILED\n - '+p.join('\n - '));process.exit(1)}console.log('OK: '+chk+' differs from '+path.relative(process.cwd(),SRC)+' only by the guard, the TEST label, the title, the cache name and the manifest name/short_name/id');process.exit(0)}
 const tag=one('--tag'),out=one('--out');if(!tag||!out){console.error('Usage: build_device_bundle.js --tag A --out <dir> [--src dir] [--allow host|.suffix ...] [--forbid host ...] | --check <dir>');process.exit(2)}
 const allow=[...DEFAULT_ALLOW,...many('--allow')],forbid=many('--forbid');
 build(tag,path.resolve(out),allow,forbid);const p=check(path.resolve(out));if(p.length){console.error('BUNDLE CHECK FAILED\n - '+p.join('\n - '));process.exit(1)}
 console.log(`built ${out} (tag ${tag}); allow=${allow.join(' ')}; forbid=${forbid.join(' ')||'(none: add --forbid <your real host>)'}`);
}
module.exports={build,check,DEFAULT_ALLOW};
