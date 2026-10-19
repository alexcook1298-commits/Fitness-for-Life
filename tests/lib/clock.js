'use strict';
// Page-side clock and time-zone control for the real app in headless Chrome (synthetic, per-page).
// setTimezone must be called before computing local instants; freezing is lost on navigation/reload.
const setTimezone=(p,timezoneId)=>p.send('Emulation.setTimezoneOverride',{timezoneId});
// Freeze Date.now()/new Date() to an absolute instant (ISO string) while keeping the real Date for explicit arguments.
const freezeAt=(p,iso)=>p.eval(iso=>{
 const R=window.__RealDate||Date;window.__RealDate=R;const target=new R(iso).getTime();
 class F extends R{constructor(...a){if(a.length===0)super(target);else super(...a)}static now(){return target}}
 window.Date=F;return target},iso);
// Local wall-clock instant in the page's CURRENT time zone -> epoch ms (uses the real Date).
const localMs=(p,y,mo,d,h=0,mi=0,s=0)=>p.eval((y,mo,d,h,mi,s)=>new (window.__RealDate||Date)(y,mo-1,d,h,mi,s).getTime(),y,mo,d,h,mi,s);
const freezeLocal=async(p,y,mo,d,h=0,mi=0,s=0)=>freezeAt(p,new Date(await localMs(p,y,mo,d,h,mi,s)).toISOString());
const unfreeze=p=>p.eval(()=>{if(window.__RealDate)window.Date=window.__RealDate});
module.exports={setTimezone,freezeAt,localMs,freezeLocal,unfreeze};
