#!/usr/bin/env node
'use strict';
// Private-network server for the iPhone trials. It never opens a public tunnel and never listens on a public address.
//  * binds ONLY to the private IPv4 address you choose (default: the first RFC1918 address of this computer); refuses to start on a public address
//  * answers ONLY clients whose address is private, link-local or loopback (anything else gets 403 and is logged)
//  * serves only a test bundle (it must contain TEST_BUNDLE.json); that file and everything outside the bundle are never served
//  * shuts itself down after --ttl minutes (default 120) and on Ctrl+C
//  * logs every request (time, client address, path, status) so you can see exactly which devices connected
//  * HTTP by default; --cert/--key serve HTTPS (needed for the service worker, offline mode, Home-Screen install and the update test on iOS)
// Usage: node lan_test_server.js <bundleDir> [--bind 192.168.x.y] [--port 8787] [--ttl 120] [--cert cert.pem --key key.pem] [--seed DISPOSABLE_TEST_BACKUP.json]
// Type "swap <bundleDir>" + Enter to serve another build (service-worker update test).
const http=require('http'),https=require('https'),fs=require('fs'),os=require('os'),path=require('path');
const isPrivate=ip=>{ip=String(ip||'').replace(/^::ffff:/,'');return /^10\./.test(ip)||/^192\.168\./.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip)||/^169\.254\./.test(ip)||ip==='127.0.0.1'||ip==='::1'||/^f[cd][0-9a-f]{2}:/i.test(ip)||/^fe80:/i.test(ip)};
const VIRTUAL=/vEthernet|VirtualBox|VMware|WSL|Loopback|Docker|Hyper-V|Tailscale|ZeroTier|vpn|TAP|TUN|utun|bridge|veth|virbr/i;
const candidates=()=>Object.entries(os.networkInterfaces()).flatMap(([name,l])=>(l||[]).filter(i=>i.family==='IPv4'&&!i.internal&&isPrivate(i.address)&&i.address!=='127.0.0.1').map(i=>({name,address:i.address,virtual:VIRTUAL.test(name),link:/^169\.254\./.test(i.address)})));
const pickBind=()=>{const c=candidates();return (c.find(x=>!x.virtual&&!x.link&&/wi-?fi|wlan|wireless|en0|wl/i.test(x.name))||c.find(x=>!x.virtual&&!x.link)||c.find(x=>!x.link)||c[0]||{}).address};
function main(){
const a=process.argv.slice(2),opt=n=>a.includes(n)?a[a.indexOf(n)+1]:null;
const dirArg=a.find((x,i)=>!x.startsWith('--')&&!['--bind','--port','--ttl','--cert','--key','--seed'].includes(a[i-1]));
let root=path.resolve(dirArg||'');const port=+(opt('--port')||8787),ttl=+(opt('--ttl')||120),certF=opt('--cert'),keyF=opt('--key'),seedF=opt('--seed');
if(!fs.existsSync(path.join(root,'TEST_BUNDLE.json'))){console.error('Refusing to serve: not a test bundle (no TEST_BUNDLE.json). Build one with build_device_bundle.js.');process.exit(2)}
if(!!certF!==!!keyF){console.error('--cert and --key must be given together');process.exit(2)}
const bind=opt('--bind')||pickBind();
if(!bind){console.error('No private network address found. Connect this computer to the same Wi-Fi as the phone, or pass --bind <private ip>.');process.exit(2)}
if(!isPrivate(bind)||bind==='0.0.0.0'){console.error('Refusing to bind to '+bind+': only private (RFC1918/link-local) addresses are allowed.');process.exit(2)}
const T={'.html':'text/html; charset=utf-8','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png','.txt':'text/plain'};
const log=(ip,p,code)=>console.log(`${new Date().toISOString().slice(11,19)}  ${String(ip).replace(/^::ffff:/,'').padEnd(15)} ${String(code).padEnd(3)} ${p}`);
const handler=(req,res)=>{try{handle(req,res)}catch(e){try{res.writeHead(400);res.end()}catch{}log(req.socket.remoteAddress,'(bad request)',400)}};
const handle=(req,res)=>{
 const ip=req.socket.remoteAddress,u=new URL(req.url,'http://x');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return log(ip,req.method+' '+u.pathname+' (REFUSED: read-only server)',405)}
 if(!isPrivate(ip)){res.writeHead(403);res.end();return log(ip,u.pathname+' (REFUSED: not a private address)',403)}
 if(seedF&&u.pathname==='/DISPOSABLE_TEST_BACKUP.json'){res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="DISPOSABLE_TEST_BACKUP.json"','Cache-Control':'no-store'});res.end(fs.readFileSync(seedF));return log(ip,u.pathname+' (synthetic seed backup)',200)}
 const rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');const f=path.resolve(root,rel);
 if((f!==root&&!f.startsWith(root+path.sep))||rel==='TEST_BUNDLE.json'){res.writeHead(404);res.end();return log(ip,u.pathname,404)}
 fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);res.end();return log(ip,u.pathname,404)}res.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(b);log(ip,u.pathname,200)});
};
const server=certF?https.createServer({cert:fs.readFileSync(certF),key:fs.readFileSync(keyF)},handler):http.createServer(handler);
server.listen(port,bind,()=>{const proto=certF?'https':'http';
 console.log(`\nTEST SERVER RUNNING\n  URL for the iPhone:  ${proto}://${bind}:${port}/\n  serving:             ${root}\n  reachable only from: private networks (other clients get 403); listening on ${bind} only\n  stops automatically: in ${ttl} min (or Ctrl+C)\n  seed backup:          ${seedF?proto+'://'+bind+':'+port+'/DISPOSABLE_TEST_BACKUP.json (synthetic data only)':'(none)'}
  service worker/offline/install on iOS: ${certF?'possible (HTTPS)':'NOT available over plain HTTP (iOS needs HTTPS)'}\n`);
 const others=candidates().filter(c=>c.address!==bind);if(others.length)console.log('  other private addresses on this computer (use --bind <ip> if the phone cannot reach the URL above):\n'+others.map(c=>`    ${c.address}  (${c.name}${c.virtual?', looks virtual':''}${c.link?', link-local':''})`).join('\n')+'\n');
 setTimeout(()=>{console.log('TTL reached: shutting down');process.exit(0)},ttl*60000).unref?.();});
process.on('SIGINT',()=>{console.log('\nstopped');process.exit(0)});process.on('SIGTERM',()=>process.exit(0));
if(process.stdin.isTTY!==false)process.stdin.on('data',d=>{const m=/^swap\s+(.+)$/.exec(String(d).trim());if(!m)return;const n=path.resolve(m[1]);if(!fs.existsSync(path.join(n,'TEST_BUNDLE.json'))){console.log('not a test bundle');return}root=n;console.log('now serving '+root)});

}
if(require.main===module)main();
module.exports={isPrivate,candidates,pickBind,VIRTUAL};
