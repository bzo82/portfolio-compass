/**
 * Financial OCR parser (untrusted text). No network, storage, DOM or I/O.
 * Ambiguous data must be reviewed: no fabricated FX or profit.
 */
export const MAX_HOLDINGS = 300;
const STOP = /^(?:סה.?כ|סהכ|סך|שווי\s+תיק|יתרה|מזומן|רווח\s+כולל|total|portfolio|balance|cash|market\s+value|profit|account|מספר\s+חשבון|עמוד|תאריך|שם\s+נייר|ני״ע|ניירות\s+ערך)$/i;
const BAD_LINE = /(?:מספר\s*חשבון|ת\.ז\.|מספר\s*לקוח|account\s*(?:number|no)|customer\s*id|סיסמה|password|IBAN)/i;
const TICKER = /\b[A-Z][A-Z0-9.\-]{1,9}\b/;
const FIN = /(?:₪|ש["״']?ח|ILS|NIS|\$|USD|EUR|€)/i;
const NUM = /(?<![A-Za-z0-9])[-−+]?\(?[ \t]*[₪$€]?[ \t]*\d+(?:[,.]\d+)*(?:[ \t]*%)?[ \t]*\)?(?:[-−](?!\d))?/g;
export function parseNumber(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;
  const neg = /^\s*\(/.test(s) && /\)\s*$/.test(s) || /^\s*[-−]/.test(s) || /[-−]\s*$/.test(s);
  // Reject OCR substitutions and broken punctuation rather than joining digits.
  if(!/^[\s₪$€+−\-()\d.,%]+$/.test(s))return null;
  s=s.replace(/[^\d.,]/g,'');
  if(!s) return null;
  if(!/^\d+(?:[,.]\d+)*$/.test(s))return null;
  const dots=(s.match(/\./g)||[]).length, commas=(s.match(/,/g)||[]).length;
  if(dots && commas){const dec=s.lastIndexOf('.')>s.lastIndexOf(',')?'.':','; const sep=dec==='.'?',':'.';const parts=s.split(dec);if(parts.length!==2||!/^\d{1,2}$/.test(parts[1])||!/^\d{1,3}(?:[,.]\d{3})+$/.test(parts[0]))return null;s=parts[0].split(sep).join('')+'.'+parts[1];}
  else if(commas||dots){const sep=commas?',':'.',parts=s.split(sep);if(parts.length>2||parts[1].length===3){if(!/^\d{1,3}(?:[,.]\d{3})+$/.test(s))return null;s=parts.join('');}else {if(parts[1].length>2)return null;s=parts.join('.');}}
  const n=Number(s);return Number.isFinite(n)?(neg?-Math.abs(n):n):null;
}
export function currencyOf(input){const s=String(input||'');if(/\$|\bUSD\b/i.test(s))return 'USD';if(/€|\bEUR\b/i.test(s))return 'EUR';if(/₪|\bILS\b|\bNIS\b|ש["״']?ח/i.test(s))return 'ILS';return null;}
export function normalizeName(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/[^a-z0-9\u0590-\u05ff]/g,'').slice(0,100);}
export function plausibleTicker(s){const text=String(s||'').trim();return /^[A-Z][A-Z0-9.\-]{0,9}$/.test(text)&&!['ILS','USD','EUR','NIS'].includes(text)?text:'';}
export function cleanText(s){return String(s||'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\u00a0/g,' ').trim().slice(0,250);}
function fields(line){return [...line.matchAll(NUM)].map(m=>({raw:m[0].trim(),number:parseNumber(m[0]),start:m.index,end:m.index+m[0].length,percent:m[0].includes('%'),currency:currencyOf(m[0])}));}
const amount = x=>Number.isFinite(x?.number) && !x.percent && Math.abs(x.number)>=0 && Math.abs(x.number)<=1e11;
const parseLine=(line,kind,defaultCurrency='ILS')=>{
 const f=fields(line);
 if(f.length<1||f.some(x=>x.number===null)||BAD_LINE.test(line))return null;
 if(/^(?:סה[״"׳']?כ|סך הכל|שווי תיק|יתרה|מזומן|רווח כולל|total|portfolio|balance|cash|market value|profit|תאריך|שם נייר|כמות|מחיר)(?:\s|:|\||$)/i.test(line))return null;
 if(/\d{1,4}[/:]\d{1,2}(?:[/:]\d{2,4})?/.test(line))return null;
 // OCR may read RTL tables as amounts first, name last. Alternatively an Israeli
 // security ID may precede the name. Never treat the identifier as market value.
 const prefix=line.slice(0,f[0].start).replace(/^[•\s-]+/,'').trim();
 const suffix=line.slice(f[f.length-1].end).replace(/^[•\s-]+/,'').trim();
 const middle=f.length>=2 ? line.slice(f[0].end,f[1].start).replace(/^[•\s-]+/,'').trim() : '';
 const validName=x=>x.length>=2&&!STOP.test(x)&&!BAD_LINE.test(x)&&!/^\d+$/.test(x)&&/[A-Za-z\u0590-\u05ff]/.test(x);
 let header='', securityId=false;
 if(validName(prefix))header=prefix;
 else if(validName(suffix))header=suffix;
 else if(f.length>=3 && /^\d{6,10}$/.test(f[0].raw) && validName(middle)){
  header=middle;securityId=true;
 }
 if(!header)return null;
 // A name interrupted by numbers, a second name, or extra amount columns is
 // ambiguous (index number, quantity, price, ID...). Never guess the value.
 const nameFragment=x=>/[A-Za-z\u0590-\u05ff]/.test(x.replace(/\b(?:ILS|USD|NIS|EUR)\b/ig,'').replace(/ש["״']?ח/g,''));
 const gaps=f.slice(1).map((x,i)=>line.slice(f[i].end,x.start));
 if(gaps.some(x=>nameFragment(x)&&!(securityId&&x.trim()===middle)))return null;
 const nums=f.filter((x,i)=>amount(x)&&!(securityId&&i===0));
 if(!nums.length)return null;
 if(nums.length>(kind==='value-only'?1:2))return null;
 // We don't infer that a negative row total is a value; value must be nonnegative.
 let v=null,p=null;
 if(kind==='value-pnl'){
   if(nums.length>=2){v=nums[0];p=nums[1];}else v=nums[0];
 }else if(kind==='pnl-value'){
   if(nums.length>=2){p=nums[0];v=nums[1];}else return null;
 }else if(kind==='value-only'){v=nums[0];}
 else if(kind==='value-pct-pnl'){
   v=nums[0];p=nums.find((x,i)=>i>0 && x.number<0)||nums[nums.length-1];
   if(p===v)p=null;
 }
 if(!v||v.percent||v.number<0||v.number>1e10)return null;
 const name=cleanText(header.replace(/\b(?:ILS|USD|NIS|EUR)\b/ig,'').replace(/[|:]/g,' '));
 if(!name||FIN.test(name)||/^\d+/.test(name))return null;
 const explicitCurrencies=[...line.matchAll(/₪|\$|€|\b(?:ILS|USD|NIS|EUR)\b/ig)].map(x=>currencyOf(x[0]));
 if(new Set(explicitCurrencies).size>1)return null;
 const curr=v.currency||currencyOf(line)||defaultCurrency;
 const pnlCurrency=p?(p.currency||curr):null;
 // A screenshot's gain must be a monetary amount, never a percent.
 let pnl=p && !p.percent && pnlCurrency===curr ? p.number : null;
 if(pnl!==null && pnl>v.number)pnl=null;
 const notes=[];
 if(p && p.percent)notes.push('זוהתה תשואה באחוזים ולא רווח כספי');
 if(!p)notes.push('הרווח/הפסד לא זוהה');
 if(!/₪|\$|€|\bILS\b|\bUSD\b|\bNIS\b|\bEUR\b/i.test(line))notes.push('המטבע לא מופיע בשורה - נקבע לפי בחירת המשתמש');
 if(securityId)notes.push('זוהה מספר נייר מוביל והוסר מחישוב השווי');
 if(header===suffix)notes.push('שם הנייר מופיע אחרי העמודות המספריות - יש לבדוק את הסדר');
 if(f.length>3)notes.push('בשורה יש עמודות נוספות - יש לוודא מיפוי נכון');
 return {name,ticker:plausibleTicker(name),value:v.number,pnl,currency:curr,notes,raw:line,confidence:notes.length?'review':'review'};
};
/**
 * OCR text is noisy and platform-dependent; no automatic application.
 * format options: value-pnl, pnl-value, value-only, value-pct-pnl.
 */
export function parseOCR(text,{format='value-pnl',currency='ILS',source=''}={}){
 if(!['value-pnl','pnl-value','value-only','value-pct-pnl'].includes(format))throw new Error('תבנית לא מזוהה');
 if(!['ILS','USD','EUR'].includes(currency))throw new Error('מטבע לא נתמך');
 const lines=String(text||'').split(/\r?\n/).map(cleanText).filter(Boolean).slice(0,400);
 const rows=[],rejected=[];
 for(const line of lines){
  if(BAD_LINE.test(line))continue;
  const row=parseLine(line,format,currency);
  if(row)rows.push({...row,source:String(source).slice(0,90)});
  else if(/\d/.test(line) && !STOP.test(line))rejected.push(line);
 }
 return {rows:rows.slice(0,MAX_HOLDINGS),rejected:rejected.slice(0,90),lineCount:lines.length};
}
export function mergeScans(scanResults){
 const out=[];
 for(const batch of scanResults){for(const row of batch){
  const key=normalizeName(row.ticker||row.name);
  const earlier=out.find(x=>x._key===key);
  if(earlier){
    if(earlier.value===row.value&&earlier.pnl===row.pnl&&earlier.currency===row.currency){earlier.notes=[...new Set([...earlier.notes,'מופיע ביותר מתמונה אחת'])];}
    else {earlier.conflict=true;earlier.notes=[...new Set([...earlier.notes,'נתונים שונים בתמונות - יש לבחור ולתקן ידנית'])];earlier.alternatives=[...(earlier.alternatives||[]),row];}
  }else out.push({...row,_key:key,conflict:false,alternatives:[]});
 }}return out.map(({_key,...r})=>r);
}
export function matchHolding(row, holdings){
 const ticker=normalizeName(row.ticker);const name=normalizeName(row.name);
 const matches=holdings.filter(h=> (ticker&&normalizeName(h.ticker)===ticker)||(name&&normalizeName(h.name)===name));
 return matches.length===1?{id:matches[0].id,status:'update'}:matches.length>1?{id:null,status:'ambiguous'}:{id:null,status:'new'};
}
export function validateHolding(input){
 const name=cleanText(input?.name).slice(0,100),ticker=cleanText(input?.ticker).slice(0,24);
 const currency=input?.currency;
 const value=Number(input?.value),pnl=input?.pnl===null||input?.pnl===''||input?.pnl===undefined?null:Number(input.pnl);
 if(!name||name.length<2)throw new Error('שם נייר ערך חסר');
 if(!['ILS','USD','EUR'].includes(currency))throw new Error('מטבע לא תקין');
 if(!Number.isFinite(value)||value<0||value>1e10)throw new Error('שווי אינו תקין');
 if(pnl!==null && (!Number.isFinite(pnl)||Math.abs(pnl)>1e10||pnl>value))throw new Error('רווח/הפסד שגוי ביחס לשווי');
 return {id:String(input?.id||'').slice(0,80),name,ticker,currency,value,pnl,sector:['פיננסים','טכנולוגיה','תשתיות','תעשייה וביטחון','מדד רחב','אחר'].includes(input.sector)?input.sector:'אחר',region:['ישראל','ארה״ב','אירופה','שווקים מתעוררים','גלובלי','לא ידוע'].includes(input.region)?input.region:'לא ידוע',risk:input.risk==='elevated'?'elevated':'core',asof:/^\d{4}-\d{2}-\d{2}$/.test(input.asof||'')?input.asof:'',updatedAt:typeof input.updatedAt==='string'?input.updatedAt:''};
}
export function metrics(holdings,fx={USD:null,EUR:null}){
 const totals={ILS:0,USD:0,EUR:0};let knownPnlILS=0,unknownPnl=0,unknownFx=0,totalILS=0;
 for(const h of holdings){let rate=h.currency==='ILS'?1:Number(fx[h.currency]);
 if(h.currency!=='ILS'&&(!Number.isFinite(rate)||rate<=0)){unknownFx++;continue;}
 const v=h.value*rate;totalILS+=v;totals[h.currency]+=h.value;
 if(h.pnl===null||h.pnl===undefined)unknownPnl++;else knownPnlILS+=h.pnl*rate;
 }
 const fxComplete=unknownFx===0,pnlComplete=unknownPnl===0&&fxComplete;
 const weights=fxComplete&&totalILS>0?holdings.map(h=>({h,w:h.value*(h.currency==='ILS'?1:Number(fx[h.currency]))/totalILS})):[];
 const hhi=weights.reduce((s,x)=>s+x.w*x.w,0);
 const bySector={},byRegion={};let elevated=0;
 for(const {h,w} of weights){bySector[h.sector]=(bySector[h.sector]||0)+w;byRegion[h.region]=(byRegion[h.region]||0)+w;if(h.risk==='elevated')elevated+=w;}
 const top=weights.map(x=>x.w).sort((a,b)=>b-a);
 const israel=byRegion['ישראל']||0;
 const riskScore=fxComplete&&totalILS>0?Math.min(10,Math.max(1,3+5*hhi+2*Math.max(0,israel-.4)+2.5*elevated)):null;
 return {totalILS:fxComplete?totalILS:null,knownPnlILS:pnlComplete?knownPnlILS:null,totals,unknownFx,unknownPnl,fxComplete,pnlComplete,weights,hhi,bySector,byRegion,top1:top[0]||0,top2:(top[0]||0)+(top[1]||0),riskScore};
}
