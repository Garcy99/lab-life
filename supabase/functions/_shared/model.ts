export const LABS = ['FAB LAB', 'FASHION LAB', 'BUILDING TECH LAB'] as const;
export type Lab = typeof LABS[number];
export type Hours = { open: string; close: string; enabled: boolean };
export const PROGRAMMES = ['BAS','BID','BIFD'] as const;
export type Programme=typeof PROGRAMMES[number];
export type Submission = { id: string; title: string; date: string; time: string; type: 'PARTIAL'|'FINAL'|'OTHER'; course: string; programme?:Programme; completed: boolean; description: string; labs?: Lab[] };
export type Closure = { id: string; title: string; start: string; end: string; labs: Lab[]; description: string; kind?:'partial'|'full' };
export type Poster = { id: string; title: string; subtitle: string; body: string; image: string; start: string; end: string; enabled: boolean; labs?: Lab[] };
export type Appearance = {buttonRadius:number;accent:'sky'|'navy';posterTone:'ice'|'navy';font:'sans'|'editorial'|'montserrat';tagline:string;logo:string;closureColor?:string;closedDayColor?:string};
export const DEFAULT_APPEARANCE:Appearance={buttonRadius:12,accent:'navy',posterTone:'ice',font:'sans',tagline:'SPACE TO CREATE. ROOM TO GROW.',logo:'',closureColor:'#FDE8E7',closedDayColor:'#EEEEEE'};
export type ScreenSettings={logo?:string;splitProgrammes?:boolean;programmes?:Programme[];labs:Lab[];layout:'balanced'|'information'|'poster';showSubmissions:boolean;showClosures:boolean;showCalendar:boolean;showLabStatus:boolean;textScale:'normal'|'large';rotation:number};
export type ScreenProfile={id:string;name:string;settings:ScreenSettings;enabled:boolean;lastSeen:string|null};
export const DEFAULT_SCREEN:ScreenSettings={labs:[...LABS],layout:'balanced',showSubmissions:true,showClosures:true,showCalendar:true,showLabStatus:true,textScale:'normal',rotation:15};
export type Content = { version: 2; campus: string; timezone: string; rotation: number; defaults: {due: string; close: string; reopen: string}; hours: Record<Lab, Hours[]>; submissions: Submission[]; closures: Closure[]; posters: Poster[];appearance?:Appearance };
export type Snapshot = {id: string; content: Content; revision: number; updatedAt: string; owner?: boolean; email?: string;screen?:ScreenProfile};
export function validateScreenSettings(value:unknown):ScreenSettings {const s=structuredClone(value) as ScreenSettings;if(!s||!Array.isArray(s.labs)||!s.labs.length||!s.labs.every(l=>LABS.includes(l))||new Set(s.labs).size!==s.labs.length||!['balanced','information','poster'].includes(s.layout)||!['normal','large'].includes(s.textScale)||!Number.isInteger(s.rotation)||s.rotation<8||s.rotation>120||!['showSubmissions','showClosures','showCalendar','showLabStatus'].every(k=>typeof s[k as keyof ScreenSettings]==='boolean'))throw Error('Choose valid labs, layout, visibility and poster timing.');if(s.logo!==undefined&&(typeof s.logo!=='string'||!/^([a-zA-Z0-9-]+\.(png|jpeg|webp))?$/.test(s.logo)))throw Error('Choose a valid screen logo.');if(s.splitProgrammes!==undefined&&typeof s.splitProgrammes!=='boolean')throw Error('Choose a valid submission layout.');if(s.programmes!==undefined&&(!Array.isArray(s.programmes)||!s.programmes.length||s.programmes.some(p=>!PROGRAMMES.includes(p))||new Set(s.programmes).size!==s.programmes.length))throw Error('Choose at least one valid programme.');if(s.layout==='information'&&!s.showSubmissions&&!s.showClosures&&!s.showCalendar&&!s.showLabStatus)throw Error('Enable at least one information section.');return s}
export function filterForScreen(content:Content,s:ScreenSettings):Content {const c=structuredClone(content);const relevant=(e:{labs?:Lab[]})=>!e.labs?.length||e.labs.some(l=>s.labs.includes(l));c.submissions=(s.showSubmissions||s.showCalendar)?c.submissions.filter(e=>relevant(e)&&(!submissionProgramme(e)||screenProgrammes(s).includes(submissionProgramme(e)!))):[];c.closures=s.showClosures||s.showLabStatus||s.showCalendar?c.closures.filter(e=>e.labs.some(l=>s.labs.includes(l))).map(e=>({...e,labs:e.labs.filter(l=>s.labs.includes(l))})):[];c.posters=c.posters.filter(relevant);if(s.logo)c.appearance={...DEFAULT_APPEARANCE,...c.appearance,logo:s.logo};c.rotation=s.rotation;return c}
export function localParts(now = new Date(), timezone = 'Europe/Madrid') {
  const p = new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const v=(s:string)=>p.find(x=>x.type===s)?.value||'';
  return {date:`${v('year')}-${v('month')}-${v('day')}`,time:`${v('hour')}:${v('minute')}`};
}
export function instant(value:string, timezone:string):number {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  const [date,time]=value.split('T');const probe=new Date(date+'T12:00Z');if(!Number.isFinite(+probe)||probe.toISOString().slice(0,10)!==date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return NaN;
  const target=Date.parse(value+'Z'); if(!Number.isFinite(target))return NaN;
  let guess=target;
  for(let i=0;i<4;i++){const p=localParts(new Date(guess),timezone);const diff=target-Date.parse(`${p.date}T${p.time}Z`);if(!diff)return guess;guess+=diff}
  return NaN;
}
export const due=(s:Submission,c:Content)=>instant(`${s.date}T${s.time||c.defaults.due}`,c.timezone);
export function countdown(target:number,now=Date.now()) {const ms=target-now;if(ms<0)return {number:'—',unit:'OVERDUE'};const hours=ms/3600000;return hours<24?{number:String(Math.max(1,Math.ceil(hours))),unit:Math.ceil(hours)<=1?'HOUR':'HOURS'}:{number:String(Math.floor(hours/24)),unit:Math.floor(hours/24)===1?'DAY':'DAYS'}}
export function submissionDays(s:Submission,c:Content,now=Date.now()){const today=localParts(new Date(now),c.timezone).date;return Math.round((Date.parse(s.date+'T00:00Z')-Date.parse(today+'T00:00Z'))/86400000)}
export const nextSubmission=(c:Content,now=Date.now())=>c.submissions.filter(s=>!s.completed&&submissionDays(s,c,now)>=0).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))[0];
export const nextClosure=(c:Content,now=Date.now())=>c.closures.filter(e=>instant(e.end,c.timezone)>now).sort((a,b)=>Number(instant(a.start,c.timezone)>now)-Number(instant(b.start,c.timezone)>now)||instant(a.start,c.timezone)-instant(b.start,c.timezone))[0];
export function labStatus(lab:Lab,c:Content,now=Date.now()) {
  const periods=c.closures.filter(e=>e.labs.includes(lab)).map(e=>({start:instant(e.start,c.timezone),end:instant(e.end,c.timezone),title:e.title})).sort((a,b)=>a.start-b.start);
  const active=periods.find(e=>e.start<=now&&e.end>now);
  const {date}=localParts(new Date(now),c.timezone);const dayDate=new Date(date+'T12:00Z');const dow=(dayDate.getUTCDay()+6)%7;const today=c.hours[lab][dow];const closing=instant(`${date}T${today.close}`,c.timezone);
  const inHours=today.enabled&&now>=instant(`${date}T${today.open}`,c.timezone)&&now<closing;
  if(!active&&inHours){const next=periods.find(e=>e.start>now);const soon=next&&next.start-now<=7*86400000;return {status:soon?'CLOSING SOON':'OPEN',detail:soon?'Closure starts':'Open until',at:soon?next.start:closing,reason:soon?next.title:''}}
  let available=0;
  // Intersect regular opening windows with the complement of all scheduled closures.
  for(let i=0;i<740;i++){const d=new Date(+dayDate+i*86400000);const ds=d.toISOString().slice(0,10),h=c.hours[lab][(dow+i)%7];if(!h.enabled)continue;let candidate=Math.max(now,instant(`${ds}T${h.open}`,c.timezone));const end=instant(`${ds}T${h.close}`,c.timezone);for(const p of periods){if(p.start>candidate)break;if(p.end>candidate)candidate=p.end}if(Number.isFinite(candidate)&&candidate<end){available=candidate;break}}
  return {status:'CLOSED',detail:available?(active?'Reopens':'Next opening'):'No opening scheduled',at:available,reason:active?.title||'Outside opening hours'};
}
export const activePosters=(c:Content,now=Date.now())=>c.posters.filter(p=>p.enabled&&(!p.start||instant(p.start,c.timezone)<=now)&&(!p.end||instant(p.end,c.timezone)>now));
export function sampleContent():Content {
  const date=localParts().date;const rel=(n:number)=>{const d=new Date(date+'T12:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
  const hours=Object.fromEntries(LABS.map(l=>[l,Array.from({length:7},(_,i)=>({enabled:i<5,open:'09:00',close:l==='FASHION LAB'?'19:00':'18:00'}))])) as Content['hours'];
  return {version:2,campus:'IE University · Creative Labs',timezone:'Europe/Madrid',rotation:15,defaults:{due:'23:59',close:'00:00',reopen:'09:00'},hours,submissions:[{id:crypto.randomUUID(),title:'Wearable Futures',date:rel(5),time:'',type:'FINAL',course:'Fashion Design',completed:false,description:'Sample submission — replace with your actual deadline.'},{id:crypto.randomUUID(),title:'Objects for Tomorrow',date:rel(9),time:'',type:'PARTIAL',course:'Product Design',completed:false,description:''},{id:crypto.randomUUID(),title:'Space / Place',date:rel(14),time:'',type:'FINAL',course:'Architecture',completed:false,description:''}],closures:[{id:crypto.randomUUID(),title:'Equipment maintenance',start:rel(7)+'T09:00',end:rel(9)+'T09:00',labs:['FAB LAB'],description:'Sample closure — replace with your actual schedule.'}],posters:[{id:crypto.randomUUID(),title:'Make something\nthat matters.',subtitle:'YOUR NEXT IDEA STARTS HERE',body:'Tools. Materials. Possibilities.\nDiscover your Creative Labs.',image:'',start:'',end:'',enabled:true}]};
}
export function validateContent(v:unknown):Content {
  const c=structuredClone(v) as Content;
  const str=(x:unknown,n=200)=>typeof x==='string'&&x.length<=n;
  const time=(x:unknown)=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
  const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&new Date(x+'T12:00Z').toISOString().slice(0,10)===x;
  if(!c||c.version!==2||!str(c.campus,100)||!str(c.timezone,100)||!Number.isInteger(c.rotation)||c.rotation<8||c.rotation>120)throw Error('Invalid display settings.');
  try{new Intl.DateTimeFormat('en',{timeZone:c.timezone}).format()}catch{throw Error('Choose a valid timezone.')}
  if(!c.defaults||!['due','close','reopen'].every(k=>time(c.defaults[k as keyof typeof c.defaults])))throw Error('Default times are invalid.');
  if(c.appearance){const a=c.appearance;if(!Number.isInteger(a.buttonRadius)||a.buttonRadius<0||a.buttonRadius>28||!['sky','navy'].includes(a.accent)||!['ice','navy'].includes(a.posterTone)||!['sans','editorial','montserrat'].includes(a.font)||!str(a.tagline,120)||!str(a.logo,100)||!/^([a-zA-Z0-9-]+\.(png|jpeg|webp))?$/.test(a.logo))throw Error('Invalid appearance settings.');for(const color of [a.closureColor,a.closedDayColor])if(color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(color))throw Error('Choose a valid calendar colour.');}
  if(!c.hours||!LABS.every(l=>Array.isArray(c.hours[l])&&c.hours[l].length===7&&c.hours[l].every(h=>typeof h.enabled==='boolean'&&time(h.open)&&time(h.close)&&(!h.enabled||h.close>h.open))))throw Error('Opening hours must close after opening on the same day.');
  const ids=new Set();
  for(const e of [...(c.submissions||[]),...(c.posters||[])])if(e.labs!==undefined&&(!Array.isArray(e.labs)||!e.labs.every(l=>LABS.includes(l))||new Set(e.labs).size!==e.labs.length))throw Error('Choose valid target laboratories.');
  for(const list of [c.submissions,c.closures,c.posters]){if(!Array.isArray(list)||list.length>500)throw Error('Each section supports up to 500 entries.');for(const e of list){if(!str(e.id,80)||!e.id||ids.has(e.id)||!str(e.title)||!e.title.trim())throw Error('Every item needs a unique ID and title.');ids.add(e.id)}}
  for(const s of c.submissions){if(s.programme!==undefined&&!PROGRAMMES.includes(s.programme))throw Error('Choose BAS, BID or BIFD.');if(!date(s.date)||(s.time&&!time(s.time))||!['PARTIAL','FINAL','OTHER'].includes(s.type)||typeof s.completed!=='boolean'||!str(s.course)||!str(s.description,4000)||!Number.isFinite(due(s,c)))throw Error('Invalid submission date, time, or fields.')}
  for(const e of c.closures){if(e.kind!==undefined&&!['partial','full'].includes(e.kind))throw Error('Choose a partial or full closure.');if(e.kind==='full'&&(!e.start.endsWith('T00:00')||!e.end.endsWith('T00:00')))throw Error('Choose whole dates for a full closure.');if(!Number.isFinite(instant(e.start,c.timezone))||!Number.isFinite(instant(e.end,c.timezone))||instant(e.end,c.timezone)<=instant(e.start,c.timezone)||!Array.isArray(e.labs)||!e.labs.length||!e.labs.every(l=>LABS.includes(l))||!str(e.description,4000))throw Error('Choose affected labs and a reopening time after the closure starts.')}
  for(const p of c.posters){if(!str(p.subtitle,200)||!str(p.body,1200)||!str(p.image,100)||!/^([a-zA-Z0-9-]+\.(png|jpeg|webp))?$/.test(p.image)||typeof p.enabled!=='boolean'||(p.start&&!Number.isFinite(instant(p.start,c.timezone)))||(p.end&&!Number.isFinite(instant(p.end,c.timezone)))||(p.start&&p.end&&instant(p.end,c.timezone)<=instant(p.start,c.timezone)))throw Error('Invalid poster dates or image.')}
  if(JSON.stringify(c).length>800000)throw Error('Backup is too large.');return c;
}

// Local calendar dates avoid the browser's timezone and 23/25-hour DST days.
export function shiftDate(date:string,days:number){const d=new Date(date+'T12:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function openingWindows(lab:Lab,c:Content,date:string):Hours[]{
 const weekday=(new Date(date+'T12:00Z').getUTCDay()+6)%7,h=c.hours[lab][weekday];if(!h.enabled)return [];
 const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
 let windows=[[minutes(h.open),minutes(h.close)]];
 for(const closure of c.closures.filter(e=>e.labs.includes(lab)&&e.start<date+'T24:00'&&e.end>date+'T00:00')){
  const start=closure.start.slice(0,10)<date?0:minutes(closure.start.slice(11)),end=closure.end.slice(0,10)>date?1440:minutes(closure.end.slice(11));
  windows=windows.flatMap(([a,b])=>end<=a||start>=b?[[a,b]]:[[a,Math.max(a,start)],[Math.min(b,end),b]].filter(([x,y])=>x<y));
 }
 const time=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 return windows.map(([a,b])=>({enabled:true,open:time(a),close:time(b)}));
}

export const labName=(lab:Lab)=>({'FAB LAB':'FabLab','FASHION LAB':'Fashion Lab','BUILDING TECH LAB':'Building Tech Lab'}[lab]);
export function submissionProgramme(s:Submission):Programme|undefined{if(s.programme)return s.programme;const course=s.course.toUpperCase().replace(/[^A-Z0-9]/g,'');if(course.includes('BIFD'))return 'BIFD';if(course.includes('BID'))return 'BID';if(course.includes('BAS'))return 'BAS';return undefined}
export function screenProgrammes(s:ScreenSettings):Programme[]{return s.programmes||PROGRAMMES.filter(p=>p==='BIFD'?s.labs.includes('FASHION LAB'):s.labs.some(l=>l!=='FASHION LAB'))}
export const splitSubmissions=(s:ScreenSettings)=>s.splitProgrammes??(s.labs.length===1&&s.labs[0]==='FAB LAB');
export const displayDate=(date:string)=>date.split('-').reverse().join('/');

// Saved closures without a kind retain their exact hours. Classify each date
// against its regular opening window, including overlapping legacy closures.
export function calendarClosure(c:Content,date:string,labs:readonly Lab[]):'full'|'partial'|null{
 const weekday=(new Date(date+'T12:00Z').getUTCDay()+6)%7;
 let partial=false;
 for(const lab of labs){
  if(c.closures.some(e=>e.kind==='full'&&e.labs.includes(lab)&&e.start<date+'T24:00'&&e.end>date+'T00:00'))return 'full';
  const h=c.hours[lab][weekday];if(!h.enabled)continue;
  const relevant=c.closures.filter(e=>e.labs.includes(lab)&&e.start<date+'T'+h.close&&e.end>date+'T'+h.open);
  if(!relevant.length)continue;
  if(relevant.some(e=>e.kind==='full')||openingWindows(lab,c,date).length===0)return 'full';
  partial=true;
 }
 return partial?'partial':null;
}
export function closureKind(e:Closure,c:Content):'full'|'partial'{
 if(e.kind)return e.kind;
 // A legacy interval is full only when every scheduled opening window it
 // touches is entirely covered; otherwise preserve it as an hourly closure.
 let scheduled=false;
 const start=e.start.slice(0,10),end=e.end.slice(0,10),dates=new Set([end,...Array.from({length:8},(_,i)=>shiftDate(start,i)).filter(d=>d<=end)]);
 for(const date of dates){
  const weekday=(new Date(date+'T12:00Z').getUTCDay()+6)%7;
  for(const lab of e.labs){const h=c.hours[lab][weekday];if(!h.enabled||e.start>=date+'T'+h.close||e.end<=date+'T'+h.open)continue;scheduled=true;if(e.start>date+'T'+h.open||e.end<date+'T'+h.close)return 'partial'}
 }
 return scheduled?'full':'partial';
}

