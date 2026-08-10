/*
 * يقرا رسالة عادية في تيليغرام ويخرّج منها منتج.
 *
 * الغرض: التاجر ما يحفظش صيغة أمر. يكتب كيما يهدر —
 *
 *     عندي 9 طوق تتبّع qiti، زيد المنتج والفئة
 *     add Toji outfit 4500 da x10 cost 2200
 *
 * — والبوت يفهم. الأمر /newproduct يبقى للّي يحبّ الصيغة المضبوطة.
 *
 * ⚠️ هذا تخمين، ماشي فهم. علاش ما نكتبوش المنتج مباشرة: الويبهوك يوري
 * للتاجر واش فهم (الاسم، السومة، الكمية، الفئة) ويستنّى نقرة تأكيد.
 * تخمين ظاهر يتصحّح بنقرة خير من كتابة صامتة غالطة في الكاتالوغ.
 *
 * ⚠️ وعلاش لازم كلمة نيّة صريحة (زيد / add / منتج جديد): البوت يعيش في
 * گروب فيه رسائل الطلبات والهدرة العادية. بلا بوّابة، أي رسالة فيها رقم
 * تولّي محاولة إنشاء منتج.
 */

/* الأرقام العربية-الهندية (٠١٢…) يكتبوها كيبوردات الأندرويد بالعربية —
   بلا هذا التحويل، "٩ قطع" ما تتقراش وتبقى في الاسم */
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toLatinDigits = (text) =>
  text.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));

/* كلمات النيّة — وحدة منهم لازم تكون في الرسالة */
const INTENT = /(?:\badd\b|\bnew\s+product\b|\bcreate\b|زيد|زيّد|أضف|اضف|منتج\s*جديد|سلعة\s*جديدة)/iu;

/* "زيد 10" على منتج موجود = تزويد مخزون، ماشي منتج جديد. الأمر /restock
   هو اللي يخصّها، فنخرجو ونخلّيو التاجر يستعملو بدل ما نصنعو منتج ثاني
   بنفس الاسم. */
const RESTOCK_HINT = /(?:\brestock\b|\brefill\b|زوّد|زود\s+المخزون|رجّع\s+المخزون)/iu;

/* كل قاعدة تاخذ أوّل تطابق وتحيّد النص المستهلك.
   الترتيب داخل كل خانة: المعنون ("qty 5") قبل اللاحقة ("5 pcs"). وكل
   لاحقة تسمح بفراغ واحد برك — `\s*` تسمح للقاعدة تقفز فوق نص تحيّد من
   قبل وتلقّط رقم من بلاصة أخرى ("Note 13 … qty" تعطي 13). */
const RULES = {
  cost: [
    /(?:cost|bought(?:\s+(?:at|for))?|paid|تكلفة|شريت(?:ها|و|هم)?\s*ب?|جبت(?:ها|و|هم)?\s*ب?)\s*[:=]?\s*(\d+)/iu,
  ],
  price: [
    /(?:price|sell(?:ing)?(?:\s+(?:at|for))?|سومة|السومة|نبيع(?:ها|و)?\s*ب)\s*[:=]?\s*(\d+)/iu,
    /(\d+)\s?(?:da|dzd|دج|دينار)(?![\p{L}\d])/iu,
    /(?<![\p{L}\d])ب\s?(\d+)/u,
    /* "b 4500" — نفس "بـ" مكتوبة بحروف لاتينية، تتكتب بزاف في الشات */
    /(?<![\p{L}\d])b\s?(\d{2,7})(?![\p{L}\d])/iu,
  ],
  qty: [
    /(?:qty|quantity|كمية|الكمية)\s*[:=]?\s*(\d+)/iu,
    /(\d+)\s?(?:qty|pcs|pieces?|units?|قطعة|قطع|وحدة|وحدات|حبة|حبات)(?![\p{L}\d])/iu,
    /(?:we\s+have|i\s+have|got|عندي|جاتني|وصلاتني|وصلوني)\s+(\d+)/iu,
    /(?<![\p{L}\d])x\s?(\d+)(?![\p{L}\d])/iu,
  ],
};

/* الفاصل بين الكلمة والقيمة لازم يكون صريح (نقطتين ولا فراغ) — بلاه
   "category" في آخر جملة ("add the product and the category") يتقسم
   على "cat" + "egory" وتولّي الفئة اسمها egory */
const CATEGORY_RULE = /(?:\bcategory\b|\bcat\b|الفئة|فئة)(?:\s*[:=]\s*|\s+)([\p{L}][\p{L}\d _-]{0,40})/iu;

/*
 * حشو يتحيّد من الاسم بعد ما ناخذو الأرقام. ما نحيّدوش أي كلمة فيها
 * معنى للمنتج — "collar" و"طوق" يبقاو، "the" و"المنتج" يطيحو.
 */
const FILLER = [
  /\b(?:please|pls|now|also|too)\b/giu,
  /\b(?:add|create|new|product|item|and|the|a|an|of|to|for|with|we|i|have|has|got|in|category|cat|qty|quantity|price|cost|da|dzd)\b/giu,
  /(?:زيد|زيّد|أضف|اضف|المنتج|منتج|جديد|جديدة|سلعة|والفئة|الفئة|فئة|الكمية|كمية|السومة|سومة|تكلفة|عندي|جاتني|وصلاتني|وصلوني|من فضلك|رجاء|دج|دينار)/gu,
];

/* الترقيم اللي يفصل الحقول في هدرة عادية — تبقى منّو الشرطة الوسط
   الاسم (USB-C). § هي علامة "هنا كان رقم تحيّد" (شوف strike) */
const PUNCT = /[،,;:|.!؟?§]+/gu;

/*
 * القيمة اللي تلقّطناها تتبدّل بـ § ماشي بفراغ.
 *
 * ⚠️ بفراغ، القاعدة اللي بعدها تقدر تقفز فوق الفراغ الفارغ وتلقّط رقم
 * من كلمة أخرى: "Redmi Note 13 34000 da qty 5" كانت تعطي الكمية 13
 * (السومة تحيّدت، وبقى "13   qty" متلاصقين في نظر `\s*`).
 */
const strike = (text, span) => text.replace(span, '§');

function pick(text, rules) {
  for (const rule of rules) {
    const match = text.match(rule);
    if (!match) continue;
    const value = parseInt(match[1], 10);
    if (!Number.isFinite(value)) continue;
    return { value, span: match[0] };
  }
  return null;
}

const cleanName = (text) => {
  let name = text;
  for (const rule of FILLER) name = name.replace(rule, ' ');
  return name.replace(PUNCT, ' ').replace(/\s+/gu, ' ').trim();
};

/**
 * يرجّع { name, price, qty, cost, category, guessedPrice } ولا null.
 *
 * `guessedPrice` تقول بلي السومة جات من رقم مجرّد بلا وحدة — الويبهوك
 * يعلّمها في رسالة التأكيد باش التاجر يعرف وين يقلّب قبل ما ينقر.
 */
export function parseProductIntent(rawText) {
  const original = String(rawText ?? '').trim();
  if (!original || original.startsWith('/')) return null;
  if (!INTENT.test(original)) return null;
  if (RESTOCK_HINT.test(original)) return null;

  let text = toLatinDigits(original);

  const category = text.match(CATEGORY_RULE);
  if (category) text = strike(text, category[0]);

  const found = {};
  let guessedPrice = false;

  for (const field of ['cost', 'price', 'qty']) {
    const hit = pick(text, RULES[field]);
    if (!hit) continue;
    found[field] = hit.value;
    text = strike(text, hit.span);
  }

  /*
   * سومة بلا وحدة: "زيد طقم توجي 4500". ناخذوها غير إذا ما لقيناش
   * سومة معنونة، وغير إذا كانت ≥ 100 — الأرقام الصغيرة في أسماء
   * المنتجات ("Redmi Note 13", "iPhone 15") ماشي سوايم، وتحويلها
   * لسومة يخسّر الاسم ويعطي رقم مضحك.
   */
  if (found.price == null) {
    const bare = text.match(/(?<![\p{L}\d-])(\d{3,7})(?![\p{L}\d-])/u);
    if (bare && Number(bare[1]) >= 100) {
      found.price = Number(bare[1]);
      guessedPrice = true;
      text = strike(text, bare[0]);
    }
  }

  const name = cleanName(text);
  if (!name) return null;

  return {
    name,
    price: found.price ?? null,
    qty: found.qty ?? null,
    cost: found.cost ?? null,
    category: category ? category[1].trim() : null,
    guessedPrice,
  };
}
