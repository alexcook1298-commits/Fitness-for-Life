#!/usr/bin/env node
'use strict';
// Serves a built test bundle on 127.0.0.1 (for a tunnel) with the same no-cache headers as the real _headers file.
// Usage: node integration/device/serve_bundle.js <bundleDir> [--port 8787]
// "Deploy" a new build for the service-worker update test by pointing it at another directory: type  swap <dir>  on stdin.
const http=require('http'),fs=require('fs'),path=require('path');
const a=process.argv.slice(2);let root=path.resolve(a.find(x=>!x.startsWith('--')&&a[a.indexOf(x)-1]!=='--port')||'');const port=+(a.includes('--port')?a[a.indexOf('--port')+1]:8787);
if(!fs.existsSync(path.join(root,'TEST_BUNDLE.json'))){console.error('Refusing to serve: not a test bundle (no TEST_BUNDLE.json). Build one with build_device_bundle.js.');process.exit(2)}
const T={'.html':'text/html; charset=utf-8','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png','.txt':'text/plain'};
http.createServer((req,res)=>{const u=new URL(req.url,'http://x');const rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');const f=path.resolve(root,rel);
 if(f!==root&&!f.startsWith(root+path.sep)||rel==='TEST_BUNDLE.json'){res.writeHead(404);return res.end()}
 fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(b)})
}).listen(port,'127.0.0.1',()=>console.log(`serving ${root} at http://127.0.0.1:${port}  (type "swap <bundleDir>" + Enter to deploy another build)`));
process.stdin.on('data',d=>{const m=/^swap\s+(.+)$/.exec(String(d).trim());if(!m)return;const n=path.resolve(m[1]);if(!fs.existsSync(path.join(n,'TEST_BUNDLE.json'))){console.log('not a test bundle');return}root=n;console.log('now serving '+root)});
