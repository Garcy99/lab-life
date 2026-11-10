/* Runs the actual Edge handler and shared validation with a deterministic
 * Supabase boundary. No network, database or production account is modified. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const tables={ll_boards:[],ll_members:[],ll_screens:[]},files=new Map();
const copy=value=>structuredClone(value);
const users={owner:{id:'owner',email:'Owner@Example.org',email_confirmed_at:'2026-11-10'},member:{id:'member',email:'editor@example.org',email_confirmed_at:'2026-11-10'},stranger:{id:'stranger',email:'other@example.org',email_confirmed_at:'2026-11-10',user_metadata:{role:'owner',email:'owner@example.org'}},unconfirmed:{id:'unconfirmed',email:'owner@example.org'}};
let failInvite=false,bucket=null,bucketCreates=0,bucketFailure=false;
class Query{
 constructor(table){this.table=table;this.action='select';this.filters=[];this.fields='*';this.max=Infinity;this.returnRows=false}
 select(fields='*'){this.fields=fields;this.returnRows=true;return this}
 eq(key,value){this.filters.push(row=>row[key]===value);return this}
 in(key,values){this.filters.push(row=>values.includes(row[key]));return this}
 order(key,options={}){this.sort=[key,options.ascending!==false];return this}
 limit(max){this.max=max;return this}
 insert(value){this.action='insert';this.value=value;return this}
 upsert(value,options){this.action='upsert';this.value=value;this.options=options;return this}
 update(value){this.action='update';this.value=value;return this}
 delete(){this.action='delete';return this}
 maybeSingle(){this.singleMode='maybe';return this}
 single(){this.singleMode='required';return this}
 then(resolve,reject){return Promise.resolve().then(()=>this.execute()).then(resolve,reject)}
 execute(){
  const rows=tables[this.table];let selected=rows.filter(row=>this.filters.every(predicate=>predicate(row)));
  if(this.action==='insert'||this.action==='upsert'){
   const value={...copy(this.value)};
   if(this.table==='ll_boards'&&!('display_hash' in value))value.display_hash=null;
   const existing=this.action==='upsert'?rows.find(r=>r.board_id===value.board_id&&r.email===value.email):rows.find(r=>r.id===value.id||(this.table==='ll_boards'&&r.owner_id===value.owner_id));
   if(existing&&this.action==='insert')return {data:null,error:{code:'23505'}};
   if(existing){if(!this.options?.ignoreDuplicates)Object.assign(existing,value);selected=[existing]}
   else{rows.push(value);selected=[value]}
  }else if(this.action==='update'){for(const row of selected)Object.assign(row,copy(this.value))}
  else if(this.action==='delete'){tables[this.table]=rows.filter(row=>!selected.includes(row))}
  if(this.sort){const [key,ascending]=this.sort;selected.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(ascending?1:-1))}
  selected=selected.slice(0,this.max);
  if(this.fields!=='*')selected=selected.map(row=>Object.fromEntries(this.fields.split(',').map(k=>[k,row[k]])));
  if(this.singleMode){if(selected.length>1||(this.singleMode==='required'&&!selected.length))return {data:null,error:{message:'Unexpected cardinality'}};return {data:copy(selected[0]||null),error:null}}
  return {data:copy(selected),error:null};
 }
}
const admin={
 from:table=>new Query(table),
 auth:{async getUser(token){return users[token]?{data:{user:users[token]},error:null}:{data:{user:null},error:{message:'Invalid token'}}},admin:{async generateLink(input){assert.equal(input.type,'magiclink');return failInvite?{data:null,error:{}}:{data:{properties:{hashed_token:'one-use-hash'}},error:null}}}},
 storage:{
 async getBucket(name){assert.equal(name,'lab-life-media');if(bucketFailure)return {data:null,error:{statusCode:'503'}};return bucket?{data:copy(bucket),error:null}:{data:null,error:{statusCode:'404'}}},
 async createBucket(name,options){assert.equal(name,'lab-life-media');bucketCreates++;if(bucket)return {data:null,error:{statusCode:'409'}};bucket={id:name,...options};return {data:{name},error:null}},
 from(bucket){
  assert.equal(bucket,'lab-life-media');
  return {
   async upload(key,bytes,options){files.set(key,new Blob([bytes],{type:options.contentType}));return {data:{path:key},error:null}},
   async download(key){return files.has(key)?{data:files.get(key),error:null}:{data:null,error:{message:'Not found'}}},
  };
 }},
};
const modules=new Map();let productionHandler;
function load(filename){
 if(modules.has(filename))return modules.get(filename).exports;
 const mod={exports:{}};modules.set(filename,mod);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const requireModule=name=>name.startsWith('npm:@supabase/')?{createClient:()=>admin}:load(path.resolve(path.dirname(filename),name));
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:requireModule,crypto:webcrypto,Response,Request,Headers,File,FormData,Blob,TextEncoder,TextDecoder,URL,Error,structuredClone,console,Deno:{env:{get:key=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-only-key'})[key]},serve:fn=>productionHandler=fn}},{filename});
 return mod.exports;
}
const api=load(path.join(root,'supabase/functions/lab-life-api/index.ts'));
const model=load(path.join(root,'supabase/functions/_shared/model.ts'));
const handler=api.createHandler(admin,undefined,'owner@example.org');
const origin='https://garcy99.github.io';let checks=0;
function eq(actual,expected,message){assert.deepEqual(actual,expected,message);checks++}
async function call(route,method='GET',{token,body,form,origin:givenOrigin=origin,expected=200,extraHeaders={}}={}){
 const headers={...extraHeaders};if(givenOrigin)headers.origin=givenOrigin;if(token)headers.authorization='Bearer '+token;if(body!==undefined)headers['content-type']='application/json';
 const req=new Request('https://project.supabase.co/functions/v1/lab-life-api/'+route,{method,headers,body:form||(body===undefined?undefined:JSON.stringify(body))});
 const response=await handler(req);eq(response.status,expected,`${method} ${route}`);eq(response.headers.get('access-control-allow-origin'),origin);return response;
}
function image(){const form=new FormData();form.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'test.png',{type:'image/png'}));return form}
async function main(){
 eq(typeof productionHandler,'function');
 await call('board','OPTIONS',{expected:204});
 await call('board','GET',{expected:401});
 for(const token of ['forged.jwt.signature','unconfirmed'])await call('board','GET',{token,expected:401});
 await call('board','GET',{token:'stranger',expected:403});eq(tables.ll_boards.length,0,'Nonmember cannot create board');
 const bootstrap=await Promise.all([call('board','GET',{token:'owner'}),call('board','GET',{token:'owner'})]);
 const initial=await bootstrap[0].json(),simultaneous=await bootstrap[1].json(),id=initial.id;
 eq(simultaneous.id,id,'Concurrent owner bootstrap reuses unique owner board');
 const privateOwnerHandler=api.createHandler(admin);
 const ownerWithoutEmail=await privateOwnerHandler(new Request('https://project.supabase.co/functions/v1/lab-life-api/board',{headers:{origin,authorization:'Bearer owner'}}));
 eq(ownerWithoutEmail.status,200);eq((await ownerWithoutEmail.json()).owner,true,'Existing ownership works without public email configuration');
 const deniedWithoutEmail=await privateOwnerHandler(new Request('https://project.supabase.co/functions/v1/lab-life-api/board',{headers:{origin,authorization:'Bearer stranger'}}));eq(deniedWithoutEmail.status,403);
 eq(initial.owner,true);eq(tables.ll_boards.length,1);eq((await(await call('board','GET',{token:'owner'})).json()).id,id);
 await call('team','POST',{token:'owner',body:{id,email:'editor@example.org'}});
 const invitation=await(await call('team','POST',{token:'owner',body:{id,email:'editor@example.org'}})).json();
 eq(invitation.invitation,`https://garcy99.github.io/lab-life/?view=accept&board=${id}#token_hash=one-use-hash&type=magiclink`);eq(tables.ll_members.length,1,'Repeated invitation does not duplicate membership');
 failInvite=true;await call('team','POST',{token:'owner',body:{id,email:'failed@example.org'},expected:503});eq(tables.ll_members.length,1);failInvite=false;
 eq((await(await call('board','GET',{token:'member'})).json()).id,id,'Editor root uses shared board');
 await call('board?board='+id,'GET',{token:'stranger',expected:403});
 await call('team?board='+id,'GET',{token:'member',expected:403});
 const content=model.sampleContent(),base=content.posters[0];
 content.posters=[{...base,id:'fab',image:'fab.png',labs:['FAB LAB']},{...base,id:'fashion',image:'fashion.png',labs:['FASHION LAB']}];content.appearance={...model.DEFAULT_APPEARANCE,logo:'logo.png'};
 await call('board','PUT',{token:'member',body:{id,revision:1,content}});
 await call('board','PUT',{token:'member',body:{id,revision:1,content},expected:409});
 await call('board','PUT',{token:'member',body:{id,revision:2,content:{...content,version:99}},expected:400});
 await call('board','PUT',{token:'owner',origin:'https://attacker.example',body:{id,revision:2,content},expected:403});
 await call('board','PUT',{token:'owner',origin:null,body:{id,revision:2,content},expected:403});
 await call('board','PUT',{token:'owner',extraHeaders:{'content-length':'1000001'},body:{id,revision:2,content},expected:413});
 const settings={...model.DEFAULT_SCREEN,labs:['FAB LAB']};
 const created=await(await call('screens','POST',{token:'owner',body:{id,name:'Fab display',settings}})).json(),screen=created.screen.id,screenToken=created.token;
 eq(created.screen.token_hash,undefined);eq(tables.ll_screens[0].token_hash!==screenToken,true);
 await call('screens','POST',{token:'member',body:{id,name:'Forbidden',settings},expected:403});
 await call('screens','DELETE',{token:'member',body:{id,screen},expected:403});
 const displayRoute=`display?board=${id}&screen=${screen}`;
 const shown=await(await call(displayRoute,'GET',{token:screenToken})).json();eq(shown.content.posters.map(p=>p.id),['fab']);eq(!!shown.screen.lastSeen,true);eq(shown.screen.token_hash,undefined);
 await call(`display?board=another&screen=${screen}`,'GET',{token:screenToken,expected:404});
 await call('board','PUT',{token:screenToken,body:{id,revision:2,content},expected:401});
 eq(bucketCreates,0,'No storage setup before authorized upload');
 const upload=await(await call('media?board='+id,'POST',{token:'member',form:image()})).json();
 eq(bucketCreates,1,'First authorized upload creates bucket through API');eq(bucket.public,false);eq(bucket.fileSizeLimit,8388608);eq([...bucket.allowedMimeTypes],['image/png','image/jpeg','image/webp']);
 await call(`media?board=${id}&image=${upload.image}`,'GET',{token:'member'});
 await call('media?board='+id,'POST',{token:screenToken,form:image(),expected:401});
 for(const key of ['fab.png','fashion.png','logo.png'])files.set(`${id}/${key}`,new Blob(['image'],{type:'image/png'}));
 await call(`media?board=${id}&screen=${screen}&image=fab.png`,'GET',{token:screenToken});
 await call(`media?board=${id}&screen=${screen}&image=logo.png`,'GET',{token:screenToken});
 await call(`media?board=${id}&screen=${screen}&image=fashion.png`,'GET',{token:screenToken,expected:403});
 await call('screens','PUT',{token:'member',body:{id,screen,name:'Disabled',settings,enabled:false}});
 await call(displayRoute,'GET',{token:screenToken,expected:403});
 await call('screens','PUT',{token:'member',body:{id,screen,name:'Enabled',settings,enabled:true}});
 const legacy=(await(await call('display','POST',{token:'owner',body:{id}})).json()).token;
 await call('display?board='+id,'GET',{token:legacy});
 await call(`media?board=${id}&image=fashion.png`,'GET',{token:legacy});
 await call('display','POST',{token:'member',body:{id},expected:403});
 await call('display','POST',{token:'owner',body:{id}});
 await call('display?board='+id,'GET',{token:legacy,expected:403});
 await call('screens','DELETE',{token:'owner',body:{id,screen}});await call(displayRoute,'GET',{token:screenToken,expected:403});
 // Atomic WHERE revision: exactly one publisher can advance a shared revision.
 const attempts=await Promise.all([call('board','PUT',{token:'member',body:{id,revision:2,content}}),call('board','PUT',{token:'member',body:{id,revision:2,content},expected:409})]);eq(attempts.map(r=>r.status),[200,409]);
 const memberId=tables.ll_members[0].id;await call('team','DELETE',{token:'owner',body:{id,member:memberId}});await call('board','GET',{token:'member',expected:403});
 // An imported sole board is adopted without changing its public identifiers.
 tables.ll_boards[0].owner_id='old-provider-id';const imported=await(await call('board','GET',{token:'owner'})).json();eq(imported.id,id);eq(tables.ll_boards.length,1);eq(imported.revision,3);
 // Fresh isolate must refuse a public bucket and must not create on outages.
 const uploadRequest=()=>new Request(`https://project.supabase.co/functions/v1/lab-life-api/media?board=${id}`,{method:'POST',headers:{origin,authorization:'Bearer owner'},body:image()});
 bucket.public=true;
 eq((await api.createHandler(admin)(uploadRequest())).status,503,'Existing public storage fails closed');
 bucket.public=false;bucketFailure=true;const createsBefore=bucketCreates;
 eq((await api.createHandler(admin)(uploadRequest())).status,503,'Storage outage does not create a bucket');eq(bucketCreates,createsBefore);
 bucketFailure=false;
 const schema=fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8');
 eq(/insert\s+into\s+storage\./i.test(schema),false,'SQL does not mutate managed Storage records');
 console.log(`PASS: ${checks} Edge API assertions: verified identities, owner/editor authorization, invitations, CORS, revisions, scoped tokens/media, revocation and import IDs.`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
