// Exercise the actual slide component with controlled load events and timers.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),modules=new Map(),hooks=[],timers=new Map();let cursor=0,dirty=false,effects=[],timerId=0;
const react={useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:typeof initial==='function'?initial():initial};return [hooks[i].value,next=>{const value=typeof next==='function'?next(hooks[i].value):next;if(!Object.is(value,hooks[i].value)){hooks[i].value=value;dirty=true}}]},useEffect(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((x,j)=>!Object.is(x,old.deps[j]))){hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=fn()})}},useRef(value){const i=cursor++;return hooks[i]??=( {current:value})}};
function load(file){if(!path.extname(file))file+='.ts';if(modules.has(file))return modules.get(file).exports;const mod={exports:{}};modules.set(file,mod);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},fileName:file}).outputText;vm.runInNewContext(code,{exports:mod.exports,module:mod,require:name=>name==='react'?react:name==='./auth-client'?{authFetch:()=>{throw Error('No network permitted in slide test')}}:name.startsWith('.')?load(path.resolve(path.dirname(file),name)):require(name),console,structuredClone,setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)},{filename:file});return mod.exports}
const {PosterSlides}=load(path.join(root,'src/ui/board.tsx'));
const poster=id=>({id,title:id,image:id+'.png',body:'',subtitle:'',enabled:true,start:'',end:''});let props={posters:['A','B','C'].map(poster),index:0,id:'test-board',screenId:'screen'},tree;
function flush(){for(let i=0;i<30;i++){cursor=0;dirty=false;effects=[];tree=PosterSlides(props);for(const effect of effects)effect();if(!dirty)return}throw Error('Unstable slide effects')}
function layers(){return tree.props.children.flat(Infinity).filter(x=>x?.props?.className?.startsWith('poster-slide'))}
const layer=id=>layers().find(x=>x.props['data-poster-id']===id);
const current=()=>layers().find(x=>/current-slide|fade-slide/.test(x.props.className))?.props['data-poster-id'];
function ready(id){layer(id).props.children[0].props.onReady();flush()}
flush();assert.equal(current(),'A');assert.match(layer('B').props.className,/preload-slide/);const aKey=layer('A').key,bKey=layer('B').key;
props={...props,index:1};flush();assert.equal(current(),'A','Unloaded incoming image cannot replace the displayed poster');assert.equal(layer('A').key,aKey,'Waiting never remounts current image');assert.ok(layers().length<=3);
ready('B');assert.equal(current(),'B');assert.equal(layer('B').key,bKey,'Decoded preloaded image is promoted without remounting');assert.equal(layer('A').key,aKey,'Outgoing image keeps its blob URL during crossfade');assert.match(layer('A').props.className,/previous-slide/);assert.match(layer('B').props.className,/fade-slide/);
ready('C');const cKey=layer('C').key;for(const fn of [...timers.values()])fn();timers.clear();flush();assert.equal(layer('A'),undefined,'Outgoing layer released after transition');
props={...props,index:2};flush();assert.equal(current(),'C');assert.equal(layer('C').key,cKey);assert.ok(layers().length<=3);
props={...props,index:3};flush();assert.equal(current(),'C','Slow or failed image retains last decoded slide');ready('A');assert.equal(current(),'A');
props={...props,posters:[{...poster('A'),image:'replacement.png'}],index:0};flush();assert.equal(layers().filter(x=>x.props['data-poster-id']==='A').length,2,'Replacing artwork loads alongside old version');assert.ok(layers().length<=4);
const incoming=layers().find(x=>x.props.className.includes('preload-slide'));incoming.props.children[0].props.onReady();flush();assert.ok(layers().find(x=>x.props.className.includes('fade-slide')).key.includes('replacement.png'));
console.log('PASS: preload promotion and outgoing slides retain React keys; slow loads hold current image; transitions release old layers; replacement artwork waits until loaded.');

