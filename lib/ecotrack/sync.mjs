/*
 * المزامنة: نسحبو حالات الطرود ونمشّيو الطلبات معاها.
 *
 * ── علاش سحب وماشي webhook ─────────────────────────────────────────
 * قرينا وثيقتهم كاملة ونقاطهم الحيّة: ما كاينش نقطة webhook. فالمزامنة
 * تصرا كي نسألو احنا. ثلاث لحظات:
 *   • تقرير آخر النهار (كرون)
 *   • أمر /sync في تيليغرام
 *   • زرّ "زامن" في اللوحة
 *
 * ── علاش تمرّ على decisions.mjs ────────────────────────────────────
 * كي الطردة توصل، لازم يصرا نفس اللي يصرا في النقرة اليدوية: لقطة
 * التكاليف، Purchase لميتا، الرسالة تتعاود ترسم، والرجعة تنتظر
 * "استلمت" قبل ما ترجع للمخزون. طريق ثاني معناه حاجة تتنسى — فهاذ
 * الملف ما يكتبش الحالة بيدو، ينادي setDeliveryOutcome.
 */
import { listAwaitingDelivery, getCosts } from '../store.mjs';
import { getSettings } from '../settings.mjs';
import { setDeliveryOutcome } from '../decisions.mjs';
import { syncShipments, dueForRetry, sendShipment } from './shipments.mjs';
import { configured } from './client.mjs';
import { shipmentDelivered, shipmentReturned, shipmentCreated, shipmentError } from '../notify.mjs';

/**
 * يزامن كل الطرود اللي مازال ما وصلاتش.
 *
 * `actor` هو اللي يتسجّل كصاحب القرار — "الموصّل" باش تعرف من التاريخ
 * بلّي الحالة جات من عندهم ماشي من نقرة.
 */
export async function syncOpenShipments({ actor = 'الموصّل' } = {}) {
  if (!configured()) return { skipped: 'ecotrack not configured' };

  const orders = await listAwaitingDelivery().catch(() => []);
  if (!orders.length) return { ok: true, checked: 0, changed: 0, outcomes: 0 };

  const [costs, settings] = await Promise.all([
    getCosts().catch(() => null),
    getSettings().catch(() => null),
  ]);

  let outcomes = 0;

  const result = await syncShipments(orders, {
    async onOutcome(order, outcome) {
      /*
       * ⚠️ `source: 'carrier'` تفوت الحاجز اللي يمنع تعليم "وصلت"
       * بلا تأكيد الموصّل (شوف deliveryGate في decisions.mjs). هي
       * علامة داخلية، ماشي اسم: الاسم يقدر يتزوّر من تيليغرام،
       * وهاذي ما تخرج عمرها من هنا.
       */
      const decided = await setDeliveryOutcome(order.id, outcome, { by: actor, source: 'carrier' });
      if (!decided.ok) {
        console.error('Sync outcome failed:', decided.error, '| order:', order.id);
        return;
      }

      outcomes += 1;
      const final = decided.order;

      if (outcome === 'delivered') await shipmentDelivered(final, costs).catch(() => {});
      else await shipmentReturned(final, costs, settings).catch(() => {});
    },
  });

  return { ...result, outcomes };
}

/**
 * يعاود المحاولة على الطرود اللي طاحو ووقتهم حان.
 * الحدّ على المحاولات محسوب في sendShipment — هنا نختارو برك شكون حان وقتو.
 */
export async function retryFailedShipments({ by = 'إعادة تلقائية' } = {}) {
  if (!configured()) return { skipped: 'ecotrack not configured' };

  const orders = await listAwaitingDelivery().catch(() => []);
  const due = dueForRetry(orders);
  if (!due.length) return { ok: true, retried: 0, sent: 0 };

  let sent = 0;
  for (const order of due) {
    const result = await sendShipment(order.id, { by, source: 'cron' });
    if (result.ok) {
      sent += 1;
      await shipmentCreated(result.order).catch(() => {});
    } else {
      await shipmentError(result.order ?? order, { operation: 'إعادة إرسال الطردة', reason: result.error }).catch(() => {});
    }
  }

  return { ok: true, retried: due.length, sent };
}

/** المزامنة + إعادة المحاولة — اللي ينادي الكرون */
export async function runShipmentJobs() {
  const sync = await syncOpenShipments();
  const retry = await retryFailedShipments();
  return { sync, retry };
}
