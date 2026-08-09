/*
 * يبذر منتجات تجريبية واقعية فالـ Netlify Blobs الحي (production) —
 * باش يكون عندنا كاتالوغ يبان حقيقي وقت الديمو، بلا ما نكتبو كل منتج
 * يدويًا من اللوحة.
 *
 * ⚠️ هذا السكريبت يكتب مباشرة فالـ Blobs الحقيقي تاع production —
 * ماشي sandbox محلّي. بلا `--live` يخدم dry-run برك: يطبع الخطة
 * (شنو غادي يتزاد) وما يمسّش ولا يقرا حتى بلوب. لازم تبعث `--live`
 * بالصريح باش يكتب فعلاً — حماية من "ركضتو بالغلط".
 *
 * ── كيفاش تجيب الكريدنسيال ──────────────────────────────────────────
 *   NETLIFY_SITE_ID    → Netlify → Site configuration → Site information → Site ID
 *   NETLIFY_AUTH_TOKEN → User settings → Applications → Personal access tokens
 *
 * ── تشغيل ────────────────────────────────────────────────────────────
 *   NETLIFY_SITE_ID=xxx NETLIFY_AUTH_TOKEN=xxx node scripts/seed-demo-products.mjs --live
 *
 * ⚠️ ما تخدّموهش تحت `netlify dev` ولا `netlify dev:exec`: هذوك يخدمو
 * بـ blobs sandbox محلّي (`.netlify/blobs-serve/`) — السكريبت يبان نجح
 * بصح يكتب فبلاصة ما عندها حتى علاقة بالـ production، وحتى حاجة ما
 * توصل للموقع الحي، بلا حتى خطأ يبان يديك.
 *
 * ── الأمان (create-only) ─────────────────────────────────────────────
 * قبل ما يكتب أي حاجة، يقرا listProducts()/listCategories() مرّة وحدة.
 * سلاق (slug) موجود من قبل = SKIP، ما يبدّلش فيه ولا يلمسو. هذا يخلّي
 * إعادة التشغيل آمنة (idempotent) وما يمحيش تعديلات التاجر اللي دارها
 * من اللوحة بعد البذر.
 */

const STOCK_THRESHOLD = 5;

/* ── الفئات ─────────────────────────────────────────────────────────── */

const CATEGORIES = [
  { name: 'حيوانات أليفة', slug: 'pets', icon: '🐾', sort: 10 },
  { name: 'ملابس', slug: 'clothing', icon: '👕', sort: 20 },
  { name: 'سيارة', slug: 'auto', icon: '🚗', sort: 30 },
  { name: 'تكنولوجيا', slug: 'tech', icon: '🎧', sort: 40 },
  { name: 'الدار والحياة', slug: 'home-life', icon: '🏠', sort: 50 },
];

/* ── المنتجات ───────────────────────────────────────────────────────── */

/*
 * المنتجات بلا `options` تحمل `initialStock` — saveProduct يبذرها
 * وحدو. المنتجات بـ `options` تحمل `variantStock(options)` (وأحيانًا
 * `variantPriceDelta(options)`) — دالة تاخذ كائن الخيارات المختارة
 * لفاريانت وحدة (مثلاً { المقاس:'M', اللون:'أسود' }) وترجع الكمية/الفرق
 * المناسب. ما نحسبوش الـ SKU يدويًا هنا — نخليو saveProduct يبنيه
 * وحدو من بعد نقارنو بالخيارات (شوف createProductWithVariants تحت).
 */
const PRODUCTS = [
  {
    slug: 'dog-harness-leash',
    name: 'حزام مشي للكلاب مع مقود',
    type: 'pet',
    categorySlug: 'pets',
    price: 2900,
    compareAtPrice: 3900,
    unitCost: 1200,
    weightGrams: 350,
    featured: false,
    shortDescription: 'حزام مريح لكلبك مع مقود متين، يخلّي الفسحة سهلة عليك وعليه بلا ما يوجعو.',
    description: [
      'مصنوع من قماش متين يتحمّل الشد، مبطّن من الداخل باش ما يوجعش صدر الكلب.',
      'مقود بطول مناسب يعطيك تحكّم مليح فالفسحة والمشي.',
      'متوفر بثلاثة مقاسات باش يلقى كل كلب اللي يناسبو.',
      'سهل اللبس والنزع بإبزيم سريع.',
    ].join('\n'),
    options: [{ name: 'المقاس', values: ['S', 'M', 'L'] }],
    variantStock: (opts) => ({ S: 12, M: 18, L: 9 }[opts['المقاس']]),
  },
  {
    slug: 'cat-water-fountain',
    name: 'نافورة ماء أوتوماتيكية للقطط',
    type: 'pet',
    categorySlug: 'pets',
    price: 4900,
    compareAtPrice: null,
    unitCost: 2400,
    weightGrams: 900,
    featured: false,
    shortDescription: 'نافورة تخلّي الماء يدور طول الوقت، تشجّع القط يشرب أكثر ويبقى صحي.',
    description: [
      'خزان 2 لتر يكفي لعدّة أيام بلا ما تعاود تعمّرو.',
      'فلتر يصفّي الماء من الشوائب والروائح.',
      'صوت الماء الجاري يشجّع حتى القطط الكسلانة فالشرب.',
      'سهلة التنظيف والفك والتركيب.',
    ].join('\n'),
    options: [],
    initialStock: 14,
  },
  {
    slug: 'heavy-hoodie',
    name: 'هودي قطن ثقيل',
    type: 'clothing',
    categorySlug: 'clothing',
    price: 4500,
    compareAtPrice: 5900,
    unitCost: 2200,
    weightGrams: 700,
    featured: true,
    shortDescription: 'هودي دافي من قطن ثقيل، تلبسو يومياتي فالبرد بلا ما يتسرّع.',
    description: [
      'قماش قطن ثقيل (heavyweight) يدفّي مليح فالشتاء.',
      'قصّة واسعة مريحة تلقى فيها روحك.',
      'جيب أمامي كبير وكبّوت مبطّن.',
      'متوفر بمقاسين وألوان باش تختار اللي يعجبك.',
    ].join('\n'),
    options: [
      { name: 'المقاس', values: ['M', 'L', 'XL'] },
      { name: 'اللون', values: ['أسود', 'رمادي'] },
    ],
    variantStock: () => 8,
    /* XL أغلى بـ 300 دج — قماش أكثر */
    variantPriceDelta: (opts) => (opts['المقاس'] === 'XL' ? 300 : undefined),
  },
  {
    slug: 'car-charger-45w',
    name: 'شاحن سيارة سريع 45W بمنفذين',
    type: 'auto',
    categorySlug: 'auto',
    price: 1900,
    compareAtPrice: 2500,
    unitCost: 700,
    weightGrams: 120,
    featured: false,
    shortDescription: 'شحن سريع لهاتفين فنفس الوقت، يخدم فكل السيارات بمنفذ الولاعة.',
    description: [
      'قوة شحن 45W توصّل للهاتف بسرعة حتى فرحلة قصيرة.',
      'منفذين USB باش يشحنو الراكب والسايق فنفس الوقت.',
      'حماية من السخانة الزايدة وقصر الدارة.',
      'حجم صغير ما ياخذش حتى بلاصة.',
    ].join('\n'),
    options: [],
    initialStock: 40,
  },
  {
    slug: 'tws-earbuds',
    name: 'سمّاعات بلوتوث TWS',
    type: 'tech',
    categorySlug: 'tech',
    price: 3500,
    compareAtPrice: 4500,
    unitCost: 1500,
    weightGrams: 60,
    featured: false,
    shortDescription: 'سماعات لاسلكية خفيفة بصوت واضح وبطارية تكفي نهار كامل مع العلبة.',
    description: [
      'اتصال بلوتوث مستقر بلا انقطاع فالمكالمة ولا الموسيقى.',
      'علبة شحن تعطي شحنات إضافية للسماعات.',
      'مقاومة للعرق باش تلبسها فالرياضة.',
      'متوفرة بلونين أسود وأبيض.',
    ].join('\n'),
    options: [{ name: 'اللون', values: ['أسود', 'أبيض'] }],
    variantStock: (opts) => ({ 'أسود': 15, 'أبيض': 10 }[opts['اللون']]),
  },
  {
    slug: 'handheld-vacuum',
    name: 'مكنسة يدوية لاسلكية',
    type: 'life',
    categorySlug: 'home-life',
    price: 5900,
    compareAtPrice: 7200,
    unitCost: 3100,
    weightGrams: 1400,
    featured: true,
    shortDescription: 'مكنسة خفيفة بلا سلك، تنظّف السيارة والدار بسرعة بلا ما تدور على البريز.',
    description: [
      'بطارية قابلة للشحن تخلّيك تنظّف بلا سلك يعوقك.',
      'شفط قوي يلقط الغبار والشعر بسهولة.',
      'فلتر قابل للغسل يوفّر عليك شرا فلاتر جداد.',
      'خفيفة ومريحة فاليد لمدّة طويلة.',
    ].join('\n'),
    options: [],
    initialStock: 18,
  },
  {
    slug: 'thermo-flask-1l',
    name: 'إبريق حراري ستانلس 1 لتر',
    type: 'life',
    categorySlug: 'home-life',
    price: 2200,
    compareAtPrice: 2800,
    unitCost: 950,
    weightGrams: 480,
    featured: false,
    shortDescription: 'يحافظ على سخانة القهوة ولا الأتاي لساعات طويلة، ستانلس صافي بلا بلاستيك يلامس الشراب.',
    description: [
      'ستانلس ستيل بطبقتين يحافظ على الحرارة والبرودة لساعات.',
      'سعة 1 لتر تكفي طول النهار فالخدمة.',
      'غطاء محكم ما يبانش منّو الماء.',
      'سهل التنظيف وما يبقاش فيه ريحة.',
    ].join('\n'),
    options: [],
    initialStock: 25,
  },
];

/* عمدًا بلا "طوق GPS للقطط" — عندنا منتج حي بنفس الفكرة، ديمو يقلّدو
   يخلّي الاثنين يتخلطو فاللوحة. */

/* ── طباعة الخطة (dry-run) ─────────────────────────────────────────── */

function printPlan() {
  console.log('DRY RUN — ما تبدّلت حتى حاجة. زيد --live باش يكتب فعلاً فـ production.');
  console.log('');
  console.log('الفئات:');
  for (const cat of CATEGORIES) {
    console.log(`  ${cat.icon}  ${cat.slug.padEnd(12)} ${cat.name}`);
  }
  console.log('');
  console.log('المنتجات:');
  for (const def of PRODUCTS) {
    const stockNote = def.options.length
      ? `فاريانتات حسب (${def.options.map((o) => o.name).join(' × ')})`
      : `stock=${def.initialStock}`;
    console.log(`  ${def.slug.padEnd(20)} ${def.name} — ${def.price} دج — ${stockNote}`);
  }
  console.log('');
  console.log('ما نقدروش نشوفو شكون موجود من production من هنا بلا كريدنسيال —');
  console.log('شغّل بـ --live (ومعاه NETLIFY_SITE_ID / NETLIFY_AUTH_TOKEN) باش تشوف CREATE/SKIP الحقيقيين.');
}

/* ── منطق الكتابة (يخدم غير --live) ────────────────────────────────── */

/**
 * يحفظ منتج بفاريانتات: نحفظو مرّة أولى باش نعرفو الـ SKU الحقيقي اللي
 * saveProduct بناه، من بعد (إذا كان تصحيح سومة لازم) نحفظو ثانية بالـ
 * SKU الصحيح. هذا أضمن من نحسبو الـ SKU يدويًا ونخاطرو بغلطة تصادف.
 */
async function createProductWithVariants(def, categoryId, { saveProduct, setVariantStock }) {
  const baseInput = {
    slug: def.slug,
    name: def.name,
    shortDescription: def.shortDescription,
    description: def.description,
    type: def.type,
    categoryId,
    price: def.price,
    compareAtPrice: def.compareAtPrice ?? null,
    unitCost: def.unitCost,
    options: def.options,
    media: [],
    defaultStockThreshold: STOCK_THRESHOLD,
    shipping: { weightGrams: def.weightGrams },
    status: 'active',
    featured: !!def.featured,
    seo: {},
  };

  if (!def.options.length) {
    baseInput.initialStock = def.initialStock ?? 0;
    return saveProduct(baseInput);
  }

  let record = await saveProduct(baseInput);

  if (def.variantPriceDelta) {
    const variants = record.variants
      .map((v) => {
        const delta = def.variantPriceDelta(v.options);
        return delta != null ? { sku: v.sku, priceDelta: delta } : null;
      })
      .filter(Boolean);
    if (variants.length) {
      record = await saveProduct({ id: record.id, slug: record.slug, variants });
    }
  }

  for (const variant of record.variants) {
    const qty = def.variantStock(variant.options);
    await setVariantStock(record.id, variant.sku, qty, STOCK_THRESHOLD);
  }

  return record;
}

async function run({ saveProduct, saveCategory, listProducts, listCategories, setVariantStock }) {
  const existingProducts = await listProducts();
  const existingCategories = await listCategories();
  const productSlugs = new Set(existingProducts.map((p) => p.slug));
  const categoryBySlug = new Map(existingCategories.map((c) => [c.slug, c]));

  let catCreated = 0;
  let catSkipped = 0;
  for (const cat of CATEGORIES) {
    if (categoryBySlug.has(cat.slug)) {
      console.log(`SKIP ${cat.slug} (already exists)`);
      catSkipped++;
      continue;
    }
    const record = await saveCategory({
      name: cat.name, slug: cat.slug, icon: cat.icon, sort: cat.sort, tagline: null,
    });
    categoryBySlug.set(cat.slug, record);
    console.log(`CREATE ${cat.slug}`);
    catCreated++;
  }

  let prodCreated = 0;
  let prodSkipped = 0;
  for (const def of PRODUCTS) {
    if (productSlugs.has(def.slug)) {
      console.log(`SKIP ${def.slug} (already exists)`);
      prodSkipped++;
      continue;
    }
    const category = categoryBySlug.get(def.categorySlug);
    await createProductWithVariants(def, category ? category.id : null, { saveProduct, setVariantStock });
    console.log(`CREATE ${def.slug}`);
    prodCreated++;
  }

  console.log('');
  console.log(`الفئات: ${catCreated} جداد، ${catSkipped} SKIP.`);
  console.log(`المنتجات: ${prodCreated} جداد، ${prodSkipped} SKIP.`);
  if (prodCreated) {
    console.log(`تذكّر: زيد صور حقيقية من مكتبة الميديا فاللوحة قبل ما تعتبر هاذو المنتجات جاهزين للإطلاق.`);
  }
}

/* ── نقطة الدخول ────────────────────────────────────────────────────── */

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
const isLive = process.argv.includes('--live');

if (isLive) {
  if (!siteID || !token) {
    console.error('Missing NETLIFY_SITE_ID / NETLIFY_AUTH_TOKEN — see header comment for how to get them.');
    process.exit(1);
  }
  /* لازم نحطّو هذا قبل import.mjs تاع catalog.mjs — واردة الاتصال
     تتقرا وقت getStore() (call-time) ماشي وقت الاستيراد، بصح نحطّوه
     هنا باش نبقاو مطابقين للعقد بالضبط ونتفاداو أي فرضية غالطة. */
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ siteID, token })).toString('base64');
}

const { saveProduct, saveCategory, listProducts, listCategories, setVariantStock } =
  await import('../netlify/lib/catalog.mjs');

if (!isLive) {
  printPlan();
  process.exit(0);
}

try {
  await run({ saveProduct, saveCategory, listProducts, listCategories, setVariantStock });
} catch (err) {
  console.error('فشل البذر:', err);
  process.exit(1);
}
