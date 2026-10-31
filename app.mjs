import {parseOCR,mergeScans,matchHolding,validateHolding,metrics,parseNumber,normalizeName} from './parser.mjs';
import {vaultExists,saveVault,loadVault,encryptState,decryptState,eraseVault,exportVault,VAULT_KEY} from './vault.mjs';

if(window.top!==window.self)throw new Error('Embedding is disabled');
let sessionEpoch=0, activeOCRWorker=null;
const sessionValid=epoch=>epoch===sessionEpoch&&state!==null;
const $=q=>document.querySelector(q), $$=q=>[...document.querySelectorAll(q)];
const currencyFmt={ILS:new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}),USD:new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}),EUR:new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:2})};
const today=()=>new Date().toLocaleDateString('en-CA');
const nowISO=()=>new Date().toISOString();
const mkID=()=>crypto.randomUUID();
const empty=()=>({version:5,holdings:[],fx:{USD:null,EUR:null},snapshots:[],createdAt:nowISO(),updatedAt:null});
let state=null, passphrase=null, privateMode=false, images=[], staged=[], cropTop=0,cropBottom=0, recognitionBusy=false, dialogCloseAction=null;
let engineStatus='loading';
let lastActivity=Date.now();
for(const ev of ['pointerdown','keydown','touchstart'])document.addEventListener(ev,()=>{lastActivity=Date.now();},{passive:true});
setInterval(()=>{if(state&&Date.now()-lastActivity>20*60*1000)lock();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state&&Date.now()-lastActivity>20*60*1000)lock();});
const MAX_FILES=8,MAX_FILE_BYTES=7*1024*1024;

function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function money(n,c='ILS'){return Number.isFinite(n)?currencyFmt[c].format(n):'—';}
function pct(n){return Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';}
function displayDate(s){return s||'לא ידוע';}
function notice(message,type='info'){const el=node('div','',message);if(type==='warn')el.style.borderColor='#c9904f';$('#toast').append(el);setTimeout(()=>el.remove(),5500);}
function render(){if(!state)return;const m=metrics(state.holdings,state.fx);$('#stat-total').textContent=money(m.totalILS);$('#stat-total-sub').textContent=m.fxComplete?'מחושב מהנתונים שהוזנו':'חסר שער המרה - לא מוצג סיכום שגוי';$('#stat-pnl').textContent=money(m.knownPnlILS);$('#stat-pnl').classList.toggle('positive',(m.knownPnlILS||0)>0);$('#stat-pnl').classList.toggle('negative',(m.knownPnlILS||0)<0);$('#stat-pnl-sub').textContent=m.pnlComplete?'רווח/הפסד לא ממומש בלבד':`חסר רווח ב-${m.unknownPnl} ניירות או שער מטבע - לא מוצג סכום חלקי`;$('#stat-concentration').textContent=m.fxComplete?pct(m.top2):'—';
 const dates=state.holdings.map(h=>h.asof).filter(Boolean);const unique=new Set(dates);$('#stat-fresh').textContent=!state.holdings.length?'—':dates.length<state.holdings.length?'חסר מידע':unique.size===1?displayDate(dates[0]):'תאריכים שונים';$('#stat-fresh-sub').textContent=unique.size>1?'שים לב: נתונים מתאריכים שונים':'תאריך צילום אינו שער שוק חי';
 $('#holdings-subtitle').textContent=`${state.holdings.length} אחזקות שמורות · עודכן ${state.updatedAt?new Date(state.updatedAt).toLocaleString('he-IL'):'טרם נשמר'}`;
 const tbody=$('#holdings-body');tbody.replaceChildren();
 const sorted=[...state.holdings].sort((a,b)=>b.value-a.value);
 for(const h of sorted){const tr=node('tr'),weights=m.weights.find(x=>x.h.id===h.id);const cells=[];
 const name=node('td');name.append(node('div','name',h.name),node('div','secondary',h.ticker||'ללא סימול'));cells.push(name);
 cells.push(node('td','num secret',money(h.value,h.currency)));
 const pcell=node('td','num secret',h.pnl===null?'לא ידוע':money(h.pnl,h.currency));if(h.pnl!==null)pcell.classList.add(h.pnl<0?'negative':'positive');cells.push(pcell);
 const wcell=node('td');if(weights){wcell.append(node('div','num',pct(weights.w)));const pg=node('div','progress'),bar=node('div');bar.style.width=pct(weights.w);pg.append(bar);wcell.append(pg);}else wcell.textContent='—';cells.push(wcell);
 cells.push(node('td','secondary',h.asof||'לא ידוע'));
 const action=node('td');const edit=node('button','inline-button','ערוך');edit.type='button';edit.addEventListener('click',()=>assetDialog(h));action.append(edit);cells.push(action);tr.append(...cells);tbody.append(tr);}
 if(!sorted.length){const tr=node('tr'),td=node('td','empty','התיק ריק. התחל בסריקת צילום מסך, הדבקת טקסט או הוספה ידנית.');td.colSpan=6;tr.append(td);tbody.append(tr);}
 $('#fx-usd').value=state.fx.USD??'';$('#fx-eur').value=state.fx.EUR??'';
 renderExposure(m);renderSnapshots();
}
function renderExposure(m){const el=$('#exposure');el.replaceChildren();if(!m.fxComplete||!m.totalILS){el.append(node('p','caption','כדי לחשב פיזור נדרש שווי בכל אחזקה ושער המרה לכל מטבע.'));return;}
 const entries=[...Object.entries(m.byRegion).sort((a,b)=>b[1]-a[1]),...Object.entries(m.bySector).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>['ענף: '+x[0],x[1]])];for(const [key,val] of entries){const row=node('div','bar-row'),label=node('label','',key),track=node('div','bar-track'),bar=node('i');bar.style.width=pct(val);track.append(bar);row.append(label,track,node('span','num',pct(val)));el.append(row);}}
function renderSnapshots(){const el=$('#snapshots');el.replaceChildren();const ss=state.snapshots.slice(-8).reverse();if(!ss.length){el.append(node('p','empty','לא נשמרה עדיין תמונת מצב.'));return;}
 for(const s of ss){const row=node('div'),left=node('div'),title=node('strong','',s.label||'תמונת מצב');left.append(title,node('div','secondary',new Date(s.timestamp).toLocaleString('he-IL')+' · '+s.holdings.length+' אחזקות'));const right=node('div','num secret',s.totalILS===null?'סיכום לא מלא':money(s.totalILS));row.append(left,right);el.append(row);}}
function validateState(raw){if(!raw||raw.version!==5||!Array.isArray(raw.holdings)||raw.holdings.length>300||!Array.isArray(raw.snapshots)||raw.snapshots.length>60)throw Error('מבנה תיק לא תקין');
 const holdings=raw.holdings.map(validateHolding);if(new Set(holdings.map(h=>h.id)).size!==holdings.length)throw Error('מזהים כפולים בתיק');
 const fx={USD:null,EUR:null};for(const c of ['USD','EUR']){const x=raw.fx?.[c];if(x!==null&&x!==undefined&&x!==''){const n=Number(x);if(!Number.isFinite(n)||n<=0||n>100)throw Error('שער המרה בלתי סביר');fx[c]=n;}}
 const snapshots=raw.snapshots.map(s=>({id:String(s.id||''),timestamp:String(s.timestamp||''),label:String(s.label||'').slice(0,100),totalILS:s.totalILS===null?null:Number(s.totalILS),holdings:Array.isArray(s.holdings)?s.holdings.slice(0,300).map(validateHolding):[]}));
 return {version:5,holdings,fx,snapshots,createdAt:String(raw.createdAt||nowISO()),updatedAt:raw.updatedAt||null};}
async function commit(next,message){const epoch=sessionEpoch;if(!sessionValid(epoch))throw Error('הכספת נעולה');const clean=validateState(next);clean.updatedAt=nowISO();await saveVault(clean,passphrase,()=>sessionValid(epoch));if(!sessionValid(epoch))return;state=clean;render();if(message)notice(message);}
function withSnapshot(next,label){const m=metrics(next.holdings,next.fx);next.snapshots.push({id:mkID(),timestamp:nowISO(),label,holdings:structuredClone(next.holdings),totalILS:m.totalILS});next.snapshots=next.snapshots.slice(-60);return next;}

function modal(title,contents,onClose){$('#dialog-title').textContent=title;$('#dialog-body').replaceChildren(contents);$('#modal-layer').hidden=false;dialogCloseAction=onClose||null;$('#dialog-close').focus();}
function closeModal(){if(dialogCloseAction){const fn=dialogCloseAction;dialogCloseAction=null;fn();}$('#modal-layer').hidden=true;$('#dialog-body').replaceChildren();}
$('#dialog-close').addEventListener('click',closeModal);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal-layer').hidden){if(!recognitionBusy)closeModal();}if(e.key==='Escape'&&$('#modal-layer').hidden&&state)$('#lock-btn').focus();});
$('#modal-layer').addEventListener('click',e=>{if(e.target===$('#modal-layer')&&!recognitionBusy)closeModal();});
function formField(label,value='',type='text',placeholder=''){const wrap=node('label'),span=node('span','',label),input=node('input');input.type=type;input.value=value??'';input.placeholder=placeholder;wrap.append(span,input);return {wrap,input};}
function selectField(label,options,selected){const wrap=node('label');wrap.append(node('span','',label));const input=node('select');for(const opt of options){const el=node('option','',opt);el.value=opt;input.append(el);}input.value=selected;wrap.append(input);return {wrap,input};}
function assetDialog(existing=null){const h=existing||{name:'',ticker:'',value:0,pnl:null,currency:'ILS',sector:'אחר',region:'לא ידוע',risk:'core',asof:today()};const layout=node('div','form-col'),grid=node('div','row-two');const name=formField('שם נייר ערך',h.name),ticker=formField('סימול / מספר נייר',h.ticker);grid.append(name.wrap,ticker.wrap);const vals=node('div','row-two'),value=formField('שווי ביחידות המטבע',h.value,'number'),pnl=formField('רווח/הפסד - ניתן להשאיר ריק',h.pnl,'number');value.input.step='any';pnl.input.step='any';vals.append(value.wrap,pnl.wrap);const currency=selectField('מטבע',['ILS','USD','EUR'],h.currency),sector=selectField('ענף',['אחר','פיננסים','טכנולוגיה','תשתיות','תעשייה וביטחון','מדד רחב'],h.sector),region=selectField('אזור',['לא ידוע','ישראל','ארה״ב','אירופה','גלובלי','שווקים מתעוררים'],h.region),risk=selectField('סוג חשיפה',['core','elevated'],h.risk),asof=formField('נכון לתאריך',h.asof||today(),'date');const grid2=node('div','row-two');grid2.append(currency.wrap,sector.wrap,region.wrap,risk.wrap);layout.append(grid,vals,grid2,asof.wrap);const actions=node('div','dialog-actions'),save=node('button','btn primary','שמור'),cancel=node('button','btn','ביטול');save.type='button';cancel.type='button';actions.append(save,cancel);if(existing){const del=node('button','btn','מחק נייר');del.type='button';del.style.color='#ff8e9f';del.addEventListener('click',async()=>{if(!confirm('למחוק את האחזקה? הפעולה תתועד בתמונת מצב.'))return;const next=structuredClone(state);next.holdings=next.holdings.filter(x=>x.id!==existing.id);try{await commit(withSnapshot(next,'מחיקת אחזקה'), 'האחזקה נמחקה והכספת עודכנה.');closeModal();}catch(e){notice(e.message,'warn');}});actions.prepend(del);}
 layout.append(actions);save.addEventListener('click',async()=>{try{const item=validateHolding({id:existing?.id||mkID(),name:name.input.value,ticker:ticker.input.value,value:Number(value.input.value),pnl:pnl.input.value.trim()===''?null:Number(pnl.input.value),currency:currency.input.value,sector:sector.input.value,region:region.input.value,risk:risk.input.value,asof:asof.input.value,updatedAt:nowISO()});const next=structuredClone(state);const index=next.holdings.findIndex(x=>x.id===item.id);if(index>=0)next.holdings[index]=item;else next.holdings.push(item);await commit(withSnapshot(next,existing?'עריכת אחזקה':'הוספת אחזקה'), 'נייר הערך נשמר.');closeModal();}catch(e){notice(e.message,'warn');}});cancel.addEventListener('click',closeModal);modal(existing?'עריכת אחזקה':'הוספת נייר ערך',layout);}
$('#manual-btn').addEventListener('click',()=>assetDialog());
$('#fx-save').addEventListener('click',async()=>{const next=structuredClone(state);for(const [currency,id] of [['USD','fx-usd'],['EUR','fx-eur']]){const s=$('#'+id).value.trim();const n=s===''?null:Number(s);if(n!==null&&(!Number.isFinite(n)||n<=0||n>100))return notice('שער המרה לא תקין','warn');next.fx[currency]=n;}try{await commit(withSnapshot(next,'עדכון שערי המרה'),'שערי ההמרה נשמרו.');}catch(e){notice(e.message,'warn');}});
$('#stress-btn').addEventListener('click',()=>{const m=metrics(state.holdings,state.fx),x=Number($('#stress-pct').value),region=$('#stress-region').value;if(!m.fxComplete||!m.totalILS)return $('#stress-output').textContent='אין אפשרות לחשב ללא שערי המרה מלאים.';if(!Number.isFinite(x)||x< -100||x>200)return $('#stress-output').textContent='הזן שינוי בין ‎-100% ל-200%.';const val=state.holdings.filter(h=>region==='ALL'||h.region===region).reduce((s,h)=>s+h.value*(h.currency==='ILS'?1:state.fx[h.currency]),0);const delta=val*x/100;$('#stress-output').textContent=`השפעה מדומה: ${money(delta)} | שווי חדש: ${money(m.totalILS+delta)}. אין שינוי בתיק השמור.`;});
$('#snapshot-btn').addEventListener('click',async()=>{try{await commit(withSnapshot(structuredClone(state),'שמירה ידנית'),'תמונת המצב נשמרה.');}catch(e){notice(e.message,'warn');}});
$('#privacy-btn').addEventListener('click',()=>{privateMode=!privateMode;document.body.classList.toggle('privacy',privateMode);$('#privacy-btn').textContent=privateMode?'הצג סכומים':'הסתר סכומים';});
$('#verify-privacy-btn').addEventListener('click',()=>{const p=node('div','form-col');p.append(node('p','','התמונות מטופלות כקבצים בזיכרון הדפדפן. קוד האפליקציה אינו מבצע POST/PUT או העברה של תמונה, ואין שרת OCR. הזיהוי משתמש בקובצי מנוע ומודלים שמוגשים מאותו מקור (same-origin).'),node('p','','אחזקות ותמונות מצב שמורות בכספת מוצפנת באמצעות סיסמה. התמונה, טקסט ה-OCR ופרטי החיתוך אינם נשמרים. גיבוי מוצפן נוצר רק בהוראה שלך.'),node('p','warning','אין הבטחת אפס מוחלט: תוספי דפדפן, מערכת הפעלה, גיבוי מערכת, תוכנה זדונית או שרת שמארח את האפליקציה יכולים לשנות את מודל האיום. מומלץ HTTPS, דפדפן מעודכן ומקור אירוח אמין.'),node('p','','מנוע OCR מקומי מחייב התקנה חד-פעמית של קובצי JavaScript/WASM ומודלי שפה. לאחר התקנה וטעינת האפליקציה, הסריקה אינה שולחת את הצילום לספק כלשהו.'));modal('גבולות הגנת הפרטיות',p);});

function download(filename,text,type='application/json'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}
$('#backup-btn').addEventListener('click',()=>{try{download('portfolio-compass-encrypted-'+today()+'.json',exportVault());notice('גיבוי מוצפן נוצר. שמור את הסיסמה בנפרד.');}catch(e){notice(e.message,'warn');}});
$('#export-csv-btn').addEventListener('click',()=>{if(!confirm('הייצוא ייצור קובץ CSV שאינו מוצפן ועלול להישמר בתיקיית ההורדות או בגיבוי הענן של המכשיר. להמשיך?'))return;const header=['name','ticker','value','pnl','currency','sector','region','risk','asof'];const quote=(x,text=false)=>{let s=String(x??'');if(text&&/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const lines=[header.join(','),...state.holdings.map(h=>header.map(x=>quote(h[x],!['value','pnl'].includes(x))).join(','))];download('holdings-'+today()+'.csv','\ufeff'+lines.join('\r\n'),'text/csv;charset=utf-8');notice('קובץ CSV לא מוצפן יוצא למכשיר. שמור אותו במקום מוגן.','warn');});
function tokenizeCSV(line,separator){let items=[],buf='',inside=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(inside&&line[i+1]==='"'){buf+='"';i++;}else inside=!inside;}else if(c===separator&&!inside){items.push(buf);buf='';}else buf+=c;}items.push(buf);return items;}
function importCSV(text){const lines=text.replace(/^\ufeff/,'').split(/\r?\n/).filter(s=>s.trim());if(lines.length<2)throw Error('קובץ CSV ריק');const sep=['\t',';',','].sort((a,b)=>lines[0].split(b).length-lines[0].split(a).length)[0];const header=tokenizeCSV(lines[0],sep).map(h=>h.trim().toLowerCase());const aliases={name:['name','שם','שם נייר ערך','נייר ערך'],ticker:['ticker','סימול','מספר נייר'],value:['value','valueils','שווי','שווי נוכחי','שווי (₪)'],pnl:['pnl','totalval','רווח','רווח/הפסד','רווח הפסד'],currency:['currency','מטבע'],sector:['sector','ענף'],region:['region','אזור'],risk:['risk'],asof:['asof','תאריך']};const idx={};for(const [k,terms] of Object.entries(aliases))idx[k]=header.findIndex(h=>terms.includes(h));if(idx.name<0||idx.value<0)throw Error('חסרות עמודות שם ושווי');const rows=[];for(let i=1;i<lines.length;i++){const fields=tokenizeCSV(lines[i],sep),get=k=>idx[k]===-1?'':fields[idx[k]]||'';const obj={name:get('name'),ticker:get('ticker'),value:parseNumber(get('value')),pnl:get('pnl').trim()?parseNumber(get('pnl')):null,currency:get('currency')||'ILS',sector:get('sector'),region:get('region'),risk:get('risk'),asof:get('asof')||today()};if(!obj.name||obj.value===null)throw Error(`שורה ${i+1} אינה תקינה`);rows.push(obj);}return rows;}
$('#import-csv-btn').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;const epoch=sessionEpoch;try{if(f.size>2e6)throw Error('קובץ גדול מדי');const content=await f.text();if(!sessionValid(epoch))return;let arr;if(f.name.toLowerCase().endsWith('.json')){const j=JSON.parse(content);arr=Array.isArray(j)?j:j.holdings;if(!Array.isArray(arr))throw Error('פורמט JSON לא מוכר');}else arr=importCSV(content);if(arr.length>300)throw Error('יותר מ-300 אחזקות');const rows=arr.map((r,i)=>({name:r.name,ticker:r.ticker||'',value:r.value,pnl:r.pnl===undefined?null:r.pnl,currency:r.currency||'ILS',source:f.name,notes:[],sector:r.sector,region:r.region,risk:r.risk,asof:r.asof||today()}));showReview(rows,'ייבוא קובץ - בדוק לפני אישור');}catch(err){notice(err.message,'warn');}});

// OCR needs same-origin vendor modules. Neither image bytes nor recognized text leave this page.
async function checkOCREngine(){
 const dot=$('.status-dot'), label=$('#ocr-status-text');
 const required=['./vendor/tesseract/tesseract.min.js','./vendor/tesseract/worker.min.js','./vendor/core/tesseract-core-simd-lstm.wasm.js','./vendor/core/tesseract-core-simd-lstm.wasm','./vendor/lang/heb.traineddata.gz','./vendor/lang/eng.traineddata.gz'];
 try{
  const results=await Promise.all(required.map(async file=>{
   const response=await fetch(file,{method:'HEAD',cache:'no-store'});
   if(!response.ok)throw new Error(file);
   return response;
  }));
  engineStatus='ready';dot.classList.add('ready');
  label.textContent='קובצי OCR מקומיים זמינים. התמונות יפוענחו במכשיר בלבד; יש לאמת את הזיהוי לפני שמירה.';
 }catch{
  engineStatus='missing';dot.classList.remove('ready');
  label.textContent='קובצי מנוע OCR עדיין חסרים. הפעל את תהליך הבנייה המלא; עד אז אפשר להדביק טקסט או לייבא CSV.';
 }
}
async function OCRWorker(){if(engineStatus==='missing')throw Error('מנוע OCR אינו מותקן. התקן את קובצי Tesseract לפי README והפעל מחדש.');if(!window.Tesseract){const script=document.createElement('script');script.src='./vendor/tesseract/tesseract.min.js';script.async=true;await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(Error('טעינת מנוע OCR נכשלה'));document.head.append(script);});}
 return window.Tesseract.createWorker(['heb','eng'],1,{workerPath:new URL('./vendor/tesseract/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/core',import.meta.url).href,langPath:new URL('./vendor/lang',import.meta.url).href,workerBlobURL:false,cacheMethod:'none',logger:msg=>{if(msg.status==='recognizing text'){$('#processing-status')?.replaceChildren(node('span','',`זיהוי טקסט ${Math.round((msg.progress||0)*100)}%`));}}});}
function clearImages(){images=[];staged=[];$('#screenshots').value='';}
async function createCropCanvas(file,top=0,bottom=0){let bitmap=null;let img=null;let url=null;try{if('createImageBitmap'in window)bitmap=await createImageBitmap(file);else {url=URL.createObjectURL(file);img=new Image();img.src=url;await img.decode();}const w=bitmap?.width||img.width,h=bitmap?.height||img.height;if(w<16||h<16||w>12000||h>12000||w*h>30000000)throw Error('ממדי התמונה גדולים מדי');const y=Math.floor(h*top/100),cropH=Math.max(8,h-y-Math.floor(h*bottom/100));const maxW=2200,maxH=3200,scale=Math.min(1,maxW/w,maxH/cropH);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(cropH*scale));const ctx=canvas.getContext('2d',{willReadFrequently:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap||img,0,y,w,cropH,0,0,canvas.width,canvas.height);return canvas;}finally{bitmap?.close?.();if(url)URL.revokeObjectURL(url);}}
function cropDialog(){if(!images.length)return;let canceled=false,started=false;const wrap=node('div','form-col'),desc=node('p','caption','בחר אזור שבו מופיעה טבלת האחזקות. החיתוך מתבצע בדפדפן ומקטין חשיפת פרטים מזהים. מומלץ לוודא שהטבלה עצמה אינה נחתכת.');const grid=node('div','row-two'),topF=formField('חיתוך עליון (%)',String(cropTop),'number'),bottomF=formField('חיתוך תחתון (%)',String(cropBottom),'number');topF.input.min='0';topF.input.max='50';bottomF.input.min='0';bottomF.input.max='50';grid.append(topF.wrap,bottomF.wrap);const previews=node('div','thumb-grid');const status=node('div','caption','עדכון תצוגה מקדימה...');const actions=node('div','dialog-actions'),start=node('button','btn primary','סרוק במכשיר'),cancel=node('button','btn','ביטול');actions.append(start,cancel);wrap.append(desc,grid,status,previews,actions);
 let rev=0;async function preview(){const revNow=++rev;const t=Number(topF.input.value),b=Number(bottomF.input.value);if(!Number.isFinite(t)||!Number.isFinite(b)||t<0||b<0||t+b>=95)return status.textContent='אחוזי חיתוך לא תקינים';previews.replaceChildren();status.textContent='תצוגה מקדימה של התמונות לאחר חיתוך';for(const file of images){try{const canvas=await createCropCanvas(file,t,b);if(revNow!==rev||canceled)return;const thumb=node('div','thumb'),mini=document.createElement('canvas');mini.width=320;mini.height=Math.max(90,Math.round(canvas.height*320/canvas.width));mini.getContext('2d').drawImage(canvas,0,0,mini.width,mini.height);thumb.append(mini,node('small','',file.name));previews.append(thumb);canvas.width=0;canvas.height=0;}catch{status.textContent='לא ניתן להציג את התמונה';}}}
 topF.input.addEventListener('change',preview);bottomF.input.addEventListener('change',preview);
 start.addEventListener('click',async()=>{cropTop=Number(topF.input.value);cropBottom=Number(bottomF.input.value);if(!Number.isFinite(cropTop)||!Number.isFinite(cropBottom)||cropTop<0||cropBottom<0||cropTop+cropBottom>=95)return notice('החיתוך אינו תקין','warn');started=true;closeModal();await scanImages();});cancel.addEventListener('click',closeModal);
 modal('הגדרת אזור סריקה - תמונות אינן מועלות',wrap,()=>{canceled=true;rev++;if(!started)clearImages();});preview();}
async function validImageFile(file){
 if(file.size<=0||file.size>MAX_FILE_BYTES)return false;
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
 const jpg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!png&&!jpg&&!webp)return false;
 if(file.type && !['image/jpeg','image/png','image/webp'].includes(file.type))return false;
 return !file.type||png&&file.type==='image/png'||jpg&&file.type==='image/jpeg'||webp&&file.type==='image/webp';
}
$('#screenshots').addEventListener('change',async e=>{
 const epoch=sessionEpoch;const files=[...(e.target.files||[])];if(!files.length)return;
 if(files.length>MAX_FILES){clearImages();return notice('אפשר לבחור עד 8 תמונות בכל עדכון','warn');}
 try{
  if(!(await Promise.all(files.map(validImageFile))).every(Boolean))throw Error('יש לבחור תמונות JPG/PNG/WEBP תקינות, עד 7MB כל אחת.');
  if(!sessionValid(epoch))return;images=files;cropDialog();
 }catch(err){clearImages();notice(err.message||'לא ניתן לקרוא את הקובץ','warn');}
});
async function scanImages(){const epoch=sessionEpoch;if(!sessionValid(epoch)||!images.length)return;const selection=[...images];const wrap=node('div','form-col'),title=node('div','privacy-caption','● התמונות מעובדות מקומית בלבד'),status=node('div','hint','טוען מנוע OCR מקומי...'),progress=node('div','caption',''),abort=node('button','btn','הפסק לאחר התמונה הנוכחית');wrap.append(title,status,progress,abort);modal('סריקת תמונות במכשיר',wrap);recognitionBusy=true;let canceled=false;abort.addEventListener('click',()=>{canceled=true;abort.disabled=true;abort.textContent='מפסיק...';});
 let worker=null;const parsed=[];try{worker=await OCRWorker();activeOCRWorker=worker;if(!sessionValid(epoch)){await worker.terminate();return;}for(let i=0;i<selection.length;i++){if(canceled||!sessionValid(epoch))break;status.textContent=`מעבד תמונה ${i+1} מתוך ${selection.length}: ${selection[i].name}`;const canvas=await createCropCanvas(selection[i],cropTop,cropBottom);let text='';try{const res=await worker.recognize(canvas);text=res.data.text||'';}finally{canvas.width=0;canvas.height=0;}parsed.push({source:selection[i].name,text});progress.textContent=`הושלמו ${i+1} תמונות.`;}
 if(!sessionValid(epoch))return;if(!canceled){closeModal();ocrTextDialog(parsed);}else{closeModal();notice('הסריקה בוטלה. לא נשמרו תמונות או נתונים.');}}
 catch(e){if(!sessionValid(epoch))return;closeModal();notice('הסריקה נכשלה: '+e.message,'warn');}
 finally{try{await worker?.terminate?.();}catch{}if(activeOCRWorker===worker)activeOCRWorker=null;if(epoch===sessionEpoch){recognitionBusy=false;clearImages();}}}
function ocrTextDialog(results){
 const wrap=node('div','form-col');
 const subtitle=node('p','caption',`חולץ טקסט מ-${results.length} מקורות. בדוק כל צילום בנפרד ותקן כאן את הזיהוי. הטקסט אינו נשמר.`);
 const row=node('div','row-two'),format=selectField('סדר העמודות',['value-pnl','pnl-value','value-only','value-pct-pnl'],'value-pnl'),curr=selectField('מטבע ברירת מחדל',['ILS','USD','EUR'],'ILS');
 const fmtLabels={'value-pnl':'שם | שווי | רווח/הפסד','pnl-value':'שם | רווח/הפסד | שווי','value-only':'שם | שווי בלבד','value-pct-pnl':'שם | שווי | אחוזים | רווח'};
 for(const opt of format.input.options)opt.textContent=fmtLabels[opt.value]||opt.value;
 row.append(format.wrap,curr.wrap);
 const textInputs=[];
 wrap.append(subtitle,row);
 for(let i=0;i<results.length;i++){
  const r=results[i],textLabel=node('label');
  const name=node('span','',results.length===1?'טקסט OCR שחולץ - ניתן לתקן כאן':`צילום ${i+1}: ${r.source||'מקור לא ידוע'}`);
  const txt=node('textarea');txt.rows=results.length===1?9:5;txt.value=r.text||'';
  textLabel.append(name,txt);wrap.append(textLabel);textInputs.push({text:txt,source:r.source||`צילום ${i+1}`});
 }
 const rejectInfo=node('div','caption',''),actions=node('div','dialog-actions'),parse=node('button','btn primary','המשך לבדיקת אחזקות'),cancel=node('button','btn','ביטול');
 actions.append(parse,cancel);wrap.append(rejectInfo,actions);
 parse.addEventListener('click',()=>{
  const batches=textInputs.map(r=>parseOCR(r.text.value,{format:format.input.value,currency:curr.input.value,source:r.source}));
  const rows=batches.flatMap(b=>b.rows),rejected=batches.flatMap(b=>b.rejected);
  if(!rows.length){rejectInfo.textContent='לא זוהו שורות. תקן טקסט או נסה תבנית עמודות אחרת, או הוסף נייר ידנית.';return;}
  closeModal();showReview(rows,`נתונים שפוענחו - ${rows.length} שורות לבדיקה`,rejected);
 });
 cancel.addEventListener('click',closeModal);
 modal('בדיקת טקסט OCR לפני קליטה',wrap);
}

$('#paste-btn').addEventListener('click',()=>ocrTextDialog([{text:'',source:'הדבקה'}]));
function showReview(rows,title,rejected=[]){staged=mergeScans([rows]);const layout=node('div','form-col'),intro=node('p','caption',`זוהו ${staged.length} שורות. ערוך כל שווי ורווח מול צילום המקור. אין עדכון אוטומטי. שדות רווח חסרים נשארים לא ידועים.`),dataTitle=node('div','analysis-alert','חשוב: המטבע חייב להתאים לנתוני הברוקר. אל תאשר מידע שלא ניתן לזהות בביטחון. קיימת אפשרות ששורת OCR תזוהה באופן שגוי.'),rowsEl=node('div');layout.append(intro,dataTitle,rowsEl);
 let controls=[];
 for(const r of staged){const match=matchHolding(r,state.holdings),item=node('div','review-row'+(r.conflict?' conflict':''));const on=node('input');on.type='checkbox';on.checked=!r.conflict;on.title='כלול בעדכון';const name=node('input');name.value=r.name;name.maxLength=100;name.setAttribute('aria-label','שם נייר');const value=node('input');value.value=String(r.value);value.type='number';value.step='any';value.setAttribute('aria-label','שווי');const pnl=node('input','review-pnl');pnl.value=r.pnl===null?'':String(r.pnl);pnl.placeholder='לא ידוע';pnl.type='number';pnl.step='any';pnl.setAttribute('aria-label','רווח/הפסד');const tickInput=node('input');tickInput.value=r.ticker||'';tickInput.maxLength=24;tickInput.placeholder='סימול (אופציונלי)';tickInput.setAttribute('aria-label','סימול נייר');const currency=node('select','review-currency');for(const c of ['ILS','USD','EUR']){const o=node('option','',c);o.value=c;currency.append(o);}currency.value=r.currency||'ILS';const hint=node('div','source-note',[`מקור: ${r.source||'צילום'}`,match.status==='update'?'נמצא בתיק - יתעדכן':match.status==='ambiguous'?'התאמה לא חד משמעית - ייבדק':'חדש - יתווסף',r.conflict?'כפילות עם ערכים שונים - יש לפתור ידנית':null,...(r.notes||[])].filter(Boolean).join(' · '));item.append(on,name,value,pnl,currency,tickInput,hint);if(r.conflict){for(const option of (r.alternatives||[])){const use=node('button','inline-button',`השתמש בחלופה: ${option.value} ${option.currency} / רווח ${option.pnl===null?'לא ידוע':option.pnl}`);use.type='button';use.addEventListener('click',()=>{value.value=String(option.value);pnl.value=option.pnl===null?'':String(option.pnl);currency.value=option.currency;});item.append(use);}const accept=node('label','source-note');const resolved=node('input');resolved.type='checkbox';accept.append(resolved,node('span','',' בדקתי את הכפילות ובחרתי ערך אחד'));item.append(accept);controls.push({on,name,value,pnl,currency,ticker:tickInput,r,match,resolved});}else controls.push({on,name,value,pnl,currency,ticker:tickInput,r,match,resolved:null});rowsEl.append(item);}
 if(!staged.length){rowsEl.append(node('p','empty','לא נמצאו אחזקות. ניתן להוסיף ידנית.'));}
 if(rejected.length){const details=node('details'),summary=node('summary','',`שורות שלא פוענחו (${rejected.length})`),list=node('div','result-list');for(const s of rejected.slice(0,35))list.append(node('p','',s));details.append(summary,list);layout.append(details);}
 const date=formField('תאריך הנתונים בצילום',today(),'date'),actions=node('div','dialog-actions'),apply=node('button','btn primary','אשר עדכון תיק'),cancel=node('button','btn','ביטול');actions.append(apply,cancel);layout.append(date.wrap,actions);
 apply.addEventListener('click',async()=>{apply.disabled=true;try{const selected=controls.filter(x=>x.on.checked);if(!selected.length)throw Error('לא נבחרו אחזקות לעדכון');const next=structuredClone(state),seen=new Set();let updated=0,added=0;
 for(const c of selected){if(c.r.conflict&&!c.resolved?.checked)throw Error('נמצאה כפילות עם ערכים שונים: יש לאשר פתרון ידני');const name=c.name.value.trim();const ticker=c.ticker.value.trim();const match=matchHolding({name,ticker},next.holdings);if(match.status==='ambiguous')throw Error('התאמה לא חד משמעית: '+name);const value=Number(c.value.value),pnl=c.pnl.value.trim()===''?null:Number(c.pnl.value);const original=match.status==='update'?next.holdings.find(x=>x.id===match.id):null;
 const key=normalizeName(ticker||name);if(seen.has(key))throw Error('נייר כפול בעדכון: '+name);seen.add(key);
 const h=validateHolding({id:original?.id||mkID(),name,ticker:original?.ticker||ticker,value,pnl,currency:c.currency.value,sector:original?.sector||c.r.sector||'אחר',region:original?.region||c.r.region||'לא ידוע',risk:original?.risk||c.r.risk||'core',asof:date.input.value,updatedAt:nowISO()});
 if(original){next.holdings[next.holdings.findIndex(x=>x.id===original.id)]=h;updated++;}else{next.holdings.push(h);added++;}}
 if(next.holdings.length>300)throw Error('יותר מ-300 ניירות ערך');await commit(withSnapshot(next,`עדכון מ-${selected.length} אחזקות`),`נשמרו ${updated} עדכונים ו-${added} אחזקות חדשות. תמונות לא נשמרו.`);closeModal();
 }catch(e){notice(e.message,'warn');}finally{apply.disabled=false;}});
 cancel.addEventListener('click',closeModal);modal(title,layout,()=>{staged=[];});}

// Password gating. Password exists only as in-memory JS variable during an unlocked session.
function refreshLock(){const exists=vaultExists();$('#vault-reset').hidden=!exists;$('#unlock-btn').textContent=exists?'פתח כספת מוצפנת':'צור כספת מוצפנת';$('#lock-explainer').textContent=exists?'הסיסמה אינה נשלחת לשום שרת. אם תאבד אותה, לא ניתן יהיה לשחזר את הנתונים ללא גיבוי וסיסמה.':'בהקמה הראשונה נדרשים לפחות 14 תווים. מומלץ משפט סיסמה ארוך. הכספת נשמרת בדפדפן זה בלבד.';}
$('#unlock-form').addEventListener('submit',async e=>{e.preventDefault();$('#unlock-error').textContent='';const epoch=++sessionEpoch;const pass=$('#vault-pass').value;$('#unlock-btn').disabled=true;try{if(pass.length<10)throw Error('סיסמה קצרה מדי');if(!vaultExists()&&pass.length<14)throw Error('בהקמת כספת חדשה נדרשים לפחות 14 תווים');if(!crypto?.subtle||location.protocol==='file:')throw Error('יש להפעיל את האתר ב-HTTPS או localhost, לא בפתיחת file://.');const raw=vaultExists()?await loadVault(pass):empty();if(epoch!==sessionEpoch)return;const validated=validateState(raw);if(!vaultExists())await saveVault(validated,pass,()=>epoch===sessionEpoch);if(epoch!==sessionEpoch)return;passphrase=pass;state=validated;lastActivity=Date.now();$('#vault-pass').value='';$('#unlock-screen').hidden=true;$('#app').hidden=false;render();await checkOCREngine();}catch(err){$('#unlock-error').textContent=err.message;}finally{$('#unlock-btn').disabled=false;refreshLock();}});
function lock(){sessionEpoch++;activeOCRWorker?.terminate?.().catch(()=>{});activeOCRWorker=null;recognitionBusy=false;dialogCloseAction=null;passphrase=null;state=null;clearImages();staged=[];privateMode=false;document.body.classList.remove('privacy');$('#app').hidden=true;$('#modal-layer').hidden=true;$('#dialog-body').replaceChildren();$('#holdings-body').replaceChildren();$('#snapshots').replaceChildren();$('#exposure').replaceChildren();$('#stat-total').textContent='—';$('#stat-pnl').textContent='—';$('#toast').replaceChildren();$('#unlock-screen').hidden=false;$('#vault-pass').value='';refreshLock();}
$('#lock-btn').addEventListener('click',lock);
window.portfolioCompassLock=lock;
$('#vault-reset').addEventListener('click',()=>{if(!confirm('מחיקת הכספת המקומית אינה הפיכה. ודא שיש גיבוי מוצפן והסיסמה שלו. למחוק?'))return;const word=prompt('להקליד בדיוק DELETE כדי למחוק את נתוני התיק המקומיים');if(word!=='DELETE')return;eraseVault();refreshLock();$('#unlock-error').textContent='הכספת המקומית נמחקה. ניתן ליצור חדשה.';});
$('#unlock-import').addEventListener('click',()=>{const input=node('input');input.type='file';input.accept='.json,application/json';input.addEventListener('change',async()=>{const f=input.files?.[0];if(!f)return;try{if(vaultExists())throw Error('כבר קיימת כספת: יש לגבות ולמחוק לפני שחזור.');if(f.size>10e6)throw Error('קובץ גדול מדי');const content=await f.text(),obj=JSON.parse(content);if(obj.format!=='pc-v5-encrypted')throw Error('נדרש גיבוי מוצפן של v5');const pass=$('#vault-pass').value;if(pass.length<10)throw Error('הזן את סיסמת הגיבוי בשדה הסיסמה');const epoch=sessionEpoch;validateState(await decryptState(obj,pass));if(epoch!==sessionEpoch||vaultExists())return;localStorage.setItem(VAULT_KEY,JSON.stringify(obj));refreshLock();$('#unlock-error').textContent='הגיבוי שוחזר. לחץ על פתיחת הכספת.';}catch(e){$('#unlock-error').textContent=e.message;}});input.click();});
refreshLock();
