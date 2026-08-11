/*
 * التقاط الطلبات اللي ما كملوش — الفحوصات.
 *
 * كلش هنا نقي (بلا تخزين، بلا شبكة): الحسابات والرسائل تتفحصو وحدهم.
 * علاش هذا ممكن أصلاً: القرارات ("واش يستاهل إشعار؟"، "قداش عمّر؟")
 * مكتوبة كفنكشنات نقيّة في lib/leads.mjs، ماشي مخبّية جوّا نداء Redis.
 */
const lib = (p) => import(new URL(`../../lib/${p}`, import.meta.url).href);

const {
  completeness, dueForNotice, mergeLead, leadMessage, leadButtons,
  IDLE_MINUTES, LEAD_FIELDS, LEAD_TTL_SECONDS,
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

console.log('\n══ 2. شكون يستاهل إشعار ══');
ok('واحد راه يكتب دروك — ما يتبعثش',
  dueForNotice(openLead({ updatedAt: ago(2) }), NOW) === false);
ok(`ساكت من ${IDLE_MINUTES} دقيقة — يتبعث`,
  dueForNotice(openLead({ updatedAt: ago(IDLE_MINUTES + 1) }), NOW) === true);
ok('على الحدّ بالضبط — يتبعث',
  dueForNotice(openLead({ updatedAt: ago(IDLE_MINUTES) }), NOW) === true);
ok('تبعث من قبل — ما يتعاودش',
  dueForNotice(openLead({ updatedAt: ago(60), notifiedAt: ago(50) }), NOW) === false);
ok('كمّل الطلب — ما يتبعثش',
  dueForNotice(openLead({ updatedAt: ago(60), status: 'converted' }), NOW) === false);
ok('مشطوب — ما يتبعثش',
  dueForNotice(openLead({ updatedAt: ago(60), status: 'dismissed' }), NOW) === false);
ok('updatedAt مهرّس ما يطيّحش', dueForNotice(openLead({ updatedAt: 'خرابيش' }), NOW) === false);

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
ok('يوري السلّة', msg.includes('4,500 دج'));
ok('يقول صراحةً بلي ما كملش', msg.includes('ما كملش'));
/* الفرق مع رسالة الطلب مقصود — نقرة "قبول" على واحد ما طلب = طلبية وهمية */
ok('ما فيهاش لغة قبول/رفض', !msg.includes('قبول الطلب') && !msg.includes('رفض الطلب'));

const evil = leadMessage(openLead({ name: '<script>alert(1)</script>' }));
ok('الاسم يتهرب (ما يهرّسش الرسالة)',
  !evil.includes('<script>') && evil.includes('&lt;script&gt;'));

const noName = leadMessage(openLead({ name: '' }));
ok('بلا اسم ما تطيحش', noName.includes('+213661445566') && !noName.includes('undefined'));

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
ok('يوري عدد اللي ما كملوش', report.includes('طلبات ما كملوش (12'));
ok('يجمع سومة السلال', report.includes('12,000 دج'));
ok('يوقف على 10 ويقول قداش باقي', report.includes('و2 آخرين'));

const quiet = buildReport('2026-08-11', [], [], [], null, null, []);
ok('بلا leads ما يزيد حتى سطر', !quiet.includes('ما كملوش'));

console.log('\n══ 7. الإعدادات ══');
ok('TTL = 30 يوم', LEAD_TTL_SECONDS === 30 * 24 * 60 * 60);
ok('السكوت 10 دقايق', IDLE_MINUTES === 10);
