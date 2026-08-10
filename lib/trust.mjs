/*
 * فحص الثقة (Trust API) — نسقسيو خدمة برّانية واش هذا الرقم عندو تاريخ
 * نصب/رفض عند تجّار آخرين، قبل ما تقرّر تبعث الطلبية.
 *
 * علاش يلزم: `customerHistory` في store.mjs يشوف **طلباتك انت برك**.
 * زبون رفض عند 5 تجّار آخرين ومنّك جديد، يبان عندك نظيف. هذي الخدمة
 * تسدّ هذيك الثقبة.
 *
 * ── قواعد مهمّة في التصميم ──────────────────────────────────────────
 * 1. **ما توقّف الطلب أبداً.** الزبون راهو مستنّى في الصفحة. إذا الخدمة
 *    طاحت ولا تأخّرت، نكمّلو بلاها — الطلب أهم من الفحص.
 * 2. **Timeout قصير** (4 ثواني). هذا الفحص في الطريق الحرج، ماشي كيما
 *    إشعار يقدر يتأخّر.
 * 3. **تنبيه، ماشي منع تلقائي.** النتيجة تبان في تيليغرام وانت تقرّر.
 *    أي نظام تنقيط عندو أخطاء، والزبون المرفوض بالغلط يضيع بالسكات.
 *
 * ⚠️ خصوصية: هذا يبعث رقم الزبون و IP تاعو لخدمة برّانية على كل طلب.
 * تأكّد بلّي هذا مكتوب في سياسة الخصوصية تاعك (قانون 18-05).
 *
 * ── environment variables (اختيارية — بلاهم الفحص ما يخدمش) ─────────
 *   TKAWEN_API_KEY   — المفتاح (tkw_live_...) — **سرّي**
 *   TKAWEN_API_URL   — اختياري، إذا حبيت تبدّل الرابط (sandbox مثلاً)
 */

const DEFAULT_ENDPOINT = 'https://trust.tkawen.com/v1/check';
/* قصير قصداً: الزبون مستنّى، ما نخلّوهش يستنّى على فحص */
const REQUEST_TIMEOUT_MS = 4_000;

/*
 * الرموز حسب التصنيف. ما نفرضوش قائمة مغلقة — إذا الخدمة زادت tier
 * جديد ما نعرفوهش، يبان كيما هو بعلامة محايدة بدل ما يطيح الكود.
 */
const TIER_ICON = {
  /* التصنيفات المذكورة في موقع tkawen: trusted / cautious / high-risk */
  trusted: '✅',
  low: '✅',
  cautious: '⚠️',
  caution: '⚠️',
  'حذر': '⚠️',
  neutral: 'ℹ️',
  medium: '⚠️',
  risky: '⚠️',
  'high-risk': '🚫',
  high_risk: '🚫',
  highrisk: '🚫',
  high: '🚫',
  'مرتفع المخاطر': '🚫',
  blocked: '🚫',
  fraud: '🚫',
};

export const tierIcon = (tier) => TIER_ICON[String(tier ?? '').toLowerCase()] ?? 'ℹ️';

/* نفس المنطق: نترجمو اللي نعرفوه، واللي ما نعرفوهش يبان كيما جا */
const TIER_LABEL = {
  trusted: 'موثوق',
  low: 'خطر ضعيف',
  cautious: 'حذر',
  caution: 'حذر',
  neutral: 'عادي',
  medium: 'خطر متوسّط',
  risky: 'خطر',
  'high-risk': 'مرتفع المخاطر',
  high_risk: 'مرتفع المخاطر',
  highrisk: 'مرتفع المخاطر',
  high: 'خطر عالي',
  blocked: 'محظور',
  fraud: 'نصّاب',
};

export const tierLabel = (tier) => TIER_LABEL[String(tier ?? '').toLowerCase()] ?? String(tier ?? 'ما نعرفوش');

/** واش هذي النتيجة تستاهل انتباهك؟ (نبيّنو العوامل غير في هذي الحالة) */
export const isRisky = (trust) =>
  Boolean(trust) && (tierIcon(trust.tier) !== '✅' || (trust.score ?? 0) >= 0.4);

/** الرقم بصيغة E.164 كيما تحبّها الخدمة: +213555123456 */
const toE164 = (localPhone) => `+213${String(localPhone).replace(/\D/g, '').replace(/^0/, '')}`;

/**
 * IP تاع الزبون. Netlify يحطّو في header خاص بيه؛ نرجعو لـ x-forwarded-for
 * إذا ما كانش (أوّل واحد في القائمة هو الزبون، الباقي proxies).
 */
export function clientIp(request) {
  const direct = request.headers.get('x-nf-client-connection-ip');
  if (direct) return direct;

  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : null;
}

/**
 * يفحص الرقم. **ما يرمي خطأ عمرو** — يرجع null إذا ما خدمش (ماشي مضبوط،
 * الخدمة طاحت، timeout...). الجالب يكمّل عادي بـ null.
 */
export async function checkTrust({ phone, wilayaId, orderValue, ip }) {
  const apiKey = process.env.TKAWEN_API_KEY;
  if (!apiKey) return null;   /* ماشي مفعّل — عادي */

  const endpoint = process.env.TKAWEN_API_URL ?? DEFAULT_ENDPOINT;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        phone: toE164(phone),
        ...(wilayaId ? { wilaya_id: wilayaId } : {}),
        ...(orderValue ? { order_value: orderValue } : {}),
        ...(ip ? { ip } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`Trust check failed: HTTP ${response.status}`);
      return null;
    }

    const body = await response.json().catch(() => null);
    if (!body || typeof body !== 'object') return null;

    /*
     * ناخذو غير اللي نحتاجوه ونتحقّقو من الأنواع — الجواب جاي من خدمة
     * برّانية، ما نثقوش فيه على عمياني ونخزّنوه كيما جا.
     */
    return {
      score: typeof body.score === 'number' ? body.score : null,
      tier: typeof body.tier === 'string' ? body.tier.slice(0, 32) : null,
      factors: Array.isArray(body.factors)
        ? body.factors
            .filter((f) => f && typeof f.name === 'string')
            .slice(0, 5)
            .map((f) => ({
              name: f.name.slice(0, 40),
              weight: typeof f.weight === 'number' ? f.weight : null,
            }))
        : [],
      requestId: typeof body.request_id === 'string' ? body.request_id.slice(0, 64) : null,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Trust check error:', error.message);
    return null;
  }
}
