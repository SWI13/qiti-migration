/*
 * جسر بين توقيع Vercel وتوقيع الويب.
 *
 * ⚠️ هذا هو الفرق اللي طيّح أوّل نشر. الفنكشنات مكتوبة بتوقيع الويب
 * المعياري — `handler(request: Request) → Response` — وهو اللي كان
 * يعطيه Netlify. Vercel في مجلّد api/ ينادي بتوقيع Node:
 * `handler(req, res)` مع كائنات IncomingMessage/ServerResponse.
 *
 * النتيجة: `new URL(request.url)` في أوّل سطر تلقى `/api/render`
 * (مسار نسبي، ماشي رابط كامل) وترمي TypeError برّا أي try — فالمنصّة
 * ترجّع FUNCTION_INVOCATION_FAILED بلا حتى لوغ مفهوم.
 *
 * بدل ما نعاودو نكتبو 10 فنكشنات، نلفّوهم: toVercel() تبني Request
 * حقيقي من كائن Node، تنادي الهاندلر كيما هو، وتفرّغ الـ Response
 * في res. الهاندلرات ما تتبدّلش ولا سطر، ويبقاو قابلين للاختبار
 * بـ Request عادي.
 */

/*
 * الرابط الكامل — Request يلزمو absolute، وreq.url عند Node نسبي.
 * البروتوكول ماشي تفصيل: render.mjs يبني منّو origin تاع الروابط
 * الكانونية وOG، فـ https مفروضة على الجاف تعطي روابط غالطة محلّياً.
 * الترتيب: x-forwarded-proto (Vercel ديما يحطّها) ← واش الاتصال
 * مشفّر ← http.
 */
function absoluteUrl(req) {
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = forwarded
    ? String(forwarded).split(',')[0].trim()
    : (req.socket?.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}${req.url}`;
}

function headersFrom(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    /* set-cookie يجي مصفوفة — كل واحد يتزاد وحدو */
    if (Array.isArray(value)) for (const one of value) headers.append(key, one);
    else headers.set(key, value);
  }
  return headers;
}

function bodyOf(req) {
  /* GET/HEAD ما عندهمش جسم — وRequest يرمي إذا عطيتيه واحد */
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined);

  /* Vercel يقدر يكون فكّ الجسم قبلنا (req.body). كي يصرا، الستريم
     يكون مقروء خلاص وقراية ثانية تعلّق للأبد — وهذا كان سبب الطلبات
     اللي تبقى 60 ثانية بلا جواب. */
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    return Promise.resolve(JSON.stringify(req.body));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function send(res, response) {
  if (!response) { res.statusCode = 500; res.end('Empty response'); return; }

  res.statusCode = response.status;

  /* getSetCookie() يرجّع كل الكوكيز وحدة وحدة. بلاها، هيدرات
     Set-Cookie المتعدّدة تتلزق في سطر واحد والمتصفّح يرمي الزايد. */
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  if (setCookies.length) res.setHeader('set-cookie', setCookies);

  if (!response.body) { res.end(); return; }
  res.end(Buffer.from(await response.arrayBuffer()));
}

/**
 * toVercel(handler) → دالة يفهمها Vercel
 * handler: (request: Request) => Response | Promise<Response>
 */
export function toVercel(handler) {
  return async function vercelEntry(req, res) {
    /* لو المنصّة نادت بتوقيع الويب (Request وحدو، بلا res) نعدّيو
       مباشرةً — نفس الملف يخدم في الزوج بلا شرط في كل هاندلر */
    if (!res && req && typeof req.headers?.get === 'function') return handler(req);

    try {
      const request = new Request(absoluteUrl(req), {
        method: req.method,
        headers: headersFrom(req),
        body: await bodyOf(req),
      });
      await send(res, await handler(request));
    } catch (error) {
      console.error('handler failed:', error?.stack || error?.message || error);
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'server error' }));
    }
  };
}
