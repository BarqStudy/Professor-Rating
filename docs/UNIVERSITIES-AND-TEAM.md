# الجامعات وفريق مِعيار

تبدأ تجربة الطالب أو الزائر الذي لم يختر جامعة مفعّلة بصفحة الجامعات، بعرض دائري لبطاقات كبيرة تدعم السحب يمينًا ويسارًا والماوس ومفاتيح الأسهم، مع بحث بالاسم والمدينة وفلاتر المناطق. البطاقة الوسطى للاختيار، والضغط على بطاقة جانبية يجلبها إلى الوسط أولًا. لا يرسل السحب طلب إضافة ولا يغيّر الجامعة. تضم القائمة ٢٨ جامعة حكومية، وتحتفظ قاعدة البيانات بمعرّفات الجامعات والكليات السابقة. نجران مفعّلة مبدئيًا، وبقية الجامعات تنتظر تجهيز بياناتها وتفعيلها.

من **لوحة الإدارة ← الجامعات والكليات والتخصصات** يمكن تفعيل الجامعة أو إيقاف إتاحتها. يتحقق الخادم من الحالة عند الاختيار وإرسال تقييم جديد؛ تعديل بيانات المتصفح لا يفتح جامعة غير مفعّلة. اعتماد طلب إضافة جامعة يضيف السجل دون تفعيله تلقائيًا. تظل البيانات والتقييمات القديمة محفوظة.

نموذج الطلب يميّز الجامعة عن الكلية. يطلب اسم الجهة وبريد التواصل، وللكلية يطلب الجامعة التابعة لها. يصل البريد إلى قائمة الطلبات الخاصة بالإدارة ولا يدخل الدليل العام.

## الفريق

من صندوق **فريق مِعيار — السفراء والمساعدون** يحدد الأدمن الدور والبريد والجامعة، ثم الكلية للمساعد. يجب أن يكون صاحب البريد قد دخل بحساب Google مرة واحدة.

- السفير يقترح إضافات وتصحيحات داخل جامعته.
- المساعد يقترح إضافات وتصحيحات داخل كليته فقط؛ لا ينقل دكتورًا أو تخصصًا من كلية أخرى إلى نطاقه.
- المقترحات تبقى للمراجعة، ويُعاد التحقق من التكليف عند الاعتماد. سحب الدور لا يحذف سجل الطلبات.
- تظهر شارات «سفير اسم الجامعة» و«مساعد اسم الكلية»، وللأدمن «مطور المنصة». الشارة لا تمنح صلاحية بحد ذاتها.

## التقييم والخطة

زر تقييم الدكتور المختار في الخطة يستخدم مسار التقييم نفسه ومعرّف الدكتور نفسه في دليل التقييمات، حتى إذا كان من كلية أخرى في الجامعة. تمنع قاعدة البيانات إنشاء تقييم جديد لنفس الدكتور للحساب أو جلسة الزائر مهما اختلفت المادة أو حالة التقييم. تبقى التقييمات التاريخية دون حذف، ويبقى طلب تعديل التقييم المنشور للمراجعة. عند دخول Google من جلسة زائر قائمة، يربط الخادم الهوية المتحققة بالجلسة التي يملك صاحبها رمزها لمنع التكرار بينهما. هذا منع على مستوى الهوية المتاحة، ولا يدّعي التعرف على شخص مجهول أنشأ جلسة جديدة من جهاز آخر.

## بيانات الجامعات والشعارات

أسماء الجامعات ومواضع شعاراتها مستندة إلى [SaudiUniversitiesDirectory-Server](https://github.com/Abdulrahman-AlGhamdi/SaudiUniversitiesDirectory-Server/blob/12f62970f129f3680ba01383480f051169c932bf/data/data.js)، مع توحيد الأسماء العربية والمدن وتصحيح رابط تبوك. ترخيص الدليل الأصلي محفوظ في [licenses/saudi-universities-directory.txt](licenses/saudi-universities-directory.txt). الشعارات علامات لأصحابها وتستخدم للتعريف بالجهات.

شعارات الجامعات الحكومية الـ٢٨ محفوظة محليًا داخل `public/universities`، ولا تعتمد بطاقاتها على روابط صور خارجية. جرى فحص الصور بصريًا للتأكد من أنها شعار الجامعة نفسها، وليست علامة تطبيق أو نادٍ طلابي. يوجد بديل بصري باسم الجامعة إذا تعذر تحميل الملف. لا تُستخدم شعارات مولدة بالذكاء الاصطناعي بدل شعار الجامعة.

| الجامعة | مصدر الشعار المحلي |
| --- | --- |
| جامعة حائل | [المصدر](https://github.com/Ranad77/incident-reporting-system/blob/ae7a8bb92625dfaa147e2de1c834f4d156812819/static/uoh-logo.png) |
| جامعة الإمام محمد بن سعود الإسلامية | [المصدر](https://github.com/Mohamedali654321/Imam-University/blob/3e56f01ec83df761651bfe81c47716336ebe94be/src/assets/images/imam-logo.png) |
| جامعة الملك سعود بن عبدالعزيز للعلوم الصحية | [المصدر](https://github.com/ManalNawar/KSAU-HSEmailTemplate/blob/164e9f158165dacedb76a186e4b21519759ae1ae/images/logo.png) |
| جامعة الملك سعود | [المصدر](https://github.com/zhoudaxia233/UniLogo/blob/d64657c0f29817d8beaaf541104446c54d39c383/images/imgs0617/King%20Saud%20University.png) |
| جامعة المجمعة | [المصدر](https://github.com/yusra-js/CPSU2/blob/de7f6a9a3d601fa4a1154ddd3e4f8fb9ff0897d0/images/uni/majmaah.jpg) |
| جامعة الأميرة نورة بنت عبدالرحمن | [المصدر](https://github.com/yusra-js/CPSU2/blob/de7f6a9a3d601fa4a1154ddd3e4f8fb9ff0897d0/images/uni/nora.jpg) |
| جامعة الأمير سطام بن عبدالعزيز | [المصدر](https://github.com/zhoudaxia233/UniLogo/blob/d64657c0f29817d8beaaf541104446c54d39c383/images/imgs0617/Prince%20Sattam%20Bin%20Abdulaziz%20University.png) |
| جامعة القصيم | [المصدر](https://github.com/coc-it/qu-thesis-template/blob/46bb0ed7f053094a521ce730ff4f04932e2d7b68/figures/samples/qu.png) |
| الجامعة السعودية الإلكترونية | [المصدر](https://github.com/Turki-Faisal-Alotaibi/it353project/blob/9eeeb490a9e2696a838e97a8cca6165df5ac662a/IT353%20Project.docx) |
| جامعة شقراء | [المصدر](https://github.com/ccitsu/cv/blob/2c58df534510b1bc2bc3ccd21bb99f05254ad8d4/assets/img/logo.JPG) |
| جامعة حفر الباطن | [المصدر](https://github.com/yusra-js/CPSU2/blob/de7f6a9a3d601fa4a1154ddd3e4f8fb9ff0897d0/images/uni/hafr.jpg) |
| جامعة الإمام عبدالرحمن بن فيصل | [المصدر](https://github.com/yusra-js/CPSU2/blob/de7f6a9a3d601fa4a1154ddd3e4f8fb9ff0897d0/images/uni/imam.jpg) |
| جامعة الملك فهد للبترول والمعادن | [المصدر](https://github.com/zhoudaxia233/UniLogo/blob/d64657c0f29817d8beaaf541104446c54d39c383/images/imgs0617/King%20Fahd%20University%20of%20Petroleum%20%26%20Minerals.png) |
| جامعة الملك فيصل | [المصدر](https://github.com/yusra-js/CPSU2/blob/de7f6a9a3d601fa4a1154ddd3e4f8fb9ff0897d0/images/uni/uf.jpg) |
| جامعة الجوف | [المصدر](https://github.com/yusra-js/CPSU2/blob/de7f6a9a3d601fa4a1154ddd3e4f8fb9ff0897d0/images/uni/ju.jpg) |
| جامعة الحدود الشمالية | [المصدر](https://github.com/Ayselx17/Historical-Data-of-Northern-Border-University/blob/a2cda0e408ab1287188761cb78e9b2e636467fa4/%D8%B4%D8%B9%D8%A7%D8%B1%20%D8%AC%D8%A7%D9%85%D8%B9%D8%A9%20%D8%A7%D9%84%D8%AD%D8%AF%D9%88%D8%AF%20%D8%A7%D9%84%D8%B4%D9%85%D8%A7%D9%84%D9%8A%D8%A9.jpg) |
| جامعة تبوك | [المصدر](https://github.com/amir58/TabukUniversityApp/blob/09bdb4fa39f8b9ca9a7f484f21b04b7ba57ea19b/app/src/main/ic_launcher-playstore.png) |
| جامعة الباحة | [المصدر](https://github.com/yusra-js/CPSU2/blob/de7f6a9a3d601fa4a1154ddd3e4f8fb9ff0897d0/images/uni/ub.jpg) |
| جامعة بيشة | [المصدر](https://github.com/codracode1010-spec/UniversityBisha/blob/bca4f22448ad1e0cb8885f44ac1d550b929b9ff8/logo/logo.png) |
| جامعة جازان | [المصدر](https://github.com/ifhadii/survey_form_of_JazanU_ui/blob/a7f35f1db25790b04feba54bd5573c3d27608ea8/images/logo-jazan-uni2.png) |
| جامعة الملك خالد | [المصدر](https://github.com/zhoudaxia233/UniLogo/blob/d64657c0f29817d8beaaf541104446c54d39c383/images/imgs0617/King%20Khalid%20University.png) |
| جامعة نجران | [المصدر](https://github.com/Moodyx1234/NUThon/blob/d1c0fdbe2267609ff0c94e23a75b9ec2a9d4f556/assets/images/partner-student-affairs.png) |
| الجامعة الإسلامية | [المصدر](https://github.com/M-DashBoard/Islamic-University/blob/4d49dc8ea4c252d696adea0511ca472ea9ed6a5d/%D8%B4%D8%B9%D8%A7%D8%B1%20%D8%A7%D9%84%D8%AC%D8%A7%D9%85%D8%B9%D8%A9%20%D8%A7%D9%84%D8%A7%D8%B3%D9%84%D8%A7%D9%85%D9%8A%D8%A9.png) |
| جامعة جدة | [المصدر](https://github.com/abdullah0707/Test-University-of-Jeddah/blob/c28894048cd00ca6863c760d647b8b1197d3d1c7/logo.svg) |
| جامعة الملك عبدالعزيز | [المصدر](https://github.com/zhoudaxia233/UniLogo/blob/d64657c0f29817d8beaaf541104446c54d39c383/images/imgs0617/King%20Abdulaziz%20University.png) |
| جامعة طيبة | [المصدر](https://github.com/KhawlahIbrahim/Basmatuna/blob/6c7ff5e926e0dce5e594ca742a8fafca8146d6c7/public/assets/logos/taibah-university-1200.png) |
| جامعة الطائف | [المصدر](https://github.com/zhoudaxia233/UniLogo/blob/d64657c0f29817d8beaaf541104446c54d39c383/images/imgs0617/Taif%20University.png) |
| جامعة أم القرى | [المصدر](https://github.com/dahm-cs/student-grades-system/blob/14bcdd14b025d9014e31e975704da3d6df8432be/src/main/resources/com/example/demo1/Umm_Al-Qura_University_logo.png) |

سجل مصادر الشعارات وبصمات الملفات المضافة: [saudi-university-logo-sources.json](../data/saudi-university-logo-sources.json). يعرض تصميم نجران الجزء الجامعي من شعار عمادة شؤون الطلاب دون سطر الوحدة.

اختبارات الاتصال الخلفي تستعمل PostgreSQL محليًا، واختبارات المتصفح تحاكي API. تم التحقق في المتصفح من فك ترميز الشعارات الـ٢٨ مع حجب مضيفات الصور الخارجية، وفي أحجام الجوال واللوحي والكمبيوتر.

زر «تغيير الجامعة» في أعلى المنصة وفي الإعدادات يفتح صفحة الجامعات الأساسية على المسار `#universities`، دون نافذة منبثقة. تبقى الجامعة الحالية حتى تأكيد الاختيار. زر الرجوع يعيد الطالب إلى صفحته السابقة دون تغيير الجامعة، وإعادة التحميل تبقي صفحة الاختيار مفتوحة.
