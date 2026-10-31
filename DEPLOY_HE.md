# מדריך פריסה

המסלול היחיד הנתמך לפריסה עם מידע אישי הוא **Cloudflare Workers Static Assets + Cloudflare Access + JWT verification בקוד ה-Worker**. אין לפרוס ל-Pages ציבורי או להעתיק HTML ל-host פתוח.

1. הפעל בדיקות ובנה `dist` כמפורט ב-`README_HE.md`.
2. הגדר ספק זהות מאובטח עם סיסמה ו-MFA, ו-Cloudflare Access עם מדיניות Allow למייל המורשה בלבד.
3. הגדר Worker secrets: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAIL`.
4. אמת `assets.run_worker_first=true` ושכל route, כולל workers.dev, custom domain ו-preview, חסום ללא JWT מאומת.
5. פרוס רק לאחר שה-OCR האמיתי עבר, והריץ את `scripts/verify_protection.py` מול כל origin.

**לא בוצעה פריסה בפועל**. הפרטים המלאים: `SECURE_DEPLOY_HE.md`.
