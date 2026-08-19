/*
 * إعدادات المحل — الشحن، الرجعة، والإشعارات.
 *
 * ── علاش ماشي في الكود ─────────────────────────────────────────────
 * سومة التوصيل تتبدّل، ونسبة الرجعة يتفاوض عليها التاجر مع الموصّل،
 * وقائمة الإشعارات ذوق شخصي. أي رقم من هاذو مكتوب في الكود معناه
 * `deploy` جديد باش تبدّلو — وفي وسط النهار، هذا ما يصراش.
 *
 * ── الفرق مع التكاليف ──────────────────────────────────────────────
 * `getCosts()` في store.mjs هي أرقام **الربح** (سوما البضاعة،
 * الإعلانات، خسارة الرجعة) وتتبدّل بـ /cost من تيليغرام. هنا إعدادات
 * **التشغيل**: واش نبعثو الطردة وحدها، شحال يخلّص الموصّل على الرجعة،
 * وشكون يتبلّغ. الزوج منفصلين قصداً — واحد يمسّ التاريخ المالي، والآخر
 * يمسّ السلوك من دروك ورايح.
 */
import { getStore } from './blobs.mjs';

const SETTINGS = 'settings';
const KEY = 'shop';

const store = () => getStore(SETTINGS);

/*
 * الأحداث اللي عندها مفتاح إطفاء.
 *
 * ⚠️ اللائحة لازم تكون بالضبط الأحداث اللي `notify.mjs` ينادي بيهم
 * `send({ event })`. كانت فيها أربعة زايدين — `order.new`،
 * `order.confirmed`، `daily.summary` — وحتى واحد ما كان يتفحّص في
 * حتى بلاصة. يعني المشغّل يطفي "إشعار طلب جديد" ويبقى يوصلو: مفتاح
 * يكذب، وهذا أسوأ من مفتاح ما كاينش.
 *
 * ⚠️ رسالة الطلب الجديد روحها (api/order.mjs) ما عندهاش مفتاح بقصد:
 * هي الحدث اللي المحل كامل مبني عليه. اللي يطفيها ما يبقاش عندو محل.
 */
export const NOTIFY_EVENTS = [
  'shipment.created',
  'shipment.delivered',
  'shipment.returned',
  'shipment.cancelled',
  'ecotrack.error',
];

/*
 * الافتراضيات.
 *
 * `returnShipPercent` = 50 معناها الموصّل ياخذ نصف سومة التوصيل على
 * الطردة اللي رجعت. هذا هو المتعارف عليه، بصح يبقى قابل للتبديل: كل
 * موصّل عندو شروطو.
 *
 * `returnIncludesProduct` = false على خاطر السلعة ترجع لليد وتتباع
 * مرّة أخرى — المخزون يرجّعها كي تنقر "استلمت الرجعة". حطّها true غير
 * إذا كانت السلعة ترجع مهرّسة ما تنباعش.
 */
/*
 * `selfDeliveredWilayas` — الولايات اللي توصّل فيها بيدك، بأرقامها.
 *
 * ⚠️ علاش تبدّل معنى زرّ "وصلت": في كل بلاصة أخرى الموصّل هو اللي
 * يقول واش وصل، والزرّ ما يقدرش يسبقو — تنقر "وصلت" على طردة لسّا
 * في الطريق وتكتب بيعة ما صراتش، وتلقاها في مداخيل الشهر. في الولاية
 * اللي توصّل فيها انت، ما كاين حتى موصّل يسأل: انت اللي شفت الزبونة،
 * وكلمتك هي الوحيدة الموجودة.
 *
 * باتنة (5) بالتلقائي. زيد ولاية بـ /settings selfdelivery.
 */
const DEFAULTS = {
  autoShip: true,
  returnShipPercent: 50,
  returnIncludesProduct: false,
  returnExtraCost: 0,
  selfDeliveredWilayas: [5],
  notify: Object.fromEntries(NOTIFY_EVENTS.map((event) => [event, true])),
  updatedAt: null,
};

export async function getSettings() {
  const record = await store().get(KEY, { type: 'json' }).catch(() => null);
  return {
    ...DEFAULTS,
    ...(record ?? {}),
    notify: { ...DEFAULTS.notify, ...(record?.notify ?? {}) },
  };
}

const clampPercent = (value) => Math.min(Math.max(Math.round(Number(value) || 0), 0), 100);

/* أرقام ولايات صالحة برك (1-58)، بلا تكرار ومرتّبة — القائمة تتقرا
   في كل قرار توصيل، فما نخلّوش فيها نص ولا رقم خارج المدى */
const cleanWilayaIds = (value) => [...new Set(
  (Array.isArray(value) ? value : [value])
    .map((one) => Math.round(Number(one)))
    .filter((one) => Number.isFinite(one) && one >= 1 && one <= 58),
)].sort((a, b) => a - b);

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = {
    ...current,
    ...(patch.autoShip === undefined ? {} : { autoShip: Boolean(patch.autoShip) }),
    ...(patch.returnShipPercent === undefined ? {} : { returnShipPercent: clampPercent(patch.returnShipPercent) }),
    ...(patch.returnIncludesProduct === undefined ? {} : { returnIncludesProduct: Boolean(patch.returnIncludesProduct) }),
    ...(patch.returnExtraCost === undefined ? {} : { returnExtraCost: Math.max(0, Math.round(Number(patch.returnExtraCost) || 0)) }),
    ...(patch.selfDeliveredWilayas === undefined
      ? {} : { selfDeliveredWilayas: cleanWilayaIds(patch.selfDeliveredWilayas) }),
    notify: { ...current.notify, ...(patch.notify ?? {}) },
    updatedAt: new Date().toISOString(),
  };

  await store().setJSON(KEY, next);
  return next;
}

/** واش نبعثو إشعار على هاذ الحدث */
export const notifies = (settings, event) => settings?.notify?.[event] !== false;

/**
 * خسارة الرجعة الحقيقية.
 *
 * ⚠️ ماشي رقم واحد: التوصيل تخلّصو مهما كان (الموصّل مشى)، والرجعة
 * تتحسب بنسبة من سومة التوصيل، وتزيد عليهم أي تكلفة ثابتة عندك. سومة
 * السلعة تدخل غير إذا قلتيها انت — عادةً ترجع وتتباع.
 *
 * ⚠️ الإعلان يدخل هنا تاني، وهاذي كانت ناقصة.
 *
 * الطلب اللي وصل كان ينقّص `adsCost`، واللي رجع لا — كأنّ الفلوس
 * اللي خلّصتها في الإعلان باش يجي هاذ الزبون ترجعلك كي يرفض عند
 * الباب. ما ترجعش: تخلّصها على النقرة، ماشي على التوصيل. النتيجة
 * كانت خسارة الرجعة تبان أصغر مما هي — وفي محل نسبة الرجعة فيه 30%،
 * الفرق يبدّل قرار "واش هاذ الولاية تستاهل إعلان".
 */
export function returnLossFor({ shippingFee = 0, outboundCost = 0, goodsCost = 0, adsCost = 0 }, settings) {
  const returnShip = Math.round((shippingFee * (settings?.returnShipPercent ?? 0)) / 100);
  const extra = settings?.returnExtraCost ?? 0;
  const goods = settings?.returnIncludesProduct ? goodsCost : 0;
  const ads = Math.max(0, adsCost);
  return {
    returnShip,
    outbound: outboundCost,
    extra,
    goods,
    ads,
    total: returnShip + outboundCost + extra + goods + ads,
  };
}
