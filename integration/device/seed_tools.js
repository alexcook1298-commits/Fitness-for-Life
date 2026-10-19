'use strict';
// Re-dates the committed synthetic backup so its sessions look recent (budget and "last 7 days" views), without Chrome.
// Only timestamps are shifted (ISO strings and epoch milliseconds inside the stored JSON); nothing else is changed.
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
function shift(v,delta){
 if(typeof v==='string')return ISO.test(v)?new Date(Date.parse(v)+delta).toISOString():v;
 if(typeof v==='number')return v>1e12&&v<4e12?v+delta:v;
 if(Array.isArray(v))return v.map(x=>shift(x,delta));
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,shift(x,delta)]));
 return v;
}
function redate(backup,nowMs=Date.now()){
 const base=Date.parse(backup.createdAt);if(!(base>0))throw Error('seed backup has no valid createdAt');
 const delta=nowMs-base,out={...backup,createdAt:new Date(nowMs).toISOString(),data:{}};
 for(const [k,s] of Object.entries(backup.data)){let parsed;try{parsed=JSON.parse(s)}catch{out.data[k]=s;continue}out.data[k]=typeof parsed==='object'&&parsed!==null?JSON.stringify(shift(parsed,delta)):s}
 return out;
}
module.exports={redate};
