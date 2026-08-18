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
  RATES, DEFAULT_RATE, rateFor, shippingFee, deskAvailable, isServed, rateTable, ratesPayload, ratesScriptTag,
} = await lib('shipping-rates.mjs');
const { WILAYAS, wilayaId } = await lib('wilayas.mjs');
const { totalWith, shippingFeeOf, goodsTotal } = await lib('message.mjs');

const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

console.log('══ الجدول ══');
ok('58 ولاية في الجدول', rateTable().length === 58, String(rateTable().length));
ok('الترتيب = الترقيم الرسمي', rateTable().every((row, i) => row.id === i + 1 && row.name === WILAYAS[i]));
ok('الجزائر = 500 / 350', rateFor('الجزائر').home === 500 && rateFor('الجزائر').desk === 350);
ok('اسم ماشي موجود يرجع الافتراضية', rateFor('ولاية ما كاينش') === DEFAULT_RATE);
ok('الرقم والاسم يعطيو نفس السطر', rateFor(31) === rateFor('وهران'));
ok('رقم برّا 1-58 يرجع الافتراضية', rateFor(0) === DEFAULT_RATE && rateFor(99) === DEFAULT_RATE);

console.log('\n══ كل سطر مسجّل معقول ══');
const entries = Object.entries(RATES);
console.log(`  ${entries.length} ولاية عندها تسعيرة خاصة (الباقي على ${DEFAULT_RATE.home}/${DEFAULT_RATE.desk})`);
ok('المفاتيح كلها أرقام ولايات صحيحة',
  entries.every(([id]) => Number(id) >= 1 && Number(id) <= 58),
  entries.filter(([id]) => !(Number(id) >= 1 && Number(id) <= 58)).map(([id]) => id).join(', ') || 'كامل صحاح');
ok('سومة الدار رقم موجب (ولا null = بلا خدمة)',
  entries.every(([, rate]) => rate.home === null || (Number.isFinite(rate.home) && rate.home > 0)),
  entries.filter(([, rate]) => !(rate.home === null || (Number.isFinite(rate.home) && rate.home > 0))).map(([id]) => WILAYAS[id - 1]).join(', ') || 'كامل صحاح');
ok('سومة المكتب رقم موجب ولا null',
  entries.every(([, rate]) => rate.desk === null || rate.desk === undefined || (Number.isFinite(rate.desk) && rate.desk > 0)),
  entries.filter(([, rate]) => !(rate.desk == null || (Number.isFinite(rate.desk) && rate.desk > 0))).map(([id]) => WILAYAS[id - 1]).join(', ') || 'كامل صحاح');
/* المكتب أرخص من الدار — إذا العكس، غالب راه غلط نسخ في الجدول */
ok('المكتب ما يكونش أغلى من الدار',
  entries.every(([, rate]) => rate.home == null || rate.desk == null || rate.desk <= rate.home),
  entries.filter(([, rate]) => rate.desk != null && rate.desk > rate.home).map(([id]) => WILAYAS[id - 1]).join(', ') || 'كامل صحاح');

console.log('\n══ قائمة DHD: 55 ولاية + 3 بلا خدمة ══');
const served = rateTable().filter((row) => row.home !== null);
const unserved = rateTable().filter((row) => row.home === null);
ok('55 ولاية عندها تسعيرة', served.length === 55, String(served.length));
ok('3 ولايات بلا خدمة = 50 / 54 / 56',
  unserved.map((row) => row.id).join(',') === '50,54,56',
  unserved.map((row) => `${row.id} ${row.name}`).join(' | '));
ok('كل الولايات مصرّح بيها في الجدول', Object.keys(RATES).length === 58, String(Object.keys(RATES).length));
ok('isServed يفرّق بين الزوج', isServed('الجزائر') === true && isServed('جانت') === false);
/* الولايات بلا مكتب: بني عباس (52) والمغير (57) — desk = 0 في قائمة DHD */
ok('بني عباس والمغير بلا مكتب',
  deskAvailable('بني عباس') === false && deskAvailable('المغير') === false);
ok('بني عباس: طلب "مكتب" يتخلّص سومة الدار', shippingFee('بني عباس', 'desk') === 1100);
/* الولاية بلا خدمة ما ترجعش NaN — الحساب القديم يلزمو رقم */
ok('ولاية بلا خدمة ترجع رقم ماشي null', Number.isFinite(shippingFee('جانت', 'home')));

console.log('\n══ عيّنة من الأرقام ══');
ok('أدرار 1100 / 600', shippingFee('أدرار', 'home') === 1100 && shippingFee('أدرار', 'desk') === 600);
ok('باتنة 450 / 400', shippingFee('باتنة', 'home') === 450 && shippingFee('باتنة', 'desk') === 400);
ok('تمنراست 1300 / 800', shippingFee('تمنراست', 'home') === 1300 && shippingFee('تمنراست', 'desk') === 800);
ok('وهران 700 / 400', shippingFee('وهران', 'home') === 700 && shippingFee('وهران', 'desk') === 400);
ok('المنيعة 1000 / 500', shippingFee('المنيعة', 'home') === 1000 && shippingFee('المنيعة', 'desk') === 500);

console.log('\n══ السومة اللي تتخلّص ══');
ok('desk في ولاية عندها مكتب = سومة المكتب',
  shippingFee('وهران', 'desk') === rateFor('وهران').desk || rateFor('وهران').desk === null);
/* ولاية بلا مكتب: السومة ترجع للدار، ماشي صفر — الطلب يوصل للدار فعلاً */
const noDesk = rateTable().find((row) => row.desk === null && row.home !== null);
if (noDesk) {
  ok(`${noDesk.name} بلا مكتب: السومة ترجع للدار`, shippingFee(noDesk.name, 'desk') === noDesk.home);
  ok(`${noDesk.name} deskAvailable = false`, deskAvailable(noDesk.name) === false);
} else {
  console.log('  (حتى ولاية بلا مكتب في الجدول — الفحص يتقفز)');
}

console.log('\n══ المجموع ══');
const order = { shipping: 'home', qty: 2, wilaya: 'وهران' };
ok('totalWith يزيد سومة الولاية', totalWith(3000, order) === 6700, String(totalWith(3000, order)));
/* نفس المنتج، ولايتين — الفرق هو كامل معنى هذا الشغل */
ok('نفس الطلب يختلف بين الجزائر وتمنراست',
  totalWith(3000, { shipping: 'home', qty: 1, wilaya: 'الجزائر' }) === 3500
  && totalWith(3000, { shipping: 'home', qty: 1, wilaya: 'تمنراست' }) === 4300);
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
ok('api/order.mjs يرفض ولاية بلا خدمة', orderApi.includes('!isServed(wilaya)'));

console.log(`\nid تاع الجزائر = ${wilayaId('الجزائر')} (لازم 16)`);
