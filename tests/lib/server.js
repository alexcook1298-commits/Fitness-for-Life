'use strict';
// Static file server for a local app directory (127.0.0.1 is a secure context, so the service worker runs).
const http=require('http'),fs=require('fs'),path=require('path');
const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png','.txt':'text/plain','.json':'application/json'};
function serve(dir){
 const root=path.resolve(dir);
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://x');const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,'');
  const file=path.resolve(root,rel);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(buf)});
 });
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r({origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(c=>server.close(c))})));
}
module.exports={serve};
