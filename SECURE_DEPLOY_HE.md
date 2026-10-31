# Portfolio Compass v5.2 - כניסה עם חשבון אישי והרשאה מאומתת

## מסלול האימות שנבחר

- **Authentication (אימות זהות):** Cloudflare Access עם ספק זהות (IdP) שמבקש **מייל, סיסמה ואימות נוסף**. מומלץ Google עם חשבון אישי קיים או IdP אחר שמאפשר כניסה בסיסמה ו-MFA. המסך של ספק הזהות מוצג לפני הגעת המשתמש לאפליקציה. אין לכתוב בעצמנו טופס סיסמה שמבצע אימות בצד הדפדפן.
- **Authorization (הרשאות):** רק כתובת דוא"ל אחת מדויקת, דרך כלל **Include > Emails > כתובת המייל שלך**. לא משתמשים בכלל Everyone, באישור לכל דומיין, או בהרשמה עצמית.
- **MFA מחייב:** בהגדרות Access יש להפעיל **Independent MFA** עם TOTP (או מגבלה מחמירה מקבילה אצל ספק הזהות). אל תשאיר כניסת One-time PIN כחלופה אם המטרה היא לחייב סיסמה *וגם* גורם שני.
- **שכבת הגנה נוספת בקוד:** כל בקשה (כולל index.html, JS, WASM, קובצי מודלי OCR) עוברת Worker של Cloudflare שדורש Access JWT חתום ותקין, קהל (`AUD`), מנפיק (`iss`), תוקף ו**כתובת מייל מורשית**. אם חסרות הגדרות או האימות נכשל - התשובה 401 ואין הגשת קבצים.
- **שכבה פרטית:** סיסמה נפרדת פותחת את הכספת המקומית במכשיר. סיסמת הכספת אינה סיסמת חשבון Google ואין לשמור אותן זהות.

## למה Workers Static Assets ולא Pages רגיל?

ב-Cloudflare Pages, הגנת Preview אינה מגינה אוטומטית על `project.pages.dev` ועל דומיין מותאם. קיימת סכנת מסלול גישה בלתי מוגן. בחרנו Worker בעל `assets.run_worker_first=true`, שמחייב אימות בכל בקשה ללא יוצאים מהכלל. הפעלת Access על ה-Worker עצמו לכל תעבורה מכסה את כתובותיו. נדרש לבדוק בפועל את כל שמות המארח, במיוחד כתובות Preview ו-`workers.dev`.

## הכנות חשבון

1. חשבון Cloudflare עם Zero Trust פעיל והרשאת פריסת Workers; המערכת עדיין לא נפרסה בשמך.
2. כתובת המייל הפרטית המדויקת שתורשה. **אל תשלח סיסמה, קוד חד-פעמי או קודי גיבוי לצ'אט.**
3. הפעל MFA לספק הזהות שלך, והגדר Cloudflare Independent MFA ב-Access אם נתמך בתוכנית שלך.
4. צור Identity Provider מסוג Google (מסלול Google שאינו מחייב Google Workspace) או IdP אחר. בצע בדיקת התחברות לפני המשך.
5. ב-Zero Trust > Access controls > Applications, הגן על ה-Worker ב-**Production and preview / All traffic**. השתמש במדיניות Allow שמכילה **Emails: one exact email**, ותחת Require בחר את דרישת ה-MFA הרלוונטית; ודא שאין מדיניות Allow, Bypass או Service Auth נוספת שמתירה אחרים.
6. בתצורת ה-Access Application, העתק **Application Audience (AUD) Tag**. בצוות Cloudflare קבל את הדומיין `your-team.cloudflareaccess.com`.

## התקנה ופריסה

הרץ במחשב עם Node.js LTS, בתיקיית הפרויקט:

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run build
npx wrangler login
```

הגדר את שלושת הערכים ב-Cloudflare **כסודות Worker** (לא ב-JavaScript של הדפדפן ולא ב-Git):

```bash
npx wrangler secret put ACCESS_TEAM_DOMAIN
# ערך לדוגמה: your-team.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD
# ערך: Application Audience Tag
npx wrangler secret put ALLOWED_EMAIL
# ערך: כתובת המייל הפרטית המדויקת
```

לאחר שהגדרת הרשאות Cloudflare Access, בצע:

```bash
npx wrangler deploy
```

אם פרסת לפני הגדרת Access או חסרים סודות, המימוש מתוכנן להחזיר 401. **אין לשנות את הקוד כדי לעקוף זאת.** הפעלת Worker בפועל דרך `wrangler` עשויה לדרוש התאמת שם או domain לחשבון שלך.

## בדיקת הרשאה - חובה לפני העלאת צילום אמיתי

1. בחלון גלישה בסתר **שאינו מחובר**, פתח את כתובת האתר. חייב להופיע מסך ההתחברות או 401/403, ולא אפליקציה.
2. נסה להיכנס באמצעות מייל *אחר*. ודא חסימה גם לאחר אימות זהות תקין.
3. היכנס באמצעות המייל המורשה, סיסמה ואימות נוסף, ולאחר מכן פתח כספת עם סיסמה נפרדת.
4. פתח `https://<hostname>/api/session` בחלון מורשה: אמור להחזיר `authenticated:true`. בחלון לא מורשה: אין להחזיר נתוני זהות.
5. לחץ **יציאה מהחשבון**, וודא שלא ניתן לטעון מחדש את התיק בלי התחברות.
6. הפעל בדיקה לא מאומתת על כל host שמשויך ל-Worker (כולל `workers.dev`, custom domain ו-preview). הרץ:

```bash
python scripts/verify_protection.py https://YOUR-WORKER.workers.dev
```

7. פתח DevTools במכשיר: צילום התיק אינו אמור להופיע בבקשות רשת. ה-Worker דוחה POST/PUT/PATCH/DELETE ואין לו נתיב upload.
8. בצע בדיקת סריקה אמיתית של **צילום נטול פרטים מזהים** במכשיר, וודא שמירת אחזקות מוצפנת בלבד. בדיקת OCR חי טרם בוצעה בחבילת המקור עקב היעדר התקנת WASM בסביבה הנוכחית.

## פשרות ומגבלות חשובות

- Google/IdP ו-Cloudflare ייחשפו לפרטי *התחברות* (כגון כתובת מייל, IP וזמן כניסה); **לא אמורים לקבל תמונות** מהאפליקציה. אין טענה לפרטיות מלאה מפני ספק האירוח, שרת פגום או תוכנת דפדפן זדונית.
- אין ניהול סיסמאות חשבון באפליקציה, אין מאגר משתמשים ואין צורך לבצע hashing של סיסמאות באתר. אימות משתמש נעשה ב-IdP מאובטח.
- אין כרגע סנכרון תיק בין מכשירים. המייל המאומת לא פותח כספת ממכשיר אחר; יש להשתמש בגיבוי מוצפן.
- **אין Service Worker** במימוש המאומת. במעבר מאותו Origin שבו הופעלה v5 עם מטמון offline יש למחוק נתוני אתר ומטמונים או, עדיף, לפרוס בדומיין נקי וחדש. אחרת ניתן להמשיך לקבל עותק ישן ממטמון הדפדפן למרות שינויי שרת.
- ללא אינטרנט אי אפשר לרענן הרשאות Access. מנגנון בדיקת session בדפדפן נועל את הכספת אם הבדיקה נכשלת, ולא מוצג עוד כיישום אופליין מלא.
- Cloudflare Access מצריך תצורה חיצונית בפועל; אין דרך להצדיק הצהרת "מוגן לכניסת משתמש אחד" לפני ביצוע בדיקת כניסה וחסימה בענן.

## מקורות רשמיים

- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/
- https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/independent-mfa/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
