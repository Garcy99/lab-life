import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {filterForScreen, pruneExpired, sampleContent, validateContent, validateScreenSettings, type Content, type ScreenSettings} from '../_shared/model.ts';

const BUCKET='lab-life-media';
const IMAGE=/^[a-zA-Z0-9-]+\.(png|jpeg|webp)$/;
type Board={id:string;owner_id:string;content:Content;revision:number;display_hash:string|null;updated_at:string};
type Screen={id:string;board_id:string;name:string;settings:ScreenSettings;token_hash:string;enabled:boolean;last_seen:string|null};
class ApiError extends Error {constructor(message:string,public status=400){super(message)}}
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export async function hash(token:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')}
const snapshot=(b:Board)=>({id:b.id,content:pruneExpired(b.content),revision:b.revision,updatedAt:b.updated_at});
const profile=(s:Screen)=>({id:s.id,name:s.name,settings:s.settings,enabled:s.enabled,lastSeen:s.last_seen});
const bearer=(req:Request)=>{const value=req.headers.get('authorization')||'';return value.startsWith('Bearer ')&&value.length<=10000?value.slice(7):''};
const text=(value:unknown,max=100)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new ApiError('Enter a valid name.');return value.trim()};
async function body(req:Request,max=1000000){if(Number(req.headers.get('content-length'))>max)throw new ApiError('Request is too large.',413);const reader=req.body?.getReader();if(!reader)return new Uint8Array();const chunks:Uint8Array[]=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new ApiError('Request is too large.',413)}chunks.push(value)}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes}
async function jsonBody(req:Request){try{return JSON.parse(new TextDecoder().decode(await body(req)))}catch(e){if(e instanceof ApiError)throw e;throw new ApiError('Invalid JSON request.')}}
function checked<T>(result:{data:T;error:unknown}):T{if(result.error)throw new ApiError('Shared storage is temporarily unavailable.',503);return result.data}
function validate<T>(fn:()=>T):T{try{return fn()}catch(e){throw new ApiError(e instanceof Error?e.message:'Invalid content.')}}

// Injection is used by the real-handler regression suite; production supplies
// a server-only administrative client and never returns its credentials.
export function createHandler(admin:any,frontend='https://garcy99.github.io/lab-life',ownerEmail=''){
 const configuredOwner=ownerEmail.trim().toLowerCase();
 const front=new URL(frontend),allowedOrigin=front.origin,base=frontend.replace(/\/$/,'');
 const headers={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Max-Age':'600','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
 let bucketReady=false;
 async function ensureMediaBucket(){
  if(bucketReady)return;
  const existing=await admin.storage.getBucket(BUCKET);
  if(!existing.error&&existing.data){if(existing.data.public!==false)throw new ApiError('Image storage must be configured as private.',503);bucketReady=true;return}
  if(Number(existing.error?.statusCode||existing.error?.status)!==404)throw new ApiError('Image storage is temporarily unavailable.',503);
  const created=await admin.storage.createBucket(BUCKET,{public:false,fileSizeLimit:8*1024*1024,allowedMimeTypes:['image/png','image/jpeg','image/webp']});
  if(created.error){
   // Two authorized first uploads may race to create the same private bucket.
   const raced=await admin.storage.getBucket(BUCKET);
   if(raced.error||raced.data?.public!==false)throw new ApiError('Unable to prepare private image storage.',503);
  }
  bucketReady=true;
 }
 async function user(req:Request){const token=bearer(req);if(!token)throw new ApiError('SIGN_IN',401);let result;try{result=await admin.auth.getUser(token)}catch{throw new ApiError('SIGN_IN',401)}const u=result.data?.user;if(result.error||!u?.id||!u.email||!u.email_confirmed_at||u.is_anonymous)throw new ApiError('SIGN_IN',401);const userId='sb:'+u.id,email=u.email.trim().toLowerCase();const owned=checked<any>(await admin.from('ll_boards').select('id').eq('owner_id',userId).maybeSingle());return {userId,email,owner:!!owned||!!configuredOwner&&email===configuredOwner}}
 async function boardById(id:unknown){if(typeof id!=='string'||!id||id.length>150)throw new ApiError('NOT_FOUND',404);const b=checked<Board|null>(await admin.from('ll_boards').select('*').eq('id',id).maybeSingle());if(!b)throw new ApiError('NOT_FOUND',404);return b}
 async function authorize(req:Request,id:unknown){const u=await user(req),board=await boardById(id);if(!u.owner){const member=checked<any>(await admin.from('ll_members').select('id').eq('board_id',board.id).eq('email',u.email).maybeSingle());if(!member)throw new ApiError('FORBIDDEN',403)}return {board,user:u}}
 async function ownBoard(req:Request){const u=await user(req);if(!u.owner){const memberships=checked<any[]>(await admin.from('ll_members').select('board_id').eq('email',u.email));if(!memberships.length)throw new ApiError('FORBIDDEN',403);const rows=checked<Board[]>(await admin.from('ll_boards').select('*').in('id',memberships.map(m=>m.board_id)).order('updated_at',{ascending:false}).limit(1));if(!rows.length)throw new ApiError('FORBIDDEN',403);return {board:rows[0],user:u}}
  let board=checked<Board|null>(await admin.from('ll_boards').select('*').eq('owner_id',u.userId).maybeSingle());if(board)return {board,user:u};
  // Preserve the imported board's ID, content, revisions and existing links.
  const imported=checked<Board[]>(await admin.from('ll_boards').select('*').limit(2));if(imported.length===1){board=checked<Board>(await admin.from('ll_boards').update({owner_id:u.userId}).eq('id',imported[0].id).select('*').single());return {board,user:u}}
  const row={id:crypto.randomUUID(),owner_id:u.userId,content:sampleContent(),revision:1,updated_at:new Date().toISOString()};
  const inserted=await admin.from('ll_boards').insert(row).select('*').single();
  if(inserted.error?.code==='23505'){board=checked<Board>(await admin.from('ll_boards').select('*').eq('owner_id',u.userId).single());return {board,user:u}}
  return {board:checked<Board>(inserted),user:u};
 }
 async function display(id:string,token:string,screenId:string|null){if(!/^[a-f0-9]{64}$/.test(token))throw new ApiError('FORBIDDEN',403);const board=await boardById(id),digest=await hash(token);if(!screenId){if(board.display_hash!==digest)throw new ApiError('FORBIDDEN',403);return {board,screen:null as Screen|null}}
  const screen=checked<Screen|null>(await admin.from('ll_screens').select('*').eq('id',screenId).eq('board_id',id).maybeSingle());if(!screen||!screen.enabled||screen.token_hash!==digest)throw new ApiError('FORBIDDEN',403);
  if(!screen.last_seen||Date.now()-Date.parse(screen.last_seen)>=60000){screen.last_seen=new Date().toISOString();checked(await admin.from('ll_screens').update({last_seen:screen.last_seen}).eq('id',screen.id).eq('board_id',id))}
  return {board,screen};
 }
 return async(req:Request):Promise<Response>=>{
  try{
   const origin=req.headers.get('origin');if(origin&&origin!==allowedOrigin)throw new ApiError('FORBIDDEN',403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   const url=new URL(req.url),route=url.pathname.replace(/^.*\/lab-life-api\/?/,'').replace(/^api\//,'').replace(/\/$/,''),id=url.searchParams.get('board')||'',screenId=url.searchParams.get('screen');
   if(!['GET','POST','PUT','DELETE'].includes(req.method))throw new ApiError('Method not allowed.',405);
   if(req.method!=='GET'&&origin!==allowedOrigin)throw new ApiError('FORBIDDEN',403);
   if(route==='auth/config'&&req.method==='GET')return json({mode:'email'});
   if(route==='board'&&req.method==='GET'){const auth=id?await authorize(req,id):await ownBoard(req);return json({...snapshot(auth.board),owner:auth.user.owner,email:auth.user.email})}
   if(route==='board'&&req.method==='PUT'){const input=await jsonBody(req),{board}=await authorize(req,input.id);if(!Number.isSafeInteger(input.revision)||input.revision<1||input.revision>=2147483647)throw new ApiError('Invalid revision.');const content=validate(()=>pruneExpired(validateContent(input.content))),updated_at=new Date().toISOString();const rows=checked<Board[]>(await admin.from('ll_boards').update({content,updated_at,revision:input.revision+1}).eq('id',board.id).eq('revision',input.revision).select('*'));if(!rows.length)throw new ApiError('Someone else published changes. Reload the latest content before saving.',409);return json(snapshot(rows[0]))}
   if(route==='display'&&req.method==='GET'){const {board,screen}=await display(id,bearer(req),screenId);return json(screen?{...snapshot(board),content:filterForScreen(board.content,screen.settings),screen:profile(screen)}:snapshot(board))}
   if(route==='display'&&req.method==='POST'){const input=await jsonBody(req),{board,user:u}=await authorize(req,input.id);if(!u.owner)throw new ApiError('FORBIDDEN',403);const token=randomToken();checked(await admin.from('ll_boards').update({display_hash:await hash(token)}).eq('id',board.id));return json({token})}
   if(route==='screens'&&req.method==='GET'){await authorize(req,id);const screens=checked<Screen[]>(await admin.from('ll_screens').select('*').eq('board_id',id).order('name'));return json(screens.map(profile))}
   if(route==='screens'&&req.method!=='GET'){const input=await jsonBody(req),boardId=input.board||input.id,{user:u}=await authorize(req,boardId);if(req.method==='POST'){if(!u.owner)throw new ApiError('FORBIDDEN',403);const name=text(input.name),settings=validate(()=>validateScreenSettings(input.settings)),token=randomToken(),row={id:crypto.randomUUID(),board_id:boardId,name,settings,token_hash:await hash(token),enabled:true,last_seen:null};checked(await admin.from('ll_screens').insert(row));return json({screen:profile(row),token})}
    if(req.method==='DELETE'){if(!u.owner)throw new ApiError('FORBIDDEN',403);checked(await admin.from('ll_screens').delete().eq('id',input.screen).eq('board_id',boardId));return json({ok:true})}
    if(req.method==='PUT'){const found=checked<Screen|null>(await admin.from('ll_screens').select('*').eq('id',input.screen).eq('board_id',boardId).maybeSingle());if(!found)throw new ApiError('NOT_FOUND',404);const name=text(input.name),settings=validate(()=>validateScreenSettings(input.settings));if(typeof input.enabled!=='boolean')throw new ApiError('Choose whether the screen is enabled.');const row=checked<Screen>(await admin.from('ll_screens').update({name,settings,enabled:input.enabled}).eq('id',found.id).eq('board_id',boardId).select('*').single());return json({screen:profile(row)})}
   }
   if(route==='team'&&req.method==='GET'){const {user:u}=await authorize(req,id);if(!u.owner)throw new ApiError('FORBIDDEN',403);return json(checked(await admin.from('ll_members').select('id,email').eq('board_id',id)))}
   if(route==='team'&&(req.method==='POST'||req.method==='DELETE')){const input=await jsonBody(req),{board,user:u}=await authorize(req,input.id);if(!u.owner)throw new ApiError('FORBIDDEN',403);if(req.method==='DELETE'){checked(await admin.from('ll_members').delete().eq('id',input.member).eq('board_id',board.id));return json({ok:true})}
    const email=text(input.email,254).toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))throw new ApiError('Enter a valid email address.');const generated=await admin.auth.admin.generateLink({type:'magiclink',email});if(generated.error||!generated.data?.properties?.hashed_token)throw new ApiError('Unable to create this invitation.',503);checked(await admin.from('ll_members').upsert({id:crypto.randomUUID(),board_id:board.id,email},{onConflict:'board_id,email',ignoreDuplicates:true}));const invitation=base+'/?view=accept&board='+encodeURIComponent(board.id)+'#token_hash='+encodeURIComponent(generated.data.properties.hashed_token)+'&type=magiclink';return json({ok:true,invitation})
   }
   if(route==='media'&&req.method==='POST'){await authorize(req,id);const form=await new Response(await body(req,9*1024*1024),{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData(),file=form.get('file');if(!(file instanceof File)||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new ApiError('Choose a PNG, JPEG, or WebP image.');if(file.size>8*1024*1024)throw new ApiError('Images can be up to 8 MB.',413);const bytes=new Uint8Array(await file.arrayBuffer()),valid=file.type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;if(!valid)throw new ApiError('The image format does not match the file.');const image=crypto.randomUUID()+'.'+file.type.split('/')[1];await ensureMediaBucket();const uploaded=await admin.storage.from(BUCKET).upload(`${id}/${image}`,bytes,{contentType:file.type,upsert:false});if(uploaded.error)throw new ApiError('Unable to save this image.',503);return json({image})}
   if(route==='media'&&req.method==='GET'){const image=url.searchParams.get('image')||'',token=bearer(req);if(screenId){const {board,screen}=await display(id,token,screenId);const content=filterForScreen(board.content,screen!.settings);if(content.appearance?.logo!==image&&!content.posters.some(p=>p.image===image))throw new ApiError('FORBIDDEN',403)}else if(/^[a-f0-9]{64}$/.test(token)){await display(id,token,null)}else await authorize(req,id);if(!IMAGE.test(image))throw new ApiError('NOT_FOUND',404);const downloaded=await admin.storage.from(BUCKET).download(`${id}/${image}`);if(downloaded.error||!downloaded.data)throw new ApiError('Image not found.',404);return new Response(downloaded.data,{headers:{...headers,'Content-Type':downloaded.data.type||'application/octet-stream'}})}
   throw new ApiError('NOT_FOUND',404);
  }catch(e){if(e instanceof ApiError)return json({error:e.message},e.status);if(e instanceof Error&&/^(Invalid |Choose |Every |Each |Opening |Default |Backup |Enable )/.test(e.message))return json({error:e.message},400);console.error('LAB LIFE API request failed');return json({error:'Unable to process this request.'},500)}
 };
}

const rawSecrets=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const secret=rawSecrets.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const admin=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createHandler(admin,Deno.env.get('LAB_FRONTEND_ORIGIN')||'https://garcy99.github.io/lab-life',Deno.env.get('LAB_OWNER_EMAIL')||''));

