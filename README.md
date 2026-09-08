# نظام إدارة مدارس الأحد

نظام ويب لإدارة المخدومين والخدام والحضور والتقييمات والمتابعة، متصل بقاعدة بيانات
Firebase (Firestore) حقيقية، بحيث يشتغل من أي جهاز وأي عدد من المستخدمين في نفس الوقت.

## 1) هيكل المشروع

```
index.html            نقطة الدخول
css/style.css          التنسيقات
js/app.js               منطق النظام كله
js/firebase-config.js   بيانات مشروعك على Firebase (لازم تملأها)
firestore.rules         قواعد أمان قاعدة البيانات
firebase.json            إعدادات Firebase Hosting
```

## 2) ربط المشروع بحساب Firebase بتاعك

1. من [Firebase Console](https://console.firebase.google.com) افتح مشروعك (أو أنشئ مشروع جديد).
2. من القائمة الجانبية: **Build → Authentication** → تبويب **Sign-in method** → فعّل
   **Email/Password**.
3. من القائمة الجانبية: **Build → Firestore Database** → **Create database** → اختر
   وضع **Production mode** وأقرب موقع سيرفر لك.
4. من **⚙ إعدادات المشروع → عام**، انزل لقسم **تطبيقاتك**، واختر أيقونة الويب `</>`
   (لو معندكش تطبيق ويب مربوط لسه، أنشئ واحد بأي اسم).
5. هتظهرلك قيم `firebaseConfig` — انسخها والصقها في ملف
   `js/firebase-config.js` مكان القيم الموجودة.

## 3) إنشاء أول مستخدم (مدير النظام)

النظام ماعندوش شاشة "تسجيل حساب جديد" لأسباب أمنية — الحسابات بتتضاف من الإدارة فقط:

1. من **Authentication → Users → Add user**: أدخل بريدك الإلكتروني وكلمة مرور، واضغط
   إضافة. انسخ الـ **User UID** الظاهر بجانب المستخدم.
2. من **Firestore Database → Start collection**: اسم المجموعة `users`، ومعرّف
   المستند (Document ID) الصقه UID اللي نسخته، وأضف الحقول التالية:
   - `name` (string): اسمك
   - `role` (string): `admin`
   - `email` (string): نفس البريد اللي سجلت بيه
3. احفظ. دلوقتي تقدر تدخل النظام بنفس البريد وكلمة المرور دول.

أي مستخدم تاني (خادم أو مستخدم إداري) هتضيفه بنفس الطريقة، أو من شاشة "المستخدمون
والصلاحيات" جوه النظام نفسه بعد ما تنشئ له حساب Authentication الأول.

## 4) رفع قواعد الأمان (Firestore Rules)

أسهل طريقة: من **Firestore Database → Rules** جوه الـ Console، الصق محتوى ملف
`firestore.rules` مباشرة واضغط **Publish**.

(أو عن طريق Firebase CLI لو مركبها: `firebase deploy --only firestore:rules`)

## 5) رفع المشروع على GitHub

```bash
cd اسم-مجلد-المشروع
git init
git add .
git commit -m "أول نسخة من النظام"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```
(غيّر `USERNAME/REPO_NAME` بمستودعك الفعلي)

> ملحوظة: ملف `js/firebase-config.js` مش سر خطير (مفاتيح Firebase الأمامية دي مصممة
> تتعرض في المتصفح أصلًا)، الحماية الحقيقية موجودة في `firestore.rules`. لكن لو حابب
> تخليه بره الريبو العام لأي سبب، ضيفه في `.gitignore` وارفع نسخة `.example` بدل منه.

## 6) النشر (Firebase Hosting)

لو عندك Firebase CLI مركبة:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # اختر نفس مشروع Firebase، ومجلد public = "."
firebase deploy
```

هيديك رابط جاهز شكله `https://your-project.web.app`.

### نشر تلقائي عند كل push على GitHub (اختياري لكن موصى بيه)
شغّل الأمر ده مرة واحدة وهو هيظبطلك GitHub Action تلقائي:
```bash
firebase init hosting:github
```
هيطلب منك تسجيل دخول GitHub، ويختار المستودع، وبعدها أي `push` على `main` هيبني
وينشر النظام تلقائيًا من غير ما تعمل حاجة يدويًا.

## 7) نموذج بيانات Firestore (للمرجعية)

كل قسم (المخدومين، الخدام، المراحل، الصفوف، الفصول، الحضور، التقييمات، المتابعة،
الأنشطة) عبارة عن مجموعة (Collection) مستقلة في Firestore، وكل سجل بداخلها Document
له معرّف فريد. سجل الحضور مثلًا بيحتوي `memberId` و`classId` و`date` و`present`
بيربطوه بباقي السجلات.

## 8) خطوات التطوير القادمة (مقترحة)

- تضييق صلاحيات الخادم بحيث يشوف فصله بس (حاليًا أي مستخدم مسجل يشوف كل البيانات).
- شاشة لإنشاء حسابات Authentication من داخل النظام نفسه (تحتاج Cloud Function لأن
  الإنشاء المباشر من المتصفح بيسجّل دخول الحساب الجديد بدل المدير).
- رفع الصور (صور المخدومين/الخدام) على Firebase Storage بدل الروابط النصية فقط.
- إشعارات تلقائية (تنبيه غياب متكرر) عبر Cloud Functions.
