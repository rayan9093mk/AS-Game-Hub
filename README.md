# AS Game Hub — Website + Windows Release

## الفكرة
- `site/` = موقع التحميل.
- `app/` = تطبيق Electron نفسه.
- GitHub Actions يبني نسخة Windows تلقائياً إلى ملف `.exe` عند إنشاء Tag مثل `v1.0.0`.

## مهم
المتصفح لا يستطيع تشغيل تطبيق EXE على جهاز الزائر مباشرة. الموقع يستضيف التحميل فقط؛ بعد تنزيل EXE يشغله المستخدم على Windows.

### النشر
1. ارفع المشروع إلى GitHub.
2. استبدل `YOUR-USERNAME/YOUR-REPO` داخل `site/index.html` برابط مستودعك.
3. أنشئ Release/Tag مثل `v1.0.0`.
4. GitHub Actions سيبني ملف EXE ويرفعه مع الـRelease.
5. رابط التحميل في الموقع يفتح أحدث Release.
