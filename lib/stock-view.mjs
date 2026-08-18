/*
 * عرض المخزون — مصدر واحد لأي بلاصة تعرض الكميات.
 *
 * ── علاش موجود ──────────────────────────────────────────────────────
 * المخزون يسكن في زوج بلايص، وهذا مقصود: عدّاد عام قديم (الصفحة
 * الستاتيك تاع الطوق مازالت تخدم عليه، شوف orderStockRef في store.mjs)،
 * وعدّاد لكل فاريانت تاع كل منتج. `/stock` كان يعرض الزوج، والتقرير
 * اليومي كان يعرض العدّاد العام برك ويسمّيه "المخزون الحالي".
 *
 * النتيجة: التقرير يقول 1 و`/stock` يقول 4، والزوج صحاح — كل واحد
 * يعدّ حاجة أخرى. رقمين مختلفين بنفس الاسم = ما تعرفش على واش تعتمد،
 * وتطلب سلعة عندك ولا تبيع سلعة ما عندكش.
 *
 * دروك الزوج يقراو من هنا. يبدّل الشكل مرّة وحدة، ويبقاو متّفقين.
 */
import { getStock } from './store.mjs';
import { listProducts, listStockFor } from './catalog.mjs';
import { esc } from './message.mjs';

/*
 * كل عدّاد فاريانت مع رقمو. الرقم هو اللي يستعملو المشغّل في
 * `/restock 3 10` — بلاه ما كانش كيفاش تسمّي فاريانت في رسالة تيليغرام.
 */
export async function stockTargets() {
  const products = await listProducts().catch(() => []);
  const sorted = products.slice().sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? '')) || String(a.id).localeCompare(String(b.id)));

  const targets = [];
  for (const product of sorted) {
    const rows = await listStockFor(product).catch(() => []);
    for (const { variant, stock } of rows) {
      targets.push({
        index: targets.length + 1,
        productId: product.id,
        productName: product.name || '—',
        sku: variant.sku,
        label: Object.keys(variant.options || {}).length
          ? Object.values(variant.options).join(' / ')
          : 'مفرد',
        stock,
      });
    }
  }
  return targets;
}

const lowWarn = (stock) => (stock.qty <= stock.threshold ? ' ⚠️' : '');

/*
 * أسطر المخزون كيما تبان في تيليغرام.
 *
 * `withIndexes` — أرقام `/restock`. `/stock` يحبها، التقرير لا: التقرير
 * قراية، والرقم فيه يغري بأمر ما ينفعش من تمّ.
 * `limit` — التقرير يتقص بعد عدد معيّن باش ما يولّيش لائحة جرد كاملة كل
 * ليلة؛ `/stock` يعرض كلش (هو غرضو).
 */
export async function stockLines({ withIndexes = true, limit = Infinity } = {}) {
  const [legacy, targets] = await Promise.all([getStock(), stockTargets()]);
  const lines = [];

  /*
   * العدّاد العام يبان غير إذا فيه شي حاجة — ولا إذا ما كانش حتى منتج
   * (وقتها هو المخزون كامل). عرضو فارغ حذا المنتجات يخلّط بلا فايدة.
   */
  if (legacy.qty > 0 || !targets.length) {
    lines.push(`📦 <b>${legacy.qty}</b>${lowWarn(legacy)}  (المخزون العام · حد التنبيه ${legacy.threshold})`);
  }

  let lastProduct = null;
  for (const target of targets.slice(0, limit)) {
    if (target.productName !== lastProduct) {
      lines.push('', `<b>${esc(target.productName)}</b>`);
      lastProduct = target.productName;
    }
    const number = withIndexes ? `  <b>${target.index}</b>) ` : '  • ';
    lines.push(`${number}${esc(target.label)} — <b>${target.stock.qty}</b>${lowWarn(target.stock)}`);
  }

  if (targets.length > limit) lines.push('', `… و${targets.length - limit} فاريانت آخر — /stock`);

  return { lines, targets, legacy };
}
