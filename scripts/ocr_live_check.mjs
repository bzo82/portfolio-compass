/** Release gate: exercise the actual Tesseract.js WASM library, local models and parser.
 * GitHub Actions can run this after npm install, with no broker credentials/images.
 * This is not a substitute for testing the target broker screenshot on Android.
 */
import {createWorker} from 'tesseract.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {statSync} from 'node:fs';
import {parseOCR} from '../parser.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture=path.join(root,'fixtures','synthetic_broker_sample.png');
const langPath=path.join(root,'vendor','lang');
for(const lang of ['eng','heb']){
 const file=path.join(langPath,lang+'.traineddata.gz');
 if(statSync(file).size<100_000)throw Error('Invalid model: '+file);
}
let worker;
try {
 worker=await createWorker(['eng','heb'],1,{langPath,cacheMethod:'none'});
 const result=await worker.recognize(fixture);
 const raw=result.data.text||'';
 const parsed=parseOCR(raw,{currency:'ILS'});
 const rows=new Map(parsed.rows.map(x=>[x.ticker,x]));
 for(const [name,value,pnl] of [['META',21300,5420],['ASML',10850,-620],['CIBR',15240,410]]){
  const actual=rows.get(name);
  if(!actual||actual.value!==value||actual.pnl!==pnl){
   throw Error(`OCR release gate failed for ${name}: ${JSON.stringify(actual)}; text=${JSON.stringify(raw)}`);
  }
 }
 console.log('PASS real Tesseract OCR + synthetic financial table + parser: 3/3');
}finally{await worker?.terminate();}
