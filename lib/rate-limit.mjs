/*
 * تحديد المعدّل على النقاط المفتوحة للعالم.
 *
 * ── علاش لازم ──────────────────────────────────────────────────────
 * `api/order` ما تطلب لا دخول لا مفتاح — وهذا صحيح، الزبونة ما تدير
 * حساب باش تشري. بصح كل نداء عليها: يكتب في Redis، يبعث رسالة
 * تيليغرام، يبعث حدث لميتا، ويسأل خدمة الثقة. سكريبت تاع عشرة أسطر
 * يقدر:
 *
 *   • يغرق الگروب بمئات الطلبات المزوّرة — والطلبات الحقيقية تضيع
 *     بيناتهم، وهذا وحدو يوقّف المحل
 *   • ياكل حصّة Upstash وحصّة تيليغرام
 *   • يخلّط أرقام التحويل بحوادث Lead كاذبة
 *
 * فخّ البوتات (الحقل المخبّي) يشدّ الزحف الغبي برك — واحد يشوف
 * الفورم مرّة وحدة يعدّيه.
 *
 * ── الشكل ──────────────────────────────────────────────────────────
 * نافذة ثابتة بعدّاد ذرّي (INCR + EXPIRE في رحلة وحدة). ماشي أدقّ
 * خوارزمية موجودة — النافذة المنزلقة أنضف — بصح هاذي رحلة وحدة على
 * Redis وما تحتاج لا حالة لا تنظيف. على محل يبيع بالدفع عند الاستلام،
 * الفرق بين "20 في الساعة" و"20 في أي 60 دقيقة متحرّكة" ما يهمّ حتى
 * واحد.
 *
 * ── فشل مفتوح، ماشي مغلق ───────────────────────────────────────────
 * ⚠️ Redis يطيح؟ نخلّيو الطلب يعدّي. هاذي عكس قاعدة المصادقة (تمّة
 * فشل مغلق)، وبقصد: هنا ما نحميوش سرّ، نحميو من الضجيج. تخزين طايح
 * يخلّي المحل ما يبيعش — وهاذي خسارة أكبر بزّاف من دفعة طلبات مزوّرة.
 */
import { getStore } from './blobs.mjs';

const STORE = 'rate-limits';
const store = () => getStore(STORE);

/*
 * الحدود. الأرقام مختارة باش الزبونة الحقيقية عمرها ما تلقاهم:
 *
 *   order   — 6 طلبات في الساعة من نفس الـ IP. العائلة كاملة تطلب من
 *             نفس الويفي وما توصلش لستّة.
 *   phone   — 3 طلبات في الساعة على نفس الرقم. الزبونة اللي تعاود
 *             على خاطر ما شافتش شاشة النجاح تدير زوج، ماشي أربعة.
 *   lead    — 20 في الساعة: الفورم يبعث lead على كل تبديل رقم، فالحدّ
 *             لازم يكون أوسع من تاع الطلب بزّاف.
 *   upsell  — 10 في الساعة.
 */
export const LIMITS = {
  order: { limit: 6, windowSeconds: 3600 },
  'order-phone': { limit: 3, windowSeconds: 3600 },
  lead: { limit: 20, windowSeconds: 3600 },
  upsell: { limit: 10, windowSeconds: 3600 },
};

/**
 * يزيد العدّاد ويقول واش هاذ النداء فات الحدّ.
 *
 * يرجّع `{ allowed, count, limit, retryAfter }`. `allowed:false` معناها
 * وقّف — والنادي هو اللي يقرّر شكل الجواب (429 مع Retry-After).
 */
export async function hit(bucket, identity, now = new Date()) {
  const rule = LIMITS[bucket];
  if (!rule || !identity) return { allowed: true, count: 0, limit: rule?.limit ?? 0, retryAfter: 0 };

  /* النافذة في المفتاح روحو: كل نافذة عندها عدّادها، وتموت وحدها بالـ
     TTL. بلا هذا نحتاجو نمسحو العدّادات القدام بيدنا. */
  const window = Math.floor(now.getTime() / (rule.windowSeconds * 1000));
  const key = `${bucket}:${window}:${identity}`;

  try {
    const count = await store().incrWithTtl(key, rule.windowSeconds);
    const allowed = count <= rule.limit;
    /* الوقت الباقي للنافذة الحالية — نعطيوه للزبون في Retry-After */
    const retryAfter = allowed
      ? 0
      : Math.max(1, Math.ceil(((window + 1) * rule.windowSeconds * 1000 - now.getTime()) / 1000));
    return { allowed, count, limit: rule.limit, retryAfter };
  } catch (error) {
    console.error('Rate limit check failed, allowing through:', error.message, '| bucket:', bucket);
    return { allowed: true, count: 0, limit: rule.limit, retryAfter: 0 };
  }
}

/**
 * الـ IP تاع الزبون وراء بروكسي Vercel.
 *
 * ⚠️ `x-forwarded-for` تقدر تتزوّر من الزبون، بصح Vercel يكتب فوقها
 * بالـ IP الحقيقي تاع الوصلة قبل ما توصل للفنكشن — فأوّل قيمة فيها
 * هي اللي نثقو فيها. `x-real-ip` احتياط للتشغيل المحلّي.
 */
export function requestIp(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-for');
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return request?.headers?.get?.('x-real-ip') ?? null;
}

/** جواب 429 موحّد — رسالة للزبونة بالدارجة، ماشي نص تقني */
export const tooManyRequests = (retryAfter, message = 'حاولت بزّاف. استنّى شوية وعاود.') =>
  new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(retryAfter ? { 'retry-after': String(retryAfter) } : {}),
    },
  });
