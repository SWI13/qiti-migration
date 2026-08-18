/*
 * تسعيرة التوصيل حسب الولاية.
 *
 * الشيء اللي يتفقّد هنا هو الشيء اللي يخسّر فلوس: الصفحة تعرض رقم،
 * السيرفر يحسب رقم آخر، والمُوصّل يجبى ثالث. فكل فحص هنا يقارن الطريق
 * تاع السيرفر بالطريق اللي يمشي للمتصفّح — نفس الملف، نفس الأرقام.
 */
import { readFileSync } from 'node:fs';

const lib = (p) => import(new URL(`../../lib/${p}`, import.meta.url).href);

const {
  RATES, DEFAULT_RATE, rateFor, shippingFee, deskAvailable, rateTable, ratesPayload, ratesScriptTag,
} = await lib('shipping-rates.mjs');
const { WILAYAS, wilayaId } = await lib('wilayas.mjs');
const { totalWith, shippingFeeOf, goodsTotal } = await lib('message.mjs');

const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

console.log('══ الجدول ══');
ok('58 ولاية في الجدول', rateTable().length === 58, String(rateTable().length));
ok('الترتيب = الترقيم الرسمي', rateTable().every((row, i) => row.id === i + 1 && row.name === WILAYAS[i]));
ok('ولاية بلا تسعيرة تاخذ الافتراضية', rateFor('الجزائر').home === (RATES[16]?.home ?? DEFAULT_RATE.home));
ok('اسم ماشي موجود يرجع الافتراضية', rateFor('ولاية ما كاينش') === DEFAULT_RATE);
ok('الرقم والاسم يعطيو نفس السطر', rateFor(31) === rateFor('وهران'));
ok('رقم برّا 1-58 يرجع الافتراضية', rateFor(0) === DEFAULT_RATE && rateFor(99) === DEFAULT_RATE);

console.log('\n══ كل سطر مسجّل معقول ══');
const entries = Object.entries(RATES);
console.log(`  ${entries.length} ولاية عندها تسعيرة خاصة (الباقي على ${DEFAULT_RATE.home}/${DEFAULT_RATE.desk})`);
ok('المفاتيح كلها أرقام ولايات صحيحة',
  entries.every(([id]) => Number(id) >= 1 && Number(id) <= 58),
  entries.filter(([id]) => !(Number(id) >= 1 && Number(id) <= 58)).map(([id]) => id).join(', ') || 'كامل صحاح');
ok('سومة الدار رقم موجب',
  entries.every(([, rate]) => Number.isFinite(rate.home) && rate.home > 0),
  entries.filter(([, rate]) => !(Number.isFinite(rate.home) && rate.home > 0)).map(([id]) => WILAYAS[id - 1]).join(', ') || 'كامل صحاح');
ok('سومة المكتب رقم موجب ولا null',
  entries.every(([, rate]) => rate.desk === null || rate.desk === undefined || (Number.isFinite(rate.desk) && rate.desk > 0)),
  entries.filter(([, rate]) => !(rate.desk == null || (Number.isFinite(rate.desk) && rate.desk > 0))).map(([id]) => WILAYAS[id - 1]).join(', ') || 'كامل صحاح');
/* المكتب أرخص من الدار — إذا العكس، غالب راه غلط نسخ في الجدول */
ok('المكتب ما يكونش أغلى من الدار',
  entries.every(([, rate]) => rate.desk == null || rate.desk <= rate.home),
  entries.filter(([, rate]) => rate.desk != null && rate.desk > rate.home).map(([id]) => WILAYAS[id - 1]).join(', ') || 'كامل صحاح');

console.log('\n══ السومة اللي تتخلّص ══');
ok('desk في ولاية عندها مكتب = سومة المكتب',
  shippingFee('وهران', 'desk') === rateFor('وهران').desk || rateFor('وهران').desk === null);
/* ولاية بلا مكتب: السومة ترجع للدار، ماشي صفر — الطلب يوصل للدار فعلاً */
const noDesk = rateTable().find((row) => row.desk === null);
if (noDesk) {
  ok(`${noDesk.name} بلا مكتب: السومة ترجع للدار`, shippingFee(noDesk.name, 'desk') === noDesk.home);
  ok(`${noDesk.name} deskAvailable = false`, deskAvailable(noDesk.name) === false);
} else {
  console.log('  (حتى ولاية بلا مكتب في الجدول — الفحص يتقفز)');
}

console.log('\n══ المجموع ══');
const order = { shipping: 'home', qty: 2, wilaya: 'وهران' };
ok('totalWith يزيد سومة الولاية',
  totalWith(3000, order) === 3000 * 2 + shippingFee('وهران', 'home'),
  String(totalWith(3000, order)));
/* الطلب المخزّن يخزّن shippingFee — تبديل التسعيرة غداً ما يبدّلش
   حساب الطلبيات القدام */
const stored = { total: 9000, shippingFee: 1200, wilaya: 'تمنراست', shipping: 'home' };
ok('shippingFeeOf يقدّم المخزّن على الجدول', shippingFeeOf(stored) === 1200);
ok('goodsTotal ينقّص المخزّن ماشي جدول اليوم', goodsTotal(stored) === 7800);
const legacy = { total: 4500, wilaya: 'وهران', shipping: 'desk' };
ok('طلب قديم بلا shippingFee يستنتج من الولاية', shippingFeeOf(legacy) === shippingFee('وهران', 'desk'));

console.log('\n══ الحمولة اللي تمشي للمتصفّح ══');
const payload = ratesPayload();
ok('فيها الافتراضية + الجدول', payload.default.home > 0 && payload.table.length === 58);
const tag = ratesScriptTag();
ok('الوسم JSON صالح', (() => {
  const inner = tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</script>'));
  try { return JSON.parse(inner.replace(/\\u003c/g, '<')).table.length === 58; } catch { return false; }
})());
ok('`<` مهروب في الوسم', !tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</script>')).includes('<'));

console.log('\n══ الصفحة والسيرفر يقراو من نفس البلاصة ══');
const mainJs = readFileSync(new URL('../../assets/js/main.js', import.meta.url), 'utf8');
ok('main.js يقرا وسم التسعيرة', mainJs.includes('qiti-shipping-rates'));
ok('main.js يعاود يحسب كي تتبدّل الولاية', mainJs.includes("wilayaSelect.addEventListener('change', updateSummary)"));
const orderApi = readFileSync(new URL('../../api/order.mjs', import.meta.url), 'utf8');
ok('api/order.mjs يحسب السومة من الولاية', orderApi.includes('shippingFee: shippingFee(order.wilaya, order.shipping)'));
ok('api/order.mjs يرفض مكتب في ولاية بلاه', orderApi.includes('deskAvailable(wilaya)'));
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
ok('index.html فيه بلاصة الجدول', indexHtml.includes('id="shipRates"'));

console.log(`\nid تاع الجزائر = ${wilayaId('الجزائر')} (لازم 16)`);
