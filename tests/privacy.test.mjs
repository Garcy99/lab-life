import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
let count=0;
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','dist'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory()){scan(file);continue}// Preserve the upstream font license; its author contact is third-party attribution.
if(file.endsWith('.woff2')||path.relative(root,file).replaceAll('\\','/')==='public/fonts/Montserrat-OFL.txt')continue;const content=fs.readFileSync(file,'utf8');for(const email of content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]){const domain=email.split('@')[1].toLowerCase();assert.ok(['example.org','example.com','example.test'].includes(domain),'Public source contains a non-example email in '+path.relative(root,file))}count++}}
scan(root);console.log('PASS: '+count+' public source files contain no real email addresses.');
