'use strict';
// Read-only extraction of program definitions from the running app. Synthetic/empty storage only.
// Usage: node audit/scripts/extract.js <appDir> <outDir>
const fs=require('fs'),path=require('path');
const {launch}=require('../../tests/lib/cdp.js'),{serve}=require('../../tests/lib/server.js');
const [appDir,outDir]=process.argv.slice(2);fs.mkdirSync(outDir,{recursive:true});
const NAMES=['L','slots','baseSlots','BLOCKS','T','TEMPLATE_META','TEMPLATE_MODES','CARDIO_MACHINES','special','INTENSIFIERS','IP','DEFAULT_INT','INTENSIFIER_WHY','STRENGTH_METHODS','STRENGTH_INFO','ACTIVATORS','LOADED_STRETCH','LOADED_BY_MUSCLE','STRETCH','MOB','GIANT_BOOKENDS','EXTRA_META','PA20','SKILLS','PHASE_DETAILS','EX_GUIDE','RELATED_GROUPS','VARIANT_NOTES','RELATED_ADDITIONS','WEEK_LABELS','PA21_EQUIP','DAYN'];
(async()=>{const s=await serve(appDir),b=await launch();const p=await b.newPage('/tmp');await p.goto(s.origin+'/');
 for(const n of NAMES){try{const v=await p.eval(`(()=>{try{return typeof ${n}==='undefined'?'__undefined__':JSON.parse(JSON.stringify(${n}))}catch(e){return '__err__'+e.message}})()`);fs.writeFileSync(path.join(outDir,n+'.json'),JSON.stringify(v,null,1));console.log(n,typeof v==='object'?Object.keys(v).length:v)}catch(e){console.log(n,'ERR',e.message)}}
 await b.close();await s.close()})();
