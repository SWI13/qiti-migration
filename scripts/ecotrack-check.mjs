/*
 * فحص الربط مع ECOTRACK — بلا ما تخرج حتى طردة.
 *
 *   node --env-file=.env.local scripts/ecotrack-check.mjs
 *
 * واش يدير، بالترتيب:
 *   1. يتأكّد من التوكن
 *   2. يجيب الولايات، البلديات، والمكاتب ويعدّهم
 *   3. يخلق طردة تجريبية من طلب وهمي، يوريك الـ tracking
 *   4. يمسحها
 *
 * ⚠️ الطردة ما تخرجش للموصّل: الخروج يصرا غير مع `valid/order`، وهذا
 * السكريبت ما ينادوهاش أبداً. وإذا المسح طاح، يكتبلك الـ tracking باش
 * تمسحها بيدك من لوحة الموصّل.
 */
import {
  configured, validateToken, listWilayas, listCommunes, listDesks,
  createParcel, deleteParcel, parcelFor,
} from '../lib/ecotrack/client.mjs';

const line = (label, value) => console.log(`${label.padEnd(22)} ${value}`);

if (!configured()) {
  console.error('ECOTRACK_URL / ECOTRACK_TOKEN ماشي محطوطين.');
  console.error('حطّهم في .env.local (الملف مستثنى من git):');
  console.error('  ECOTRACK_URL=https://<الموصّل>.ecotrack.dz');
  console.error('  ECOTRACK_TOKEN=…');
  process.exit(1);
}

line('URL', process.env.ECOTRACK_URL);
line('token', `${process.env.ECOTRACK_TOKEN.slice(0, 4)}… (${process.env.ECOTRACK_TOKEN.length} حرف)`);
console.log();

/* 1. التوكن */
const auth = await validateToken();
if (auth.error) {
  console.error('❌ التوكن ما تقبلش:', auth.error);
  process.exit(1);
}
console.log('✅ التوكن صالح');

/* 2. الجداول */
const rows = (payload) => {
  const data = payload?.data;
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data?.data)) return data.data.length;
  return Object.keys(data ?? {}).length;
};

const [wilayas, communes, desks] = await Promise.all([listWilayas(), listCommunes(), listDesks()]);
for (const [label, payload] of [['الولايات', wilayas], ['البلديات', communes], ['المكاتب', desks]]) {
  if (payload.error) console.log(`⚠️  ${label}: ${payload.error}`);
  else line(label, rows(payload));
}
console.log();

/* 3. طردة تجريبية */
const fake = {
  id: `TEST-${Date.now().toString(36).toUpperCase()}`,
  name: 'Test Qiti',
  phone: '0555000000',
  wilaya: 'البليدة',
  commune: 'البليدة',
  shipping: 'home',
  total: 100,
  qty: 1,
  unitPrice: 100,
  productId: null,
  productName: 'TEST — لا ترسل',
};

const payload = parcelFor(fake);
console.log('جسم الطلب:');
console.log(JSON.stringify(payload, null, 2));
console.log();

const created = await createParcel(payload);
if (created.error) {
  console.error('❌ الخلق طاح:', created.error);
  process.exit(1);
}

const tracking = created.data?.tracking ?? created.data?.data?.tracking ?? null;
line('tracking', tracking ?? JSON.stringify(created.data));

/* 4. المسح */
if (!tracking) {
  console.error('⚠️  ما لقيناش tracking في الجواب — شوف لوحة الموصّل ولا تكون طردة معلّقة.');
  process.exit(1);
}

const removed = await deleteParcel(tracking);
if (removed.error) {
  console.error(`⚠️  المسح طاح (${removed.error}). امسح ${tracking} بيدك من لوحة الموصّل.`);
  process.exit(1);
}

console.log('🧹 الطردة التجريبية تمسحت');
console.log('\nالربط خدّام. الطردة عمرها ما خرجت — valid/order ما تنادتش.');
