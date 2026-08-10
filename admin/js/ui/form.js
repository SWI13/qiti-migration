/* ==========================================================================
   Qiti admin — تحقّق الفورم + حماية التغييرات
   جوج مشاكل قدام بعضهم:

   1. التحقّق: قبل، الحقل الغالط يتبعث للسيرفر ويرجع خطأ عام في توست —
      والمستخدم يبحث بيدو على مِن هو الحقل. دروك القاعدة تتحكم قبل
      البعث، والرسالة تقعد تحت الحقل روحو.

   2. التغييرات اللي ما تحفظوش: محرّر الحملة كامل يعيش في state.draft.
      ضغطة على رابط في الشريط الجانبي كانت تمسحو بلا سؤال. markClean/
      isDirty يخلّيو الصفحة تعرف واش راه يتبدّل، وconfirmDiscard تسأل.

   ⚠️ حارس beforeunload يمسك غير الخروج الحقيقي من الصفحة (F5، تسكير
   التبويب). التنقّل داخل اللوحة بالـ hash ما يمرّش عليه — الصفحة اللي
   عندها محرّر لازمها تنادي confirmDiscard() بيدها في معالج التنقّل تاعها.
   ========================================================================== */
import { getPath } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from './icon.js';
import { confirmDialog } from './dialog.js';

var SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ── 1. التحقّق ───────────────────────────────────────────────────────── */

/** فارغ = null/undefined/نص فاضي/مصفوفة خاوية. الصفر ماشي فارغ. */
function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** يرجّع رسالة الخطأ الأولى لهاذ القيمة، ولا null إذا مليحة */
function checkOne(value, rule) {
  if (rule.required && isEmpty(value)) return rule.message || t('validation.required');
  /* حقل فارغ وماشي إجباري = ما نكمّلوش. بلا هاذ الخروج، maxLength ولا
     positiveNumber يطيّحو كل حقل اختياري خلّاه المستخدم خاوي. */
  if (isEmpty(value)) return null;

  if (rule.maxLength != null && String(value).length > rule.maxLength) {
    return rule.message || t('validation.maxLength', { max: rule.maxLength });
  }
  if (rule.positiveNumber && !(Number(value) > 0)) {
    return rule.message || t('validation.positiveNumber');
  }
  if (rule.min != null && !(Number(value) >= rule.min)) {
    return rule.message || t('validation.min', { min: rule.min });
  }
  if (rule.max != null && !(Number(value) <= rule.max)) {
    return rule.message || t('validation.max', { max: rule.max });
  }
  if (rule.slug && !SLUG_RE.test(String(value))) {
    return rule.message || t('validation.slug');
  }
  if (rule.pattern) {
    var re = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern);
    if (!re.test(String(value))) return rule.message || t('validation.pattern');
  }
  return null;
}

/**
 * validate(values, rules) → { ok, errors }
 *   values: الكائن كامل (state.product مثلاً)
 *   rules:  { 'مسار.في.الكائن': { required, min, max, maxLength, pattern,
 *                                 slug, positiveNumber, message } }
 *   errors: { 'المسار': 'الرسالة' } — قاعدة وحدة برك لكل مسار (الأولى
 *           اللي طاحت). عرض ثلاث أخطاء على نفس الحقل ما يزيد والو.
 * المسارات هي نفسها اللي في data-path — showErrors() تلقى الحقل بيها
 * مباشرةً بلا خريطة زايدة.
 */
export function validate(values, rules) {
  var errors = {};
  var ok = true;
  Object.keys(rules || {}).forEach(function (path) {
    var message = checkOne(getPath(values, path), rules[path] || {});
    if (message) { errors[path] = message; ok = false; }
  });
  return { ok: ok, errors: errors };
}

/* ── 2. رسم الأخطاء على الـ DOM ──────────────────────────────────────── */

function fieldOf(input) {
  return input.closest('.field') || input.parentElement;
}

/** clearErrors(rootEl) — يمسح كل أثر تحقّق سابق جوّا rootEl */
export function clearErrors(rootEl) {
  if (!rootEl) return;
  Array.prototype.forEach.call(rootEl.querySelectorAll('.field__error'), function (node) { node.remove(); });
  Array.prototype.forEach.call(rootEl.querySelectorAll('.field--invalid'), function (node) {
    node.classList.remove('field--invalid');
  });
  Array.prototype.forEach.call(rootEl.querySelectorAll('[aria-invalid="true"]'), function (node) {
    node.removeAttribute('aria-invalid');
    node.removeAttribute('aria-describedby');
  });
}

/**
 * showErrors(rootEl, errors) → عدد الحقول اللي تعلّمت
 * يمسح القديم أوّلاً، من بعد يعلّم كل حقل عندو data-path موافق، ويزحلق
 * ويعطي الفوكس للأوّل. المسار اللي ما لقيناش لو حقل (مثلاً حقل جوّا
 * تبويب مطوي) ما يطيّحش العملية — الرسالة تضيع بصح الحفظ يبقى موقوف،
 * وهذا أحسن من استثناء يقطع الرندر.
 */
export function showErrors(rootEl, errors) {
  clearErrors(rootEl);
  if (!rootEl || !errors) return 0;

  var first = null;
  var marked = 0;

  Object.keys(errors).forEach(function (path) {
    var input = rootEl.querySelector('[data-path="' + path + '"]');
    if (!input) return;
    var field = fieldOf(input);
    if (!field) return;

    var errId = 'err_' + path.replace(/[^\w]/g, '_');
    field.classList.add('field--invalid');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errId);

    var note = document.createElement('div');
    note.className = 'field__error';
    note.id = errId;
    note.innerHTML = icon('alert') + '<span></span>';
    note.querySelector('span').textContent = errors[path];
    field.appendChild(note);

    marked++;
    if (!first) first = input;
  });

  if (first) {
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return marked;
}

/* ── 3. تتبّع التغييرات ──────────────────────────────────────────────── */

/* نسخة JSON تاع آخر حالة محفوظة. null = ما ثمّاش محرّر مفتوح. */
var cleanJson = null;
var readCurrent = null;

/* JSON.stringify يكفي: الكائن هو هو (يتبدّل في بلاصتو بـ setPath)، فترتيب
   المفاتيح ثابت. مفتاح جديد يبان في النص = تبديل حقيقي على كل حال. */
function snap(value) {
  try { return JSON.stringify(value); } catch (error) { return null; }
}

/**
 * markClean(snapshot, getCurrent)
 * تتنادى مرّتين: كي يتفتح المحرّر، وبعد كل حفظ ناجح.
 * getCurrent دالة ترجّع الكائن الحيّ — ضرورية باش حارس beforeunload
 * يقدر يقارن وحدو (ما عندوش وسائط).
 */
export function markClean(snapshot, getCurrent) {
  cleanJson = snap(snapshot);
  if (typeof getCurrent === 'function') readCurrent = getCurrent;
}

/**
 * clearDirty() — ينسى كلشي. لازم تتنادى كي تخرج من المحرّر، وإلا الحارس
 * يبقى يقارن كائن ماشي معروض ويسأل في صفحة ما فيها والو.
 */
export function clearDirty() {
  cleanJson = null;
  readCurrent = null;
}

/** isDirty(current) — بلا وسيط، يقرا من getCurrent اللي عطيتيها لـ markClean */
export function isDirty(current) {
  if (cleanJson == null) return false;
  var value = arguments.length ? current : (readCurrent ? readCurrent() : null);
  return snap(value) !== cleanJson;
}

/**
 * confirmDiscard(current) → Promise<boolean>
 * true = كمّل (ما كانش تبديل، ولا المستخدم قبل يضيّعو).
 * ما تمسحش الحالة وحدها — الطالب هو اللي يقرّر واش يدير بعد "true".
 */
export function confirmDiscard(current) {
  if (!(arguments.length ? isDirty(current) : isDirty())) return Promise.resolve(true);
  return confirmDialog({
    title: t('unsaved.title'),
    body: t('unsaved.body'),
    confirmLabel: t('unsaved.discard'),
    danger: true,
  });
}

/* الحارس. المتصفّحات الحديثة تعرض نصّها هي، فالرسالة تاعنا ما تبانش —
   المهمّ هو preventDefault(). يتسجّل مرّة وحدة وقت الاستيراد: ما يدير
   والو حتى تنادى markClean() بـ getCurrent. */
window.addEventListener('beforeunload', function (event) {
  if (!readCurrent || !isDirty()) return;
  event.preventDefault();
  event.returnValue = '';
});
