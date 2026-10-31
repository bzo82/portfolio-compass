/** Build fully same-origin static PWA with local OCR assets. Node 18+.
 * Run `npm install --ignore-scripts && npm run build`.
 */
import {existsSync,mkdirSync,copyFileSync,readdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const dest=path.join(here,'dist');
const source=path.join(here,'node_modules');
function copy(from,to){if(!existsSync(from))throw Error('Missing required build asset: '+from);mkdirSync(path.dirname(to),{recursive:true});copyFileSync(from,to);}
function copyDir(from,to){for(const e of readdirSync(from,{withFileTypes:true})){if(e.isDirectory())copyDir(path.join(from,e.name),path.join(to,e.name));else copy(path.join(from,e.name),path.join(to,e.name));}}
if(!existsSync(source))throw Error('Run npm install before build');
if(existsSync(dest))rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});
for(const name of ['index.html','security-bootstrap.js','style.css','app.mjs','parser.mjs','vault.mjs','pwa-client.mjs','sw.js','manifest.webmanifest','_headers'])copy(path.join(here,name),path.join(dest,name));
for(const name of ['icon-192.png','icon-512.png'])copy(path.join(here,'icons',name),path.join(dest,'icons',name));
for(const name of ['eng.traineddata.gz','heb.traineddata.gz'])copy(path.join(here,'vendor/lang',name),path.join(dest,'vendor/lang',name));
for(const name of ['tesseract.min.js','worker.min.js'])copy(path.join(source,'tesseract.js/dist',name),path.join(dest,'vendor/tesseract',name));
const core=path.join(source,'tesseract.js-core');
for(const name of readdirSync(core))if(name.startsWith('tesseract-core')&&(name.endsWith('.js')||name.endsWith('.wasm')))copy(path.join(core,name),path.join(dest,'vendor/core',name));
// A JS loader without its matching WASM binary is a broken OCR build.
for (const variant of ['tesseract-core','tesseract-core-simd','tesseract-core-lstm','tesseract-core-simd-lstm']) {
  for (const extension of ['.wasm.js', '.wasm']) {
    const filename = variant + extension;
    const target = path.join(dest, 'vendor/core', filename);
    if (!existsSync(target)) throw Error('Missing required OCR runtime: ' + filename);
    if (readFileSync(target).length < 1000) throw Error('OCR runtime unexpectedly small: ' + filename);
  }
}
for (const file of ['tesseract.min.js','worker.min.js']) {
  if (readFileSync(path.join(dest,'vendor/tesseract',file)).length < 1000) throw Error('OCR JS file unexpectedly small: ' + file);
}

for(const [packageName,folder] of [['tesseract.js','tesseract.js'],['tesseract.js-core','tesseract.js-core']]){for(const license of ['LICENSE.md','LICENSE','LICENSE.txt']){const from=path.join(source,folder,license);if(existsSync(from)){copy(from,path.join(dest,'licenses',packageName+'-'+license));break;}}}
// Generate a complete versioned offline asset list, including OCR WASM and language data.
const offlineAssets=[];
function listAssets(folder) { for(const e of readdirSync(folder,{withFileTypes:true})){const f=path.join(folder,e.name);if(e.isDirectory())listAssets(f);else if(e.name!=='sw.js'&&e.name!=='integrity-manifest.json')offlineAssets.push('./'+path.relative(dest,f).replaceAll('\\\\','/'));}}
listAssets(dest);
const swPath=path.join(dest,'sw.js');
const releaseHash=createHash('sha256');
for(const asset of [...offlineAssets].sort()){releaseHash.update(asset);releaseHash.update(readFileSync(path.join(dest,asset.slice(2))));}
const revision=releaseHash.digest('hex').slice(0,24);
const sw=readFileSync(swPath,'utf8').replace('/*__CACHE_REVISION__*/',revision).replace('/*__OFFLINE_ASSETS__*/',JSON.stringify(offlineAssets));
writeFileSync(swPath,sw);
const manifest={builtAt:new Date().toISOString(),sha256:{}};
function hashDir(folder,root){for(const e of readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,e.name);if(e.isDirectory())hashDir(file,root);else{manifest.sha256[path.relative(root,file).replaceAll('\\','/')]=createHash('sha256').update(readFileSync(file)).digest('hex');}}}
hashDir(dest,dest);writeFileSync(path.join(dest,'integrity-manifest.json'),JSON.stringify(manifest,null,2));
console.log('Prepared same-origin OCR PWA in dist/. Upload only dist/ to static HTTPS hosting.');
