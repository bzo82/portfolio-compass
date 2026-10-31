import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {parseNumber,parseOCR,mergeScans,matchHolding,metrics,validateHolding,normalizeName} from '../parser.mjs';
import {encryptState,decryptState,saveVault,loadVault} from '../vault.mjs';
const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const valid=(name,value,pnl,currency='ILS')=>validateHolding({name,value,pnl,currency,sector:'אחר',region:'לא ידוע'});

test('financial numbers in common Hebrew/English formats',()=>{assert.equal(parseNumber('₪46,420'),46420);assert.equal(parseNumber('-2,410'),-2410);assert.equal(parseNumber('(1,190)'),-1190);assert.equal(parseNumber('1.234,56'),1234.56);assert.equal(parseNumber('0'),0);assert.equal(parseNumber(''),null);});
test('OCR: supports two monetary columns and does not infer missing gain',()=>{const r=parseOCR('META 21,300 +5,420\nASML 10,850 -620\nCIBR 15,240');assert.equal(r.rows.length,3);assert.equal(r.rows[0].pnl,5420);assert.equal(r.rows[1].pnl,-620);assert.equal(r.rows[2].pnl,null);});
test('OCR: no exfiltration of account identifier rows',()=>{const r=parseOCR('מספר חשבון 12345678\nMETA 200 20');assert.equal(r.rows.length,1);assert.equal(r.rows[0].name,'META');});
test('OCR: supports PNL first',()=>{const r=parseOCR('ASML -620 10,850',{format:'pnl-value'});assert.equal(r.rows[0].value,10850);assert.equal(r.rows[0].pnl,-620);});
test('OCR: no percent mistaken as currency profit',()=>{const r=parseOCR('META 21,300 15%');assert.equal(r.rows[0].pnl,null);});
test('duplicate scans flag conflict instead of silently overwriting',()=>{const a=parseOCR('META 21,300 5,420').rows,b=parseOCR('META 21,900 6,020').rows;const merged=mergeScans([a,b]);assert.equal(merged.length,1);assert.equal(merged[0].conflict,true);assert.equal(merged[0].alternatives.length,1);});
test('matching by stable ticker/name does not guess ambiguous',()=>{const row={name:'META',ticker:'META'};assert.equal(matchHolding(row,[{name:'META Platforms',ticker:'META',id:'1'}]).id,'1');assert.equal(matchHolding(row,[{name:'META',id:'1',ticker:'META'},{name:'META',id:'2',ticker:'META'}]).status,'ambiguous');});
test('invalid gain above value is rejected',()=>{assert.throws(()=>valid('AAA',100,250));assert.throws(()=>valid('AAA',-10,0));assert.equal(valid('AAA',0,null).pnl,null);});
test('mixed FX missing yields no fake summary',()=>{const a=valid('ILS',100,20),b=valid('USD',100,5,'USD');const m=metrics([a,b]);assert.equal(m.totalILS,null);assert.equal(m.knownPnlILS,null);assert.equal(m.unknownFx,1);});
test('complete FX and profit yields aggregate in ILS',()=>{const a=valid('ILS',100,20),b=valid('USD',100,5,'USD');const m=metrics([a,b],{USD:4});assert.equal(m.totalILS,500);assert.equal(m.knownPnlILS,40);assert.equal(m.top1,.8);});
test('AES-GCM encryption round-trip, incorrect password rejects, plaintext not stored',async()=>{const data={version:5,holdings:[{name:'SECRET META'}],snapshots:[]};const envelope=await encryptState(data,'strong-password-here');assert.equal(envelope.format,'pc-v5-encrypted');assert.ok(!JSON.stringify(envelope).includes('SECRET META'));assert.deepEqual(await decryptState(envelope,'strong-password-here'),data);await assert.rejects(decryptState(envelope,'wrong-password-long'),/סיסמה/);});
test('encrypted local vault can be reopened',async()=>{const data={version:5,holdings:[{name:'כותרת סודית'}],snapshots:[]};await saveVault(data,'strong-password-here');assert.deepEqual(await loadVault('strong-password-here'),data);assert.ok(![...store.values()].join('').includes('כותרת סודית'));});
test('OCR rejects percentage-only value to prevent incorrect financial values',()=>{const r=parseOCR('META 14% 5%');assert.equal(r.rows.length,0);});
test('identical ticker with conflicting currencies is not silently merged',()=>{const a=parseOCR('META $100 $10',{currency:'USD'}).rows;const b=parseOCR('META ₪100 ₪10',{currency:'ILS'}).rows;const m=mergeScans([a,b]);assert.equal(m.length,1);assert.equal(m[0].conflict,true);});
test('RTL OCR with security name after numeric columns is reviewable',()=>{
 const r=parseOCR('46,420 +21,850 תכלית סל בנקים');
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].name,'תכלית סל בנקים');
 assert.equal(r.rows[0].value,46420);
 assert.equal(r.rows[0].pnl,21850);
});
test('RTL OCR security identifier at start is not mistaken for market value',()=>{
 const r=parseOCR('1159094 תכלית סל בנקים 46,420 +21,850');
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].name,'תכלית סל בנקים');
 assert.equal(r.rows[0].value,46420);
 assert.equal(r.rows[0].pnl,21850);
 assert.ok(r.rows[0].notes.some(x=>x.includes('מספר נייר')));
});
test('English name last is parsed without shifting monetary columns',()=>{
 const r=parseOCR('21,300 +5,420 META');
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].name,'META');
 assert.equal(r.rows[0].value,21300);
 assert.equal(r.rows[0].pnl,5420);
});
