# تالياني كوفير — Taliani Coiffeur

تطبيق ويب متكامل (Full-Stack) مصمم للهواتف أولاً (Mobile-First) لإدارة **حجز مواعيد وطابور صالون الحلاقة** (Barbershop Booking & Smart Queue) — جاهز للإنتاج.

- **واجهة التطبيق باللغة العربية بالكامل** (اتجاه RTL، سمة داكنة مع لمسات ذهبية، خط Cairo)، وقابل للتثبيت كتطبيق PWA.
- **الزبائن**: تسجيل دخول عبر جوجل (أو الحجز كضيف)، اختيار الخدمة والتاريخ والوقت، متابعة ترتيبهم في الطابور مباشرة، واستقبال إشعارات داخل التطبيق + إشعارات Push عند قبول الحجز أو رفضه أو تعديل وقته من طرف الحلاق.
- **الحلاق (المالك)**: لوحة تحكم محمية بمفاتيح خاصة — مفتاح فتح/إغلاق المحل، طلبات الحجز، طابور حي بأوقات **حقيقية**، إدارة الفراغات والتأخير، تقويم بالمواعيد الحرّة والمحجوبة، الخدمات، أوقات العمل، الزبائن، إحصائيات، ورسائل **واتساب جاهزة** بضغطة واحدة.

> الكود والتعليقات والبنية التقنية باللغة الإنجليزية. كل نصوص الواجهة العربية موجودة في ملف واحد:
> [`src/i18n/ar.js`](src/i18n/ar.js).

---

## جدول المحتويات

1. [التقنيات المستخدمة](#1-التقنيات-المستخدمة)
2. [بنية المشروع](#2-بنية-المشروع)
3. [التشغيل المحلي (تطوير)](#3-التشغيل-المحلي-تطوير)
4. [إعداد Firebase خطوة بخطوة](#4-إعداد-firebase-خطوة-بخطوة)
5. [الإشعارات الفورية بدون Cloud Functions](#5-الإشعارات-الفورية-بدون-cloud-functions)
6. [رفع المشروع إلى GitHub](#6-رفع-المشروع-إلى-github)
7. [نشر الواجهة على Cloudflare Pages](#7-نشر-الواجهة-على-cloudflare-pages)
8. [إضافة نطاق Cloudflare إلى Firebase (مهم جداً!)](#8-إضافة-نطاق-cloudflare-إلى-firebase-مهم-جدا)
9. [التحقق من صلاحية المالك وقواعد الأمان](#9-التحقق-من-صلاحية-المالك-وقواعد-الأمان)
10. [نطاق مخصص وتحديثات المستقبل](#10-نطاق-مخصص-وتحديثات-المستقبل)
11. [نموذج البيانات](#11-نموذج-البيانات)
12. [نظرة عامة على قواعد الأمان](#12-نظرة-عامة-على-قواعد-الأمان)
13. [كيف يعمل الطابور الذكي](#13-كيف-يعمل-الطابور-الذكي)
14. [تعديل النصوص العربية وقوالب الواتساب](#14-تعديل-النصوص-العربية-وقوالب-الواتساب)
15. [ملاحظات PWA](#15-ملاحظات-pwa)
16. [استكشاف الأخطاء وإصلاحها](#16-استكشاف-الأخطاء-وإصلاحها)

---

## 1. التقنيات المستخدمة

| الطبقة | التقنية |
|--------|---------|
| الواجهة | React 18 + Vite 5 + Tailwind CSS 3 (RTL، خط Cairo) |
| قاعدة البيانات | Cloud Firestore (تحديث لحظي عبر المستمعين) |
| تسجيل الدخول | Firebase Authentication — Google Sign-In (+ حجز كضيف) |
| الإشعارات | Firebase Cloud Messaging + **دالة Cloudflare Pages** (`/api/send-push`) |
| الاستضافة | Cloudflare Pages (ملفات ثابتة + دالة سيرفرلس) |
| الكود | GitHub (كل دفع = إعادة نشر تلقائية) |
| الخطة المجانية | ✅ كل شيء يعمل على خطة Firebase **Spark** المجانية (بدون Cloud Functions) |

## 2. بنية المشروع

```
├── public/                       # ملفات ثابتة تُخدم من جذر الموقع
│   ├── _redirects                # توجيه مسارات SPA في Cloudflare Pages
│   ├── _headers                  # ترويسات أمان (CSP لـ Firebase وGoogle)
│   ├── manifest.json             # ملف PWA (عربي، RTL)
│   ├── icons/                    # أيقونات التطبيق (SVG + نسخة Maskable)
│   └── firebase-messaging-sw.js  # يُولَّد عند البناء — لا تعدلده
├── scripts/
│   ├── generate-sw.js            # يحقن إعدادات Firebase العامة داخل ملف الـ SW
│   └── firebase-messaging-sw.template.js
├── functions/api/send-push.js    # دالة Cloudflare Pages (FCM HTTP v1)
├── src/
│   ├── i18n/ar.js                # ← كل النصوص العربية للواجهة هنا
│   ├── config/firebase.js        # تهيئة Firebase من متغيرات VITE_*
│   ├── context/                  # Auth / Settings / Toast / Notifications
│   ├── services/                 # عمليات Firestore (حجوزات، إجراءات، push…)
│   ├── hooks/                    # useCollection، useServices، useQueueSync…
│   ├── utils/                    # datetime، phone، slots، queue، whatsapp…
│   ├── components/               # عناصر الواجهة المشتركة ومكونات المالك
│   ├── layouts/                  # ClientLayout وOwnerLayout
│   └── pages/                    # الرئيسية، الحجز، حجوزاتي، صفحات المالك/*
├── firebase.json                 # إعدادات Firebase CLI
├── .firebaserc                   # معرّف مشروع Firebase (نموذج أولي)
├── firestore.rules               # قواعد الأمان (بريد المالك يُضبط هنا)
├── firestore.indexes.json        # الفهارس المركبة المستخدمة في الاستعلامات
└── .github/workflows/deploy-firestore.yml   # CI اختياري لقواعد والفهارس
```

## 3. التشغيل المحلي (تطوير)

المتطلبات: **Node.js إصدار 20 أو أحدث** (انظر `.nvmrc`) وnpm.

```bash
# 1. تثبيت الحزم
npm install

# 2. إنشاء ملف البيئة
cp .env.example .env
#    ...ثم املأ قيم Firebase (انظر القسم 4)

# 3. تشغيل خادم التطوير (http://localhost:5173)
npm run dev

# 4. بناء النسخة الإنتاجية -> dist/
npm run build
```

> يشغّل `npm run dev` و`npm run build` تلقائياً السكربت `scripts/generate-sw.js` الذي
> ينشئ `public/firebase-messaging-sw.js` من قيم `.env`. بدون ملف `.env` سيعرض التطبيق
> شاشة عربية واضحة تقول "الإعداد غير مكتمل" بدل أن ينهار.

## 4. إعداد Firebase خطوة بخطوة

1. **إنشاء مشروع**: <https://console.firebase.google.com> → *Add project* (خدمة Analytics اختيارية).
2. **إنشاء قاعدة البيانات**: *Build → Firestore Database → Create database* → الوضع
   **Production** → اختر أقرب منطقة لمستخدميك (مثلاً `europe-west1`).
3. **تفعيل تسجيل دخول جوجل**: *Build → Authentication → Get started → Sign-in method →
   Google → Enable → Save*.
4. **تسجيل تطبيق ويب**: *Project settings (⚙) → General → Your apps → Web (</>) →
   Register app* → انسخ قيم الإعدادات.
5. **إنشاء ملف `.env`** من `.env.example` وصق القيم:

   ```env
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
   VITE_FIREBASE_VAPID_KEY=BB....        # انظر الخطوة 6
   VITE_OWNER_EMAIL=you@gmail.com        # ← بريد الحلاق (المالك)
   ```

6. **مفتاح Web Push (VAPID)**: *Project settings → Cloud Messaging → Web Push certificates →
   Key pair → Generate*. انسخ المفتاح إلى `VITE_FIREBASE_VAPID_KEY`.
7. **ضبط بريد المالك في قواعد الأمان** (لوحة التحكم محمية بالقواعد وليس فقط بالواجهة):
   افتح الملف [`firestore.rules`](firestore.rules) وغيّر السطر:

   ```js
   function ownerEmail() {
     return 'owner@example.com'; // <=== بريد الحلاق، بحروف صغيرة
   }
   ```

8. **نشر القواعد والفهارس** (ثبّت الأداة مرة واحدة):

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add            # اختر مشروعك، الاسم المستعار: default
   # أو عدّل .firebaserc مباشرة:  "default": "your-project-id"
   firebase deploy --only firestore:rules,firestore:indexes
   ```

9. **(اختياري) حساب خدمة للإشعارات** — مطلوب فقط إذا أردت تفعيل الإشعارات الفورية
   (القسم 5): *Project settings → Service accounts → Generate new private key*.
   احفظ ملف JSON في مكان آمن (**غير مسموح برفعه إلى Git**، وهو موجود في `.gitignore`).

## 5. الإشعارات الفورية بدون Cloud Functions

التطبيق مصمم للبقاء على خطة Spark المجانية:

| الملف | الطريقة | التكلفة |
|-------|---------|---------|
| مركز الإشعارات داخل التطبيق (أيقونة الجرس) | مستمعات Firestore اللحظية | مجاني وفوري |
| صوت تنبيه عند وصول طلب جديد | Web Audio داخل لوحة التحكم | مجاني |
| إشعار Push على الجهاز | FCM HTTP v1 عبر دالة Pages `/api/send-push` | مجاني |

آلية العمل:

1. المتصفح يطلب إذن الإشعارات، يسجّل ملف `public/firebase-messaging-sw.js`، ويحفظ رمز
   FCM في `users/{uid}.fcmToken`.
2. كل إجراء من المالك ينشئ إشعاراً داخل التطبيق **ويدعو** `/api/send-push`.
3. الدالة (`functions/api/send-push.js`) تتحقق من رمز Firebase ID الخاص بالمتصل (توقيع
   RS256 عبر Web Crypto مقابل مفاتيح Google الرسمية) وترفض أي بريد غير مطابق لـ
   `OWNER_EMAIL`. ثم توقّع JWT بحساب الخدمة وترسل الرسالة عبر FCM HTTP v1.
   لا تُستخدم سوى واجهات Web القياسية، لذا تعمل الدالة على بيئة Cloudflare Workers
   بدون أي أعلام توافق إضافية.

لتفعيلها، أضف متغيري بيئة في Cloudflare Pages
(*Settings → Environment variables*، انظر القسم 7):

| الاسم | القيمة |
|-------|--------|
| `FIREBASE_SERVICE_ACCOUNT` | **محتوى ملف JSON للخدمة بالكامل** (سطر واحد يكفي) |
| `OWNER_EMAIL` | بريد الحلاق (نفس `VITE_OWNER_EMAIL`) |

> **إذا تخطيت هذه الخطوة لن يتعطل شيء** — يكتشف التطبيق غياب النقطة النهائية ويكمل
> العمل بالإشعارات داخل التطبيق فقط (تظهر رسالة عربية تقول إن الإشعارات الفورية
> غير مفعلة).

## 6. رفع المشروع إلى GitHub

```bash
git init
git add .
git commit -m "Taliani Coiffeur - initial commit"
git branch -M main
git remote add origin https://github.com/<you>/taliani-coiffeur.git
git push -u origin main
```

لا ترفع الأسرار أبداً: ملف `.gitignore` يستبعد بالفعل `.env*` وملفات حساب الخدمة
و`node_modules/` و`dist/` وملف الـ SW المولَّد. الملف الوحيد المرفوع هو `.env.example`
(قيم فارغة).

**CI اختياري**: [`.github/workflows/deploy-firestore.yml`](.github/workflows/deploy-firestore.yml)
تنشر القواعد والفهارس عند تغيير `main`. لتفعيلها أضف سرّين في المستودع
(*Settings → Secrets and variables → Actions*):

- `FIREBASE_TOKEN` — أنشئه بأمر `npx firebase login:ci`
- `FIREBASE_PROJECT_ID` — معرّف مشروع Firebase

## 7. نشر الواجهة على Cloudflare Pages

1. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git** →
   اختر المستودع.
2. إعدادات البناء:

   | الإعداد | القيمة |
   |---------|--------|
   | Framework preset | *Vite* (أو None) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Node version | أضف متغير البيئة `NODE_VERSION = 20` (أو اعتمد على `.nvmrc`) |

3. **متغيرات البيئة** (*Settings → Environment variables*، بيئة Production وPreview):

   | الاسم | القيمة |
   |-------|--------|
   | `VITE_FIREBASE_API_KEY` | … |
   | `VITE_FIREBASE_AUTH_DOMAIN` | … |
   | `VITE_FIREBASE_PROJECT_ID` | … |
   | `VITE_FIREBASE_STORAGE_BUCKET` | … |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | … |
   | `VITE_FIREBASE_APP_ID` | … |
   | `VITE_FIREBASE_VAPID_KEY` | … |
   | `VITE_OWNER_EMAIL` | you@gmail.com |
   | `NODE_VERSION` | 20 |
   | `FIREBASE_SERVICE_ACCOUNT` | *(سرّ، فقط للإشعارات)* محتوى ملف JSON |
   | `OWNER_EMAIL` | *(للإشعارات فقط)* you@gmail.com |

   اجعل `FIREBASE_SERVICE_ACCOUNT` من نوع **Encrypt** (سرّ مشفّر).

4. اضغط Deploy. كل دفع إلى `main` يعيد النشر تلقائياً، والفرعات الأخرى تحصل على روابط
   معاينة.

ملاحظات:

- الملف `public/_redirects` (‏`/* /index.html 200`) يجعل مسارات React Router تعمل عند
  تحديث الصفحة مباشرة.
- الملف `public/_headers` يضيف `X-Content-Type-Options` و`Referrer-Policy`
  و`X-Frame-Options` وسياسة أمان CSP التي تسمح لـ Firebase (`*.googleapis.com`،
  `identitytoolkit`، `securetoken`) وإطارات تسجيل دخول جوجل والخطوط.
- دوال Pages الموجودة في `functions/` تُنشر تلقائياً مع الموقع — لا يحتاج أي إعداد
  إضافي.

## 8. إضافة نطاق Cloudflare إلى Firebase (مهم جداً!)

تسجيل دخول جوجل **يفشل في الإنتاج** ما لم تُضاف النطاقات المسموحة:

1. Firebase Console → *Authentication → Settings → **Authorized domains***.
2. أضف:
   - `your-project.pages.dev`
   - نطاقك المخصص (مثلاً `taliani.example.com`) إن وُجد.
3. أبقِ `localhost` موجوداً (هو موجود افتراضياً) للتطوير المحلي.

## 9. التحقق من صلاحية المالك وقواعد الأمان

بعد أول نشر:

1. افتح الموقع وسجّل الدخول **بحساب المالك في جوجل** (`VITE_OWNER_EMAIL`).
   قائمة الحساب في الترويسة تعرض الآن **لوحة التحكم** → تفتح `/owner`.
2. بدّل مفتاح **فتح المحل / إغلاق المحل** وتأكد أن متصفح آخر (غير مسجّل) يرى شارة
   الحالة تتغير فوراً.
3. سجّل الدخول **بحساب جوجل آخر** (أو افتح `/owner` في نافذة خاصة): يجب أن تظهر
   شاشة "ليس لديك صلاحية"، ويجب أن ترفض Firestore كل استعلامات المالك
   (تحقق من وحدة التحكم في المتصفح برسالة `permission-denied`).
4. أنشئ حجزاً من حساب آخر، ثم اقبله من لوحة التحكم وتأكد أن الزبون استلم الإشعار
   داخل التطبيق.
5. انشر القواعد مرة أخرى بعد أي تعديل:
   `firebase deploy --only firestore:rules,firestore:indexes`.

## 10. نطاق مخصص وتحديثات المستقبل

- **نطاق مخصص**: Cloudflare Pages → *Custom domains → Set up a custom domain* → اتبع
  المعالجة (يدير Cloudflare الـ DNS إذا كان النطاق يستخدم DNS Cloudflare). تذكّر إضافة
  النطاق إلى Firebase *Authorized domains* (القسم 8).
- **تحديث التطبيق**: فقط `git push` → يعيد Cloudflare Pages البناء تلقائياً.
  ملاحظة: قيم `VITE_*` تُدمج في الحزمة وقت البناء، لذا تغيير أي متغير بيئة يتطلب
  **إعادة بناء** (Pages → *Deployments → Retry deployment*).
- **التراجع**: Cloudflare Pages تحتفظ بكل عمليات النشر — استخدم *Deployments → Rollback*.

## 11. نموذج البيانات

| المجموعة | المستند | الحقول |
|----------|---------|--------|
| `users` | `{uid}` | `uid, name, email, phone (+213…) , role ('client'\|'owner'), fcmToken, phoneAsked, createdAt` |
| `services` | auto-id | `name, price (دج), estimatedMinutes, image, active, createdAt` |
| `bookings` | auto-id | `userId (null للضيوف), name, phone, serviceId, serviceName, price, durationMinutes, date (YYYY-MM-DD), scheduledStart, scheduledEnd, expectedStart, expectedEnd, actualStart, actualEnd, status, proposedDate, proposedTime, clientProposedDate, clientProposedTime, barberMessage, notes, source ('online'\|'walk_in'\|'manual'), code, createdAt, updatedAt` |
| `notifications` | auto-id | `userId, bookingId, title, body, read, createdAt` |
| `settings/public` | ثابت | `shopOpen, shopName, phone, address, ownerUid, weeklyHours, breaks, daysOff, blockedSlots, slotInterval, maxAdvanceDays, minLeadMinutes, soundAlerts` |
| `settings/private` | ثابت | `whatsappTemplates { accept, decline, acceptModified, delay }` |
| `dailyQueue/{date}` | ثابت | `date, entries: [{ bookingId, expectedStart, durationMinutes, status }]` — **بدون أسماء أو هواتف**، حتى يرى الزبون ترتيبه دون قراءة حجوزات الآخرين |

**حالات الحجز**: `pending` (قيد الانتظار) ← `accepted` (مقبول) /
`accepted_modified` (مقبول بتعديل الوقت، يحتاج تأكيد الزبون) ← `in_progress` (قيد التنفيذ)
← `completed` (مكتمل)، إضافة إلى `declined` (مرفوض) و`cancelled` (ملغى)
و`no_show` (لم يحضر).

## 12. نظرة عامة على قواعد الأمان

كل شيء مفروص من الخادم في [`firestore.rules`](firestore.rules):

- `isOwner()` = تسجيل دخول **و** `email_verified == true` **و** البريد مطابق لـ
  `ownerEmail()` (عدّله في ملف القواعد).
- **قراءة عامة** فقط لـ: `services` و`settings/public` (أوقات العمل وحالة الفتح) و`dailyQueue`
  الخالية من البيانات الشخصية.
- **الضيوف** يمكنهم إنشاء حجوزات فقط بحالة `pending`، ورقم هاتف جزائري صحيح
  (‏`+213` + 8–9 أرقام)، وتاريخ ووقت صحيحين، و`userId == null`.
- **الزبائن** يقرؤون ويعدّلون مستنداتهم فقط، ويمكنهم فقط الإلغاء أو الرد على تعديل الوقت
  (الانتقالات المسموحة محددة حقل بحقل).
- **منع الحجز المزدوج** مفروض عبر معاملة (Transaction) في
  `src/services/bookings.js` تعيد قراءة اليوم كاملاً وترفض أي تداخل مع حجز نشط؛ والقواعد
  تتحقق أيضاً من كل حقل مكتوب.
- أرقام الهاتف تُتحقق على ثلاث مستويات: الواجهة (`src/utils/phone.js`)، وطبقة الخدمة،
  وتعبير القواعد Regex.

## 13. كيف يعمل الطابور الذكي

1. حجوزات اليوم تُرتب حسب `expectedStart`.
2. **ابدأ الجلسة** تسجّل وقت البدء الحقيقي؛ **أنهِ الجلسة** تسجّل وقت الانتهاء الحقيقي.
3. إذا انتهت الجلسة **قبل وقتها** يظهر شريط أخضر للفراغ مع خيارين:
   - **تقديم الزبون القادم** — تقديم موعد الزبون التالي (بموافقة صريحة من الحلاق؛
     يُشعَر الزبون ولا يُستدعى أبداً قبل أن تنتهي الجلسة السابقة فعلياً)، أو
   - **إضافة زبون في الفراغ** — إضافة زبون عابر في الوقت الحر.
4. إذا تأخرت الجلسة، ينتشر التأخير تلقائياً: كل موعد لاحق يتحرك إلى الخلف
   (`expectedStart/expectedEnd`) — لكن никогда قبل الوقت المحجوز للزبون — ويُشعَر كل
   زبون داخل التطبيق وعبر Push، مع رسالة واتساب جاهزة لكل زبون
   ("موعدك أصبح {new_time}").
5. تسجّل المدد الفعلية وتُعرض كمتوسط لكل خدمة في لوحة التحكم.
6. يحافظ متصفح المالك على تحديث `dailyQueue/{date}` ليشاهد الزبون ترتيبه الحيّ
   (الرقم في الطابور + الوقت المتوقع) في صفحة "حجوزاتي".

## 14. تعديل النصوص العربية وقوالب الواتساب

- **نصوص الواجهة**: عدّل [`src/i18n/ar.js`](src/i18n/ar.js) فقط — التسميات، الرسائل،
  الأخطاء، تنسيق التاريخ، حالات الحجز. أعد البناء وانتهى الأمر.
- **قوالب الواتساب**: في لوحة التحكم ← **الإعدادات**. أربعة قوالب (قبول، رفض، قبول
  بتعديل الوقت، تأخير) مع الرموز
  `{client_name} {service} {date} {time} {new_date} {new_time} {old_time} {shop_name} {price}`،
  ومعاينة مباشرة، وزر *استعادة الافتراضي*. الإرسال يتم عبر الضغط المباشر
  (`https://wa.me/<رقم>?text=…`) — بدون أي واجهة مدفوعة، والحلاق يضغط Send داخل
  الواتساب فقط.

## 15. ملاحظات PWA

- `public/manifest.json` (اسم عربي، RTL، standalone، سمة داكنة) + أيقونات SVG في
  `public/icons/`. لأقصى قابلية للتثبيت على بعض أجهزة أندرويد القديمة يمكنك إضافة
  أيقونات PNG بمقاس 192/512 وذكرها في الـ manifest.
- ملف الـ Service Worker ‏`public/firebase-messaging-sw.js` **يجب أن يكون في جذر الموقع**
  ولا يستطيع قراءة متغيرات Vite، لذا **يُولَّد وقت البناء** بواسطة
  `scripts/generate-sw.js` من `.env` / بيئة بناء Cloudflare. عدّل
  `scripts/firebase-messaging-sw.template.js` بدل الملف المولَّد.
- يعالج الملف رسائل FCM في الخلفية ويوفّر تخزيناً صغيراً (Network-First) ليُحمّل هيكل
  التطبيق دون اتصال.

## 16. استكشاف الأخطاء وإصلاحها

| المشكلة | الحل |
|---------|------|
| نافذة تسجيل دخول جوجل تُغلق فوراً | أضف النطاق إلى Firebase → *Authentication → Settings → Authorized domains* (القسم 8). |
| رسالة `permission-denied` في الكونسول | البريد ليس نفس المذكور في `firestore.rules` / `VITE_OWNER_EMAIL`، أو بريده غير موثّق، أو القواعد لم تُنشر. |
| لوحة التحكم تعرض "ليس لديك صلاحية" للمالك | أعد نشر القواعد؛ تأكد أن البريد في القواعد بحروف صغيرة ومطابق تماماً. |
| شاشة "الإعداد غير مكتمل" | ملف `.env` ناقص أو غير مكتمل، أو لم تُعد البناء بعد تغيير قيم البيئة. |
| لا توجد أوقات متاحة | تحقق من أوقات العمل وأيام الراحة والمواعيد المحجوبة ومفتاح المحل (الحجز في نفس اليوم يتطلب **مفتوح الآن**) وإعداد أقصى مدة للحجز. |
| الإشعارات الفورية لا تصل | اضبط `FIREBASE_SERVICE_ACCOUNT` و`OWNER_EMAIL` في Cloudflare Pages؛ تأكد أن المتصفح منح إذن الإشعارات؛ الإشعارات داخل التطبيق تعمل في كل الأحوال. |
| خطأ Firestore "index required" | انشر الفهارس: `firebase deploy --only firestore:indexes`. |
| أخطاء الـ Service Worker أو FCM في التطوير | الملف المولَّد يحتاج قيم Firebase حقيقية في `.env`؛ الإشعارات تعمل فقط على HTTPS (أو localhost). |

---

### الحقوق

استخدام خاص — © تالياني كوفير.
