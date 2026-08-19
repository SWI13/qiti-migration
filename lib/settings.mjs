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

export const NOTIFY_EVENTS = [
  'order.new',
  'order.confirmed',
  'shipment.created',
  'shipment.delivered',
  'shipment.returned',
  'shipment.cancelled',
  'ecotrack.error',
  'daily.summary',
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
const DEFAULTS = {
  autoShip: true,
  returnShipPercent: 50,
  returnIncludesProduct: false,
  returnExtraCost: 0,
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

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = {
    ...current,
    ...(patch.autoShip === undefined ? {} : { autoShip: Boolean(patch.autoShip) }),
    ...(patch.returnShipPercent === undefined ? {} : { returnShipPercent: clampPercent(patch.returnShipPercent) }),
    ...(patch.returnIncludesProduct === undefined ? {} : { returnIncludesProduct: Boolean(patch.returnIncludesProduct) }),
    ...(patch.returnExtraCost === undefined ? {} : { returnExtraCost: Math.max(0, Math.round(Number(patch.returnExtraCost) || 0)) }),
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
 */
export function returnLossFor({ shippingFee = 0, outboundCost = 0, goodsCost = 0 }, settings) {
  const returnShip = Math.round((shippingFee * (settings?.returnShipPercent ?? 0)) / 100);
  const extra = settings?.returnExtraCost ?? 0;
  const goods = settings?.returnIncludesProduct ? goodsCost : 0;
  return {
    returnShip,
    outbound: outboundCost,
    extra,
    goods,
    total: returnShip + outboundCost + extra + goods,
  };
}
