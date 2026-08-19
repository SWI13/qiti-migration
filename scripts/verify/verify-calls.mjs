/*
 * صفّ المكالمات — الفحوصات.
 *
 * كلش هنا نقي (بلا تخزين، بلا شبكة): متى تعاود المكالمة، قداش محاولة
 * قبل ما تحبس، وكيفاش يتّرتّب الصفّ. علاش هذا ممكن: القرارات مكتوبة
 * كفنكشنات نقيّة في lib/calls.mjs، ماشي مخبّية جوّا نداء تخزين.
 *
 * ⚠️ الفحص الأهم في الملف كامل هو الأخير: الصفّ لازم **يفرغ**. لائحة
 * تكبر بلا حدّ هي بالضبط المشكلة اللي جابت هاذ الميزة.
 */
const lib = (p) => import(new URL(`../../lib/${p}`, import.meta.url).href);

const {
  CALL_OUTCOMES, MAX_ATTEMPTS, appendCall, attemptCount, lastCall, callsOf,
  retryDelayMinutes, queueStateOf, sortQueue, queueCounts, dueAt, isCallOutcome,
} = await lib('calls.mjs');
const { callSummaryLines, CALL_OUTCOME_LABEL } = await lib('message.mjs');

const ok = (l, p, x = '') => console.log(`${p ? 'PASS' : 'FAIL'}  ${l}${x ? '  — ' + x : ''}`);

const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 7, 19, 10, 0, 0);
const ago = (minutes) => new Date(NOW - minutes * MINUTE).toISOString();
const at = (minutes) => new Date(NOW + minutes * MINUTE);

const pending = (extra = {}) => ({
  id: '260819-abcde',
  status: 'pending',
  phone: '0661445566',
  name: 'كريم',
  createdAt: ago(60),
  ...extra,
});

/** يسجّل محاولات ورا بعضهم كيما يصرا في الحقيقة */
function after(record, outcomes, when = NOW) {
  return outcomes.reduce((acc, outcome) =>
    ({ ...acc, ...appendCall(acc, { outcome, by: 'كريم', at: new Date(when) }) }), record);
}

console.log('══ 1. تسجيل المحاولة ══');
const one = after(pending(), ['no-answer']);
ok('المحاولة تتزاد للائحة', attemptCount(one) === 1);
ok('النتيجة تتخزّن كيما هي', lastCall(one).outcome === 'no-answer');
ok('اللي عيّط يتسجّل', lastCall(one).by === 'كريم');
ok('الوقت يتخزّن ISO', lastCall(one).at === new Date(NOW).toISOString());
ok('المحاولات تتراكم ما تتبدّلش', attemptCount(after(one, ['busy', 'off'])) === 3);
ok('نتيجة ماشي معروفة ما تتسجّلش',
  appendCall(pending(), { outcome: 'خرابيش' }) === null && isCallOutcome('خرابيش') === false);
ok('سجلّ قديم بلا حقل calls يخدم', callsOf({ status: 'pending' }).length === 0);
ok('الملاحظة تتقصّ على 200 حرف',
  appendCall(pending(), { outcome: 'busy', note: 'ط'.repeat(500) }).calls[0].note.length === 200);

console.log('\n══ 2. وقتاش نعاودو ══');
ok('"مشغول" قريبة — ربع ساعة', retryDelayMinutes('busy', 1) === 15);
ok('"مشغول" ما تكبرش مع المحاولات', retryDelayMinutes('busy', 4) === 15);
/* السلّم هو اللي يفرّق بين متابعة وزنّ: نفس المهلة على خمس محاولات
   معناها خمس رنّات في ساعتين على واحد راه في الخدمة. */
ok('"ما جاوبش" تكبر مع كل محاولة',
  retryDelayMinutes('no-answer', 1) === 45 && retryDelayMinutes('no-answer', 3) === 135);
ok('المهلة تتحبس على 12 ساعة', retryDelayMinutes('off', 99) === 12 * 60);
ok('"جاوب" ما عندهاش موعد جاي', retryDelayMinutes('reached', 1) === null);
ok('الموعد يتحسب من وقت المكالمة',
  after(pending(), ['busy']).nextCallAt === new Date(NOW + 15 * MINUTE).toISOString());

/* الزبون اللي قال "عيّطلي بعد الخامسة" يعرف وقتو خير من أي سلّم */
const asked = { ...pending(), ...appendCall(pending(), { outcome: 'callback', at: new Date(NOW), callbackAt: at(300) }) };
ok('الوقت اللي طلبو الزبون يغلب السلّم', asked.nextCallAt === at(300).toISOString());
ok('وقت مهرّس يرجع للسلّم',
  appendCall(pending(), { outcome: 'callback', at: new Date(NOW), callbackAt: 'غدوة' }).nextCallAt
    === new Date(NOW + 180 * MINUTE).toISOString());

console.log('\n══ 3. حالة السطر في الصفّ ══');
ok('طلب جديد بلا مكالمة — يستنّى دروك', queueStateOf(pending(), NOW) === 'due');
ok('توّ عيّطنالو — عندو موعد', queueStateOf(one, NOW) === 'waiting');
ok('فات وقت الموعد — يرجع للصفّ', queueStateOf(one, NOW + 46 * MINUTE) === 'due');
ok('جاوب وأكّد — يستنّى قرار ماشي مكالمة',
  queueStateOf(after(pending(), ['reached']), NOW) === 'confirmed');
ok('الرقم غالط — واقف، المكالمات ما تنفعوش',
  queueStateOf(after(pending(), ['wrong']), NOW) === 'stalled');
ok(`${MAX_ATTEMPTS} محاولات — واقف`,
  queueStateOf(after(pending(), Array(MAX_ATTEMPTS).fill('no-answer')), NOW + 99 * 60 * MINUTE) === 'stalled');
ok('محاولة تحت الحدّ ما توقّفش',
  queueStateOf(after(pending(), Array(MAX_ATTEMPTS - 1).fill('no-answer')), NOW + 99 * 60 * MINUTE) === 'due');
ok('الطلب المقرّر يخرج من الصفّ',
  queueStateOf({ ...pending(), status: 'accepted' }, NOW) === 'closed');

/*
 * الـ lead ما فيهش "تأكيد": ما كاينش طلب باش تقبلو. كلّمتو = خدمتك
 * كملت. لو رجّعناه 'confirmed' كيما الطلب، يبقى في الصفّ للأبد ينتظر
 * قرار ما كاينش.
 */
const lead = (extra = {}) => ({ isLead: true, status: 'open', phone: '0661445566', createdAt: ago(30), ...extra });
ok('lead جديد يستاهل مكالمة', queueStateOf(lead(), NOW) === 'due');
ok('lead كلّمتو — يخرج من الصفّ', queueStateOf(after(lead(), ['reached']), NOW) === 'closed');
ok('lead مشطوب — برّا الصفّ', queueStateOf(lead({ status: 'dismissed' }), NOW) === 'closed');
ok('lead ما جاوبش — يبقى في الصفّ بموعد',
  queueStateOf(after(lead(), ['no-answer']), NOW) === 'waiting');

console.log('\n══ 4. الترتيب ══');
const confirmed = { ...after(pending({ id: 'c', createdAt: ago(10) }), ['reached']) };
const oldDue = pending({ id: 'old', createdAt: ago(600) });
const newDue = pending({ id: 'new', createdAt: ago(20) });
const stalled = after(pending({ id: 'st', createdAt: ago(900) }), Array(MAX_ATTEMPTS).fill('no-answer'), NOW - 60 * MINUTE);
const waiting = { ...one, id: 'w' };

const order = sortQueue([waiting, stalled, newDue, oldDue, confirmed], NOW).map((row) => row.id);
ok('المؤكّد أوّل — نقرة وحدة وتولّي فلوس', order[0] === 'c', order.join(' → '));
ok('الأقدم يجي قبل الأجدّ في نفس المجموعة', order.indexOf('old') < order.indexOf('new'));
ok('الواقف تحت الشغل الحيّ', order.indexOf('st') > order.indexOf('new'));
ok('اللي عندو موعد في الآخر', order[order.length - 1] === 'w');
ok('الترتيب ما يبدّلش اللائحة الأصلية', dueAt(oldDue) === new Date(oldDue.createdAt).getTime());

const counts = queueCounts([waiting, stalled, newDue, oldDue, confirmed, { ...pending(), status: 'denied' }], NOW);
ok('العدّ يطابق الحالات',
  counts.confirmed === 1 && counts.due === 2 && counts.stalled === 1 && counts.waiting === 1);
ok('المقرّر ما يتعدّش', counts.total === 5);

console.log('\n══ 5. الرسالة في تيليغرام ══');
ok('بلا مكالمات — بلا سطر زائد', callSummaryLines(pending()).length === 0);
/*
 * ⚠️ هنا بالذات نستعملو الوقت الحقيقي، ماشي NOW الثابت.
 *
 * callSummaryLines تقارن nextCallAt مع Date.now() — هي اللي تقرّر واش
 * الموعد مازال جاي ولا فات. بالثابت، الفحص كان ينجح في الصباح ويطيح
 * بعد 10:15 UTC تاع 19 أوت: الموعد يولّي في الماضي والسطر ما يبانش،
 * والفنكشن راهي صحيحة. باقي الملف يبقى على NOW — حساب المواعيد
 * والترتيب لازمهم وقت ثابت.
 */
const lines = callSummaryLines(after(pending(), ['no-answer', 'busy'], Date.now()));
ok('عدد المحاولات يبان', lines[0].includes('2'));
ok('آخر نتيجة تبان بالكلام', lines[0].includes(CALL_OUTCOME_LABEL.busy));
ok('الموعد الجاي يبان', lines.some((line) => line.includes('المعاودة')));
const noted = callSummaryLines({ ...pending(), ...appendCall(pending(), { outcome: 'callback', note: 'يحب الأزرق' }) });
ok('الملاحظة تبان تحت', noted.some((line) => line.includes('يحب الأزرق')));
ok('الاسم فيه < ولا & يتهرب',
  callSummaryLines({ ...pending(), ...appendCall(pending(), { outcome: 'busy', note: '<b>x</b>' }) })
    .some((line) => line.includes('&lt;b&gt;')));

console.log('\n══ 6. الصفّ لازم يفرغ ══');
/*
 * هذا هو الفحص اللي يحمي معنى الميزة. طلب واحد يعيّطلو ويعيّطلو ما
 * يقدرش يبقى في الصفّ للأبد: بعد MAX_ATTEMPTS يولّي "واقف" — يستنّى
 * قرار، وما يزحمش الطلبات الجداد اللي يقدرو يتباعو.
 */
let stubborn = pending();
for (let i = 0; i < MAX_ATTEMPTS + 3; i++) {
  stubborn = { ...stubborn, ...appendCall(stubborn, { outcome: 'no-answer', at: new Date(NOW + i * 600 * MINUTE) }) };
}
const far = NOW + 999 * 60 * MINUTE;
ok('اللي ما يجاوبش عمرو ما يرجع لـ "يستاهل مكالمة"', queueStateOf(stubborn, far) === 'stalled');
ok('وعدد محاولاتو محفوظ كامل', attemptCount(stubborn) === MAX_ATTEMPTS + 3);
ok('كل نتيجة عندها اسم مقروء في الرسالة',
  Object.keys(CALL_OUTCOMES).every((outcome) => Boolean(CALL_OUTCOME_LABEL[outcome])));
