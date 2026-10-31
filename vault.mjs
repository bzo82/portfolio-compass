// Encrypted local vault. Images/OCR text are never persisted by this module.
// PBKDF2 with 310k iterations, 16B salt, AES-GCM 256, random IV each save.
export const VAULT_KEY='portfolio-compass-v5-vault';
const E=new TextEncoder(),D=new TextDecoder();
const base64=arr=>{let result='';const size=16384;for(let i=0;i<arr.length;i+=size)result+=String.fromCharCode(...arr.subarray(i,i+size));return btoa(result);};
const unbase64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
export function isAvailable(){return typeof crypto!=='undefined'&&!!crypto.subtle && typeof localStorage!=='undefined';}
export function vaultExists(){return localStorage.getItem(VAULT_KEY)!==null;}
export function eraseVault(){localStorage.removeItem(VAULT_KEY);}
async function keyFrom(pass,salt){const base=await crypto.subtle.importKey('raw',E.encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function encryptState(data,pass,saltHex){
 if(typeof pass!=='string'||pass.length<10)throw new Error('נדרשת סיסמה באורך 10 תווים לפחות');
 const salt=saltHex?unbase64(saltHex):crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await keyFrom(pass,salt);
 const encoded=E.encode(JSON.stringify(data));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoded));
 return {format:'pc-v5-encrypted',kdf:'PBKDF2-SHA256',iterations:310000,algorithm:'AES-GCM-256',salt:base64(salt),iv:base64(iv),ciphertext:base64(encrypted)};
}
export async function decryptState(envelope,pass){
 if(envelope?.format!=='pc-v5-encrypted'||envelope.iterations!==310000||typeof envelope.salt!=='string'||typeof envelope.ciphertext!=='string')throw new Error('פורמט גיבוי מוצפן לא תקין');
 try{const key=await keyFrom(pass,unbase64(envelope.salt));const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(envelope.iv)},key,unbase64(envelope.ciphertext));return JSON.parse(D.decode(raw));}
 catch{throw new Error('סיסמה שגויה או קובץ פגום');}
}
export async function saveVault(state,pass){const prior=localStorage.getItem(VAULT_KEY);const salt=prior?JSON.parse(prior).salt:undefined;const result=await encryptState(state,pass,salt);localStorage.setItem(VAULT_KEY,JSON.stringify(result));return result;}
export async function loadVault(pass){const source=localStorage.getItem(VAULT_KEY);if(!source)throw new Error('לא נמצא כספת בדפדפן');return decryptState(JSON.parse(source),pass);}
export function exportVault(){const raw=localStorage.getItem(VAULT_KEY);if(!raw)throw Error('אין כספת לייצוא');return raw;}
