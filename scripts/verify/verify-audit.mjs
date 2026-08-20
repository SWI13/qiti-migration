/*
 * سجلّ التدقيق — من الفعل حتى السطر في اللوحة.
 *
 * ── واش يتفحّص هنا ─────────────────────────────────────────────────
 * السجلّ ماشي ميزة تبان: ما كاينش شاشة تطيح كي يوقف يكتب. يوقف
 * بالسكات، ويبان النقص غير نهار ما تحتاجو — وساعتها الحدث اللي
 * تقلّب عليه راه فات. علاش الفحص هنا يمسّ الطريق كامل:
 *
 *   • القرار يكتب سطر، والسطر فيه القيمة القديمة والجديدة
 *   • الفشل يتسجّل بسببو، ماشي يتقفز
 *   • الأسرار ما توصلش للتخزين حتى لو مرّرناهم بالسيف
 *   • الويبهوك اللي يتعاود ما يزيدش سطر ثاني (idempotency)
 *   • الفلترة والصفحات والخطّ الزمني تاع طلب
 *   • السجلّ ما يطيّحش الشغل كي التخزين يطيح
 *   • ما كاينش أكشن يمسح ولا يبدّل سطر من اللوحة
 */
import { fakeRedis } from './fake-redis.mjs';

const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;
delete process.env.ECOTRACK_URL;
delete process.env.ECOTRACK_TOKEN;

const redis = await fakeRedis().start();

const lib = (path) => import(new URL(`../../lib/${path}`, import.meta.url).href);
const {
  logEvent, listEvents, eventsForOrder, getEvent, auditSummary, redact, diff, maskPhone, REDACTED,
} = await lib('audit.mjs');
const { saveOrder, getOrder, algiersDate } = await lib('store.mjs');
const { saveProduct, setVariantStock, SIMPLE_SKU } = await lib('catalog.mjs');
const { acceptOrder, denyOrder, voidOrder } = await lib('decisions.mjs');

/* ═══ 1. الحجب: الأسرار ما تدخلش للسجلّ ══════════════════════════ */
console.log('══ 1. الأسرار محجوبة ══');

const dirty = redact({
  name: 'كريم',
  password: 'hunter2',
  ADMIN_PASSWORD_HASH: 'deadbeef',
  telegramBotToken: '123:ABC',
  session: 'cookie-value',
  nested: { apiKey: 'sk-live-xxx', qty: 3 },
});

ok('كلمة السرّ محجوبة', dirty.password === REDACTED);
ok('الهاش محجوب', dirty.ADMIN_PASSWORD_HASH === REDACTED);
ok('توكن البوت محجوب', dirty.telegramBotToken === REDACTED);
ok('الجلسة محجوبة', dirty.session === REDACTED);
ok('السرّ المتداخل محجوب', dirty.nested.apiKey === REDACTED);
ok('اللي ماشي سرّ يبقى', dirty.name === 'كريم' && dirty.nested.qty === 3);

const stored = await logEvent({
  action: 'test.secrets',
  source: 'admin',
  metadata: { password: 'hunter2', botToken: 'abc', wilaya: 'وهران' },
});
ok('السرّ ما يوصلش للتخزين', JSON.stringify(stored).indexOf('hunter2') === -1);
ok('والحقل يبقى مكتوب بلّي تحجب', stored.metadata.password === REDACTED);

ok('الرقم يتقنّع للعرض', maskPhone('0661445566') === '0661***566', maskPhone('0661445566'));

/* ═══ 2. الفرق بين قبل وبعد ═══════════════════════════════════════ */
console.log('══ 2. قبل / بعد ══');

const changes = diff({ status: 'confirmed', phone: '0661445566' }, { status: 'shipped', phone: '0661445566' });
ok('الحقل اللي تبدّل برك يتسجّل', Object.keys(changes.newValues).join() === 'status',
  Object.keys(changes.newValues).join());
ok('القيمة القديمة تتخزّن', changes.oldValues.status === 'confirmed');
ok('القيمة الجديدة تتخزّن', changes.newValues.status === 'shipped');
ok('اللي ما تبدّلش ما يدخلش', changes.oldValues.phone === undefined);
ok('بلا تبديل = بلا فرق', diff({ a: 1 }, { a: 1 }).changed === false);

/* ═══ 3. القرار يكتب سطر ═════════════════════════════════════════ */
console.log('══ 3. القرار يسجّل روحو ══');

const collar = await saveProduct({
  name: 'Audit Collar', slug: 'audit-collar', type: 'pet',
  price: 3900, unitCost: 1500, status: 'active',
});
await setVariantStock(collar.id, SIMPLE_SKU, 5, 2);

let seq = 0;
const makeOrder = async (patch = {}) => {
  const id = `${algiersDate().replace(/-/g, '').slice(2)}-a${(seq += 1).toString().padStart(4, '0')}`;
  const record = {
    id, name: 'زبون فحص', phone: '0661445566', wilaya: 'الجزائر', commune: 'باب الوادي',
    shipping: 'home', qty: 1, productId: collar.id, productName: collar.name, variant: null,
    unitPrice: 3900, total: 4500, shippingFee: 600,
    lines: [{
      kind: 'product', productId: collar.id, sku: SIMPLE_SKU, name: collar.name,
      qty: 1, unitPrice: 3900, lineTotal: 3900, items: null,
    }],
    day: algiersDate(), createdAt: new Date().toISOString(),
    status: 'pending', actor: null, reason: null, decidedAt: null,
    confirmedAt: null, messageId: null,
    deliveryStatus: null, deliveryActor: null, deliveryDecidedAt: null, returnReceivedAt: null,
    ...patch,
  };
  await saveOrder(record);
  return record;
};

const accepted = await makeOrder();
await acceptOrder(accepted.id, { by: 'محمد', source: 'admin', requestId: 'req-accept-1' });

const acceptLog = (await listEvents({ orderId: accepted.id })).rows
  .find((event) => event.action === 'order.accepted');

ok('القبول يكتب سطر', Boolean(acceptLog));
ok('والسطر يقول شكون', acceptLog?.actorName === 'محمد', String(acceptLog?.actorName));
ok('ومنين', acceptLog?.source === 'admin', String(acceptLog?.source));
ok('والحالة القديمة والجديدة', acceptLog?.oldValues?.status === 'pending' && acceptLog?.newValues?.status === 'accepted',
  JSON.stringify({ old: acceptLog?.oldValues, new: acceptLog?.newValues }));
ok('ومربوط بالطلب', acceptLog?.orderId === accepted.id);
ok('ومعرّف الطلب يمشي معاه', acceptLog?.requestId === 'req-accept-1');
ok('ونتيجتو نجاح', acceptLog?.status === 'success');

/* نفس القرار من تيليغرام يكتب مصدر آخر */
const fromTelegram = await makeOrder();
await acceptOrder(fromTelegram.id, { by: 'كريم', source: 'telegram', chatId: 4242 });
const tgLog = (await listEvents({ orderId: fromTelegram.id })).rows
  .find((event) => event.action === 'order.accepted');
ok('نقرة تيليغرام تكتب المصدر تاعها', tgLog?.source === 'telegram', String(tgLog?.source));
ok('ومعاها الشات', tgLog?.telegramChatId === '4242', String(tgLog?.telegramChatId));

/* ═══ 4. الفشل يتسجّل بسببو ══════════════════════════════════════ */
console.log('══ 4. الفشل يبان ══');

await setVariantStock(collar.id, SIMPLE_SKU, 0, 2);
const starved = await makeOrder();
const refused = await acceptOrder(starved.id, { by: 'محمد', source: 'admin' });
ok('القبول يترفض على المخزون', refused.ok === false);

const failLog = (await listEvents({ orderId: starved.id, status: 'failed' })).rows[0];
ok('الرفض يتسجّل', Boolean(failLog), failLog?.action);
ok('ونتيجتو failed', failLog?.status === 'failed');
ok('والسبب مكتوب', String(failLog?.error).includes('المخزون'), String(failLog?.error));
await setVariantStock(collar.id, SIMPLE_SKU, 10, 2);

/* ═══ 5. الخطّ الزمني تاع طلب ════════════════════════════════════ */
console.log('══ 5. الخطّ الزمني ══');

const journey = await makeOrder();
await logEvent({ action: 'order.created', source: 'storefront', orderId: journey.id, description: 'طلب جديد' });
await acceptOrder(journey.id, { by: 'محمد', source: 'admin' });
await voidOrder(journey.id, { by: 'محمد', source: 'admin', reason: 'طلب تجريبي' });

const timeline = await eventsForOrder(journey.id);
ok('الخطّ الزمني يجمع كل أحداث الطلب', timeline.length >= 3, String(timeline.length));
ok('ومرتّب من الأقدم للأحدث', timeline[0].at <= timeline[timeline.length - 1].at);
ok('وفيه الإنشاء أوّل', timeline[0].action === 'order.created', timeline[0].action);
ok('والإلغاء آخر', timeline[timeline.length - 1].action === 'order.voided',
  timeline[timeline.length - 1].action);
ok('طلب ما عندوش أحداث يرجّع لائحة خاوية', (await eventsForOrder('260101-nope')).length === 0);

/* ═══ 6. الفلترة والبحث ══════════════════════════════════════════ */
console.log('══ 6. الفلترة ══');

const bySource = await listEvents({ source: 'telegram' });
ok('الفلترة بالمصدر', bySource.rows.every((event) => event.source === 'telegram'));

const byStatus = await listEvents({ status: 'failed' });
ok('الفلترة بالنتيجة', byStatus.rows.every((event) => event.status === 'failed') && byStatus.total > 0);

const byAction = await listEvents({ action: 'order.accepted' });
ok('الفلترة بالفعل', byAction.rows.every((event) => event.action === 'order.accepted'));

const byActor = await listEvents({ actor: 'كريم' });
ok('الفلترة بالفاعل', byActor.rows.every((event) => event.actorName === 'كريم') && byActor.total > 0);

const combined = await listEvents({ source: 'admin', status: 'failed', orderId: starved.id });
ok('الفلاتر تتجمع مع بعضها', combined.total === 1, String(combined.total));

const search = await listEvents({ q: 'req-accept-1' });
ok('البحث يلقى بمعرّف الطلب (requestId)', search.total >= 1, String(search.total));

const searchOrder = await listEvents({ q: accepted.id });
ok('والبحث برقم الطلب', searchOrder.total >= 1, String(searchOrder.total));

const searchError = await listEvents({ q: 'المخزون' });
ok('والبحث في نصّ الخطأ', searchError.total >= 1, String(searchError.total));

const noise = await listEvents({ q: 'حاجة ما كاينش' });
ok('بحث بلا نتيجة يرجّع صفر', noise.total === 0 && noise.rows.length === 0);

ok('اللائحة ترجّع الأفعال الموجودة للفلتر', Array.isArray(bySource.actions) && bySource.actions.length > 0);

/* ═══ 7. الصفحات ═════════════════════════════════════════════════ */
console.log('══ 7. الصفحات ══');

for (let i = 0; i < 12; i += 1) {
  await logEvent({ action: 'test.page', source: 'system', description: `سطر ${i}` });
}

const first = await listEvents({ action: 'test.page', limit: 5, page: 1 });
const second = await listEvents({ action: 'test.page', limit: 5, page: 2 });
ok('الصفحة الأولى محدودة', first.rows.length === 5, String(first.rows.length));
ok('والمجموع صحيح', first.total === 12, String(first.total));
ok('وعدد الصفحات', first.pages === 3, String(first.pages));
ok('الصفحة الثانية غير الأولى', second.rows[0].id !== first.rows[0].id);
ok('صفحة برّا المدى ترجع لآخر وحدة', (await listEvents({ action: 'test.page', limit: 5, page: 99 })).page === 3);
ok('الأحدث أوّل', first.rows[0].description === 'سطر 11', String(first.rows[0].description));

/* ═══ 8. منع التكرار ═════════════════════════════════════════════ */
console.log('══ 8. الويبهوك اللي يتعاود ══');

const once = await logEvent({
  action: 'telegram.webhook.received', source: 'telegram',
  entityId: '900', dedupeKey: 'tg-update-900',
});
const twice = await logEvent({
  action: 'telegram.webhook.received', source: 'telegram',
  entityId: '900', dedupeKey: 'tg-update-900',
});

ok('أوّل مرّة تتكتب', Boolean(once));
ok('والثانية تتقفز', twice === null);
ok('وما كاينش سطرين', (await listEvents({ q: 'tg-update' })).total <= 1);

const other = await logEvent({
  action: 'telegram.webhook.received', source: 'telegram',
  entityId: '901', dedupeKey: 'tg-update-901',
});
ok('تحديث آخر يعدّي عادي', Boolean(other));

/* ═══ 9. الحدث بمفتاحو، والملخّص ═════════════════════════════════ */
console.log('══ 9. الفتح والملخّص ══');

ok('الحدث يتقرا بمعرّفو', (await getEvent(once.id))?.id === once.id);
ok('معرّف ما كاينش يرجّع null', (await getEvent('nope-nope')) === null);

const summary = await auditSummary();
ok('الملخّص يعدّ اليوم', summary.today.total > 0, String(summary.today.total));
ok('ويعدّ اللي طاح', summary.today.failed > 0, String(summary.today.failed));
ok('ويفرّق بين المصادر', summary.today.admin > 0 && summary.today.telegram > 0,
  JSON.stringify({ admin: summary.today.admin, telegram: summary.today.telegram }));
ok('ويعطي آخر الأخطاء', summary.critical.length > 0 && summary.critical.every((e) => e.status === 'failed'));

/* ═══ 10. السجلّ ما يطيّحش الشغل ═════════════════════════════════ */
console.log('══ 10. التخزين يطيح، الطلب يكمّل ══');

/*
 * ⚠️ هذا هو الفحص اللي يخلّي التسجيل مقبول في الطريق الحرج: نعطيوه
 * مدخل يفجّرو (حقل يرمي كي يتقرا) ونشوفو واش يرجّع بلا ما يرمي.
 * لو `logEvent` ترمي، رفض طلب كان يولّي 500 على خاطر السجلّ برك.
 */
const survivor = await makeOrder();

const exploding = {
  get boom() { throw new Error('حقل يرمي كي يتقرا'); },
};
const blind = await logEvent({ action: 'test.write-fails', source: 'system', metadata: exploding });
ok('مدخل يفجّر: السجلّ يرجّع null بلا ما يرمي', blind === null);
ok('وما يكتبش سطر نصف مكتوب', (await listEvents({ action: 'test.write-fails' })).total === 0);

const stillWorks = await denyOrder(survivor.id, { by: 'محمد', source: 'admin', reason: 'فحص' });
ok('والقرار يكمّل عادي من بعد', stillWorks.ok === true, stillWorks.error ?? '');

/*
 * ⚠️ والحدث اللي يجي بعدو لازم يتكتب: فشل واحد ما يخلّيش السجلّ
 * ميّت للباقي — هاذي غلطة كلاسيكية في كاش/عميل يتحرق بعد أوّل خطأ.
 */
ok('والسجلّ يبقى يخدم بعد الفشل',
  Boolean(await logEvent({ action: 'test.after-failure', source: 'system' })));

/* ═══ 11. السجلّ ما يتبدّلش من اللوحة ════════════════════════════ */
console.log('══ 11. append-only ══');

const adminApi = await import(new URL('../../api/admin-api.mjs', import.meta.url).href);
const source = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../../api/admin-api.mjs', import.meta.url), 'utf8'));

ok('كاين أكشن قراية للسجلّ', source.includes("'logs.list'"));
ok('ما كاينش أكشن مسح', !source.includes("'logs.delete'") && !source.includes("'logs.clear'"));
ok('ما كاينش أكشن تعديل', !source.includes("'logs.update'") && !source.includes("'logs.edit'"));
ok('الفنكشن تتصدّر عادي', typeof adminApi.default === 'function');

redis.stop();
