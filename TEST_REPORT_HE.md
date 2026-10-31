# דוח בדיקות - v5.2

| קבוצת בדיקות | תוצאה בסביבת ההכנה |
|---|---|
| Node unit / auth / parser / crypto | 34 passed, 0 failed |
| Python DOM mock, build mock, server, static | 11 passed, 0 failed |
| Python real Chromium/Tesseract.js integration | 1 skipped: npm runtime missing |
| Tesseract CLI מקומי, תמונה סינתטית באנגלית | תוקף ידנית 3 שורות: META, ASML, CIBR, עם שווי ורווח מדויקים |
| npm run build עם חבילות אמיתיות | לא הורץ: סביבת ההכנה אינה יכולה להגיע ל-npm |
| Cloudflare Access, MFA, domain, TLS | לא הוגדר ולא נבדק בענן |

**חשוב:** בדיקת Tesseract CLI אינה הוכחה ש-Tesseract.js בדפדפן עובד, ובדיקת build עם נכסים מדומים אינה build production. קובצי ה-JavaScript/WASM האמיתיים זמינים רק לאחר `npm install` בסביבת בנייה המחוברת לאינטרנט.

## בדיקות release אוטומטיות שנוספו

- `npm run test:ocr-live` מפעיל Tesseract.js מקומי עם מודלי `heb+eng` ותמונת ברוקר סינתטית, ומשווה שלושה ניירות ומחירים בדיוק.
- `python -m pytest tests/test_ocr_browser_live.py` מפעיל Chromium ב-390px, סורק PNG באמצעות WASM אמיתי ומוודא שלא נשלח גוף בקשת HTTP ושאין קריאות לכתובות חיצוניות.
- GitHub Actions (`.github/workflows/verify.yml`) מריץ את שתי הבדיקות אחרי התקנת npm ו-Chromium, בנוסף לבדיקות היחידה וה-build. **יש להפעיל בפועל את ה-CI ולראות PASS לפני פריסה**.
- `python scripts/verify_protection.py https://YOUR-ORIGIN` בודק שללא אימות לא ניתן להוריד קבצי אפליקציה.

## Acceptance criteria שלא נסגרו

1. PASS של CI מול runtime אמיתי.
2. בדיקת צילום מסך מייצג (עם פרטים אישיים מושחרים) במכשיר אנדרואיד, כולל RTL ומטבע.
3. בדיקה חיה של כניסה באימייל המורשה עם MFA, חסימת אימייל אחר ובקשות אנונימיות לכל הדומיינים.
