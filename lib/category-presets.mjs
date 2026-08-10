/*
 * فئات جاهزة — تصنيفة مكتوبة مرّة وحدة، يقراوها الزوج: اللوحة (زر
 * "زيد من الجاهز") وتيليغرام (كي /newproduct يلقى فئة ما كاينةش).
 *
 * ⚠️ علاش موديول منفصل وماشي مصفوفة في كل بلاصة: لو كتبناها زوج مرّات،
 * فئة تتزاد من تيليغرام تولّي بلون وإيموجي مختلفين على اللي تتزاد من
 * اللوحة — نفس الاسم، شكلين. الفئة يشوفها الزبون في المتجر، فالفرق
 * يبان لبرّا ماشي غير لينا.
 *
 * ⚠️ lib/ ما يتنشرش (شوف scripts/build.mjs) — اللوحة ما تقدرش
 * تستوردو مباشرة. توصلها عبر أكشن `categories.presets`.
 *
 * كل مدخلة:
 *   slug/name/tagline  — يتكتبو كيما هوما في الفئة
 *   emoji              — الشكل تاع البطاقة في اللوحة
 *   color              — لون الفئة (hex). يخدم كخلفية هادية للإيموجي.
 *   type               — نوع المنتج الافتراضي (شوف PRODUCT_TYPES)
 *   keywords           — كلمات نلوّحو بيها على اسم المنتج في تيليغرام
 *                        باش نخمّنو الفئة. عربية وإنجليزية بالزوج،
 *                        على خاطر التاجر يكتب بالثنين.
 */

export const CATEGORY_PRESETS = [
  {
    slug: 'tracking',
    name: 'تتبّع وأمان',
    tagline: 'تعرف وين راهم ديما — أطواق GPS ومتعقّبات',
    emoji: '📍',
    color: '#FF6B2C',
    type: 'tech',
    keywords: ['tracking', 'tracker', 'gps', 'collar', 'قوق', 'طوق', 'تتبع', 'تعقب', 'جي بي اس'],
  },
  {
    slug: 'pets',
    name: 'حيوانات أليفة',
    tagline: 'كل ما يحتاجو صاحبك الصغير',
    emoji: '🐾',
    color: '#16A34A',
    type: 'pet',
    keywords: ['pet', 'dog', 'cat', 'leash', 'harness', 'كلب', 'قط', 'حيوان', 'حزام', 'مقود'],
  },
  {
    slug: 'tech',
    name: 'إلكترونيات وصوتيات',
    tagline: 'سمّاعات، شواحن، وكل ما يخدم مع التيليفون',
    emoji: '🎧',
    color: '#6366F1',
    type: 'tech',
    keywords: ['tech', 'headphone', 'earbuds', 'charger', 'cable', 'watch', 'سماعة', 'شاحن', 'ساعة', 'كابل'],
  },
  {
    slug: 'auto',
    name: 'سيارة',
    tagline: 'إكسسوارات ومعدّات للطريق',
    emoji: '🚗',
    color: '#0EA5E9',
    type: 'auto',
    keywords: ['car', 'auto', 'dashcam', 'tire', 'سيارة', 'طوموبيل', 'كاميرا الطريق'],
  },
  {
    slug: 'clothing',
    name: 'ملابس ومودة',
    tagline: 'قياسات وألوان لكل ذوق',
    emoji: '👕',
    color: '#EC4899',
    type: 'clothing',
    keywords: ['shirt', 'tshirt', 't-shirt', 'tee', 'hoodie', 'jacket', 'shoes', 'pants',
      'trousers', 'outfit', 'cap', 'ملابس', 'قميص', 'سروال', 'صباط', 'فيست', 'طقم', 'تيشيرت', 'كاسكيط'],
  },
  {
    slug: 'home-life',
    name: 'الدار والمطبخ',
    tagline: 'حوايج تسهّل نهارك في الدار',
    emoji: '🏠',
    color: '#A855F7',
    type: 'life',
    keywords: ['home', 'kitchen', 'lamp', 'storage', 'دار', 'مطبخ', 'ضوء', 'تنظيم'],
  },
  {
    slug: 'sport',
    name: 'رياضة ولياقة',
    tagline: 'معدّات للتمرين في الدار ولا في القاعة',
    emoji: '🏋️',
    color: '#EF4444',
    type: 'life',
    keywords: ['sport', 'fitness', 'gym', 'yoga', 'رياضة', 'تمرين', 'لياقة'],
  },
  {
    slug: 'beauty',
    name: 'صحّة وجمال',
    tagline: 'العناية اليومية بالبشرة والشعر',
    emoji: '💄',
    color: '#F43F5E',
    type: 'life',
    keywords: ['beauty', 'skin', 'hair', 'care', 'جمال', 'بشرة', 'شعر', 'عناية'],
  },
  {
    slug: 'kids',
    name: 'صغار ورضّع',
    tagline: 'لعب وحوايج آمنة للدراري',
    emoji: '🧸',
    color: '#EAB308',
    type: 'life',
    keywords: ['kid', 'baby', 'toy', 'دراري', 'رضيع', 'لعبة', 'صغار'],
  },
  {
    slug: 'tools',
    name: 'أدوات وإضاءة',
    tagline: 'عدّة، بطاريات، وضوء كي تحتاجو',
    emoji: '🔦',
    color: '#64748B',
    type: 'life',
    keywords: ['tool', 'torch', 'flashlight', 'battery', 'عدة', 'أدوات', 'مصباح', 'بطارية'],
  },
];

/* الترتيب في المتجر يتبع ترتيب اللائحة هنا — بخطوات 10 باش التاجر
   يقدر يدخّل فئة تاعو بين ثنتين بلا ما يعاود يرقّم كلش */
export const presetSort = (index) => (index + 1) * 10;

const norm = (value) => String(value ?? '').toLowerCase();

/**
 * يخمّن الفئة من اسم المنتج. يرجع المدخلة ولا null.
 *
 * ⚠️ التخمين ماشي ذكاء — مطابقة كلمات برك. علاش يكفي: التاجر يشوف
 * الفئة مكتوبة في جواب البوت، فإذا خمّنّا غالط يبان فوراً ويقدر يبدّلها
 * من اللوحة. تخمين ظاهر أحسن من "بلا فئة" صامتة.
 */
export function guessPreset(productName) {
  const haystack = norm(productName);
  if (!haystack) return null;
  for (const preset of CATEGORY_PRESETS) {
    if (preset.keywords.some((word) => haystack.includes(norm(word)))) return preset;
  }
  return null;
}

/** يلقى مدخلة بالسلاق ولا بالاسم (بلا حساسية لحالة الحروف) */
export function findPreset(needle) {
  const wanted = norm(needle).trim();
  if (!wanted) return null;
  return CATEGORY_PRESETS.find(
    (preset) => norm(preset.slug) === wanted || norm(preset.name) === wanted,
  ) ?? null;
}
