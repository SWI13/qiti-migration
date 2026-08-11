/*
 * التقاط الطلبات اللي ما كملوش — الفحوصات.
 *
 * كلش هنا نقي (بلا تخزين، بلا شبكة): الحسابات والرسائل تتفحصو وحدهم.
 * علاش هذا ممكن أصلاً: القرارات ("واش يستاهل إشعار؟"، "قداش عمّر؟")
 * مكتوبة كفنكشنات نقيّة في lib/leads.mjs، ماشي مخبّية جوّا نداء Redis.
 */
import { readFile } from 'node:fs/promises';

const lib = (p) => import(new URL(`../../lib/${p}`, import.meta.url).href);

const {
  completeness, dueForNotice, mergeLead, leadMessage, leadButtons, orderClosesLead,
  LEAD_FIELDS, LEAD_TTL_SECONDS, NOTIFY_AFTER_SECONDS, REOPEN_AFTER_MS,
} = await lib('leads.mjs');
const { buildReport } = await import(new URL('../../api/daily-report.mjs', import.meta.url).href);

const ok = (l, p, x = '') => console.log(`${p ? 'PASS' : 'FAIL'}  ${l}${x ? '  — ' + x : ''}`);

const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);
const ago = (minutes) => new Date(NOW - minutes * MINUTE).toISOString();

const openLead = (extra = {}) => ({
  phone: '0661445566',
  name: 'كريم',
  status: 'open',
  createdAt: ago(30),
  updatedAt: ago(30),
  notifiedAt: null,
  ...extra,
});

console.log('══ 1. قداش عمّر ══');
ok('رقم وحدو = 1', completeness({ phone: '0661445566' }) === 1);
ok('رقم + اسم = 2', completeness({ phone: '0661445566', name: 'كريم' }) === 2);
ok('الفورم كامل = 4', completeness({
  phone: '0661445566', name: 'كريم', wilaya: 'وهران', commune: 'السانيا',
}) === LEAD_FIELDS.length);
ok('الفراغات ما تتحسبش', completeness({ phone: '0661445566', name: '   ' }) === 1);
ok('lead فارغ = 0', completeness({}) === 0 && completeness(null) === 0);

/* هذا هو الفرق بين "راه يعمّر الفورم" و"حبس" — الغلط فيه معناه إشعار
   يوصل والزبون ما زال قدّام الشاشة غادي يأكّد. */
console.log('\n══ 2. شكون حبس فعلاً ══');
const IDLE_MIN = NOTIFY_AFTER_SECONDS / 60;
ok('راه يكتب دروك — ما يتبعثش',
  dueForNotice(openLead({ updatedAt: ago(0.5) }), NOW) === false);
ok('عمّر حقل قبل دقيقة — ما زال يخدم، ما يتبعثش',
  dueForNotice(openLead({ updatedAt: ago(1) }), NOW) === false);
ok(`ساكت ${IDLE_MIN} دقيقة — يتبعث`,
  dueForNotice(openLead({ updatedAt: ago(IDLE_MIN + 0.5) }), NOW) === true);
ok('على الحدّ بالضبط — يتبعث',
  dueForNotice(openLead({ updatedAt: ago(IDLE_MIN) }), NOW) === true);
ok('خرج من الصفحة — يتبعث دروك بلا انتظار',
  dueForNotice(openLead({ updatedAt: ago(0.1) }), NOW, { leaving: true }) === true);
ok('خرج بصح كمّل الطلب — ما يتبعثش',
  dueForNotice(openLead({ status: 'converted' }), NOW, { leaving: true }) === false);
ok('تبعث من قبل — ما يتعاودش',
  dueForNotice(openLead({ updatedAt: ago(60), notifiedAt: ago(50) }), NOW) === false);
ok('مشطوب — ما يتبعثش',
  dueForNotice(openLead({ updatedAt: ago(60), status: 'dismissed' }), NOW) === false);
ok('updatedAt مهرّس ما يطيّحش', dueForNotice(openLead({ updatedAt: 'خرابيش' }), NOW) === false);
ok('lead فارغ ما يطيّحش', dueForNotice(null, NOW) === false);

/*
 * الغلطة اللي طيّحت الميزة كاملة في الإنتاج: "الرقم عندو طلبات = كمّل".
 * زبون شرا مرّة قبل عندو طلب للأبد — فكل lead جديد منّو كان يتشطب
 * ساعة ما يتصنع: يختفي من اللوحة، وما يوصل عليه حتى إشعار.
 */
console.log('\n══ 2b. أشمن طلب يغلق الـ lead ══');
const leadStarted = openLead({ createdAt: ago(10), updatedAt: ago(10) });
ok('طلب جا بعد ما بدا الـ lead — يغلقو',
  orderClosesLead({ id: 'a', createdAt: ago(2) }, leadStarted) === true);
ok('طلب قديم من شهر — ما يغلقوش (زبون راجع)',
  orderClosesLead({ id: 'b', createdAt: ago(60 * 24 * 30) }, leadStarted) === false);
ok('طلب جا قبل الـ lead بدقيقة — ما يغلقوش',
  orderClosesLead({ id: 'c', createdAt: ago(11) }, leadStarted) === false);
ok('طلب في نفس اللحظة — يغلقو',
  orderClosesLead({ id: 'd', createdAt: leadStarted.createdAt }, leadStarted) === true);
ok('معطيات ناقصة ما تطيّحش',
  orderClosesLead(null, leadStarted) === false && orderClosesLead({ id: 'e' }, null) === false);
ok('إعادة الفتح بعد 5 دقايق', REOPEN_AFTER_MS === 5 * 60 * 1000);

console.log('\n══ 3. الدمج ما يمسحش معلومة ══');
const before = { phone: '0661445566', name: 'كريم', wilaya: 'وهران' };
ok('حقل تمسح مؤقتاً ما يحيّدش القديم',
  mergeLead(before, { wilaya: '' }).wilaya === 'وهران');
ok('null يتجاهل', mergeLead(before, { name: null }).name === 'كريم');
ok('قيمة جديدة تغلب', mergeLead(before, { wilaya: 'الجزائر' }).wilaya === 'الجزائر');
ok('حقل جديد يتزاد', mergeLead(before, { commune: 'السانيا' }).commune === 'السانيا');
ok('lead جديد بلا قديم يخدم', mergeLead(null, { phone: '0555000000' }).phone === '0555000000');

console.log('\n══ 4. الرسالة ══');
const msg = leadMessage(openLead({ wilaya: 'وهران', commune: 'السانيا', cartTotal: 4500 }));
ok('الرقم بصيغة دولية باش تنقر عليه وتعيّط', msg.includes('+213661445566'));
ok('يوري قداش عمّر', msg.includes(`4 من ${LEAD_FIELDS.length}`));
ok('يوري السلّة وبلي ما تأكّدتش', msg.includes('4,500 دج') && msg.includes('غير مؤكّدة'));
ok('يقول صراحةً بلي ما كملش', msg.includes('غير مكتمل'));
/* رسائل تيليغرام بالفصحى — الدارجة تبقى للصفحة اللي تبيع للزبون */
ok('الرسالة بالفصحى، بلا دارجة',
  !msg.includes('عيّط') && !msg.includes('ما كملش') && !msg.includes('بلا اسم'));
/* الفرق مع رسالة الطلب مقصود — نقرة "قبول" على واحد ما طلب = طلبية وهمية */
ok('ما فيهاش لغة قبول/رفض', !msg.includes('قبول الطلب') && !msg.includes('رفض الطلب'));

const evil = leadMessage(openLead({ name: '<script>alert(1)</script>' }));
ok('الاسم يتهرب (ما يهرّسش الرسالة)',
  !evil.includes('<script>') && evil.includes('&lt;script&gt;'));

const noName = leadMessage(openLead({ name: '' }));
ok('بلا اسم ما تطيحش', noName.includes('+213661445566') && !noName.includes('undefined'));

/* نفس الرسالة تتبدّل في بلاصتها كي يكمّل — ماشي رسالة جديدة */
const done = leadMessage(openLead({ status: 'converted', orderId: '260811-ab12x', cartTotal: 4500 }));
ok('كي يكمّل، الرسالة تولّي "أكمل الطلب"', done.includes('أكمل الطلب'));
ok('كي يكمّل، تحمل id تاع الطلب', done.includes('260811-ab12x'));
ok('كي يكمّل، ما تبقاش تقول اتصل بيه', !done.includes('اتصل به الآن'));

const called = leadMessage(openLead({ contactedAt: ago(5), contactedBy: 'كريم' }));
ok('كي تعيّط، الرسالة توري شكون عيّط', called.includes('تمّ الاتصال به') && called.includes('كريم'));

console.log('\n══ 5. الأزرار ══');
const buttons = leadButtons(openLead());
const flat = buttons.inline_keyboard.flat();
ok('زر واتساب بالرقم الصحيح',
  flat.some((b) => b.url === 'https://wa.me/213661445566'));
ok('زر "عيّطتلو" فيه الرقم', flat.some((b) => b.callback_data === 'ldc:0661445566'));
ok('زر "شطبو" فيه الرقم', flat.some((b) => b.callback_data === 'ldx:0661445566'));
/* حدّ تيليغرام 64 بايت — لو فاتوه، الزر يطيح بلا خطأ مفهوم */
ok('callback_data تحت 64 بايت',
  flat.filter((b) => b.callback_data)
    .every((b) => Buffer.byteLength(b.callback_data, 'utf8') <= 64));

console.log('\n══ 6. تقرير آخر النهار ══');
const leads = Array.from({ length: 12 }, (_, i) =>
  openLead({ phone: `066144556${i % 10}`, name: `زبون ${i + 1}`, cartTotal: 1000 }));
const report = buildReport('2026-08-11', [], [], [], null, null, leads);
ok('يوري عدد اللي ما كملوش', report.includes('طلبات غير مكتملة (12'));
ok('يجمع سومة السلال', report.includes('12,000 دج'));
ok('يوقف على 10 ويقول قداش باقي', report.includes('و2 آخرين'));

const quiet = buildReport('2026-08-11', [], [], [], null, null, []);
ok('بلا leads ما يزيد حتى سطر', !quiet.includes('غير مكتملة'));

console.log('\n══ 7. الإعدادات ══');
ok('TTL = 30 يوم', LEAD_TTL_SECONDS === 30 * 24 * 60 * 60);
ok('السكوت دقيقتين', NOTIFY_AFTER_SECONDS === 120);
/* الساعة في المتصفّح لازم توافق الحاجز في السيرفر، وإلا الصفحة تبعث
   إشارة "سكت" والسيرفر يرفضها وما يوصل حتى إشعار */
const mainJs = await readFile(new URL('../../assets/js/main.js', import.meta.url), 'utf8');
ok('ساعة الصفحة توافق حاجز السيرفر',
  mainJs.includes(`var LEAD_IDLE_MS = ${NOTIFY_AFTER_SECONDS * 1000};`));
