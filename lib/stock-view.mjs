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
 *
 * ⚠️ الرقم يجي من المنتج روحو (`serial`)، ماشي من مرتبتو في اللائحة.
 * قبل، كان يتحسب من الترتيب: تزيد منتج جديد يبدا بحرف قبلو، والأرقام
 * كامل تتزحلق — تعاود نفس الأمر اللي كتبتيه البارح وتزوّد سلعة أخرى.
 * دروك #3 يبقى #3 مهما زدت ولا بدّلت أسماء.
 *
 * المنتج اللي عندو فاريانتات ياخذ أرقام فرعية: 3.1, 3.2… الترتيب فيهم
 * هو ترتيب الفاريانتات تاع المنتج، وهو ثابت ما دامت الخيارات ما تبدّلوش.
 */
export async function stockTargets() {
  const products = await listProducts().catch(() => []);
  /* الترتيب للعرض برك — الرقم ما بقاش يتعلّق بيه */
  const sorted = products.slice().sort((a, b) =>
    (Number(a.serial) || Infinity) - (Number(b.serial) || Infinity)
    || String(a.name ?? '').localeCompare(String(b.name ?? '')));

  const targets = [];
  for (const product of sorted) {
    const rows = await listStockFor(product).catch(() => []);
    const serial = Number(product.serial) || null;

    rows.forEach(({ variant, stock }, position) => {
      targets.push({
        /* بلا رقم تسلسلي (منتج قديم قبل الهجرة) نرجعو للمرتبة — أحسن
           من سطر بلا رقم ما تقدرش تزوّدو */
        index: serial
          ? (rows.length > 1 ? `${serial}.${position + 1}` : String(serial))
          : String(targets.length + 1),
        serial,
        productId: product.id,
        productName: product.name || '—',
        sku: variant.sku,
        label: Object.keys(variant.options || {}).length
          ? Object.values(variant.options).join(' / ')
          : 'مفرد',
        stock,
      });
    });
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
      /* الرقم التسلسلي مع الاسم: هو اللي تكتبو في /restock، ونفسو
         اللي يبان حذا المنتج في اللوحة */
      const badge = target.serial ? `#${target.serial} ` : '';
      lines.push('', `<b>${badge}${esc(target.productName)}</b>`);
      lastProduct = target.productName;
    }
    const number = withIndexes ? `  <b>${esc(String(target.index))}</b>) ` : '  • ';
    lines.push(`${number}${esc(target.label)} — <b>${target.stock.qty}</b>${lowWarn(target.stock)}`);
  }

  if (targets.length > limit) lines.push('', `… و${targets.length - limit} فاريانت آخر — /stock`);

  return { lines, targets, legacy };
}
