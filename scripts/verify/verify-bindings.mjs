/*
 * كل اسم يتنادى، واش راه معرَّف؟
 *
 * ── علاش هاذ الفحص موجود ───────────────────────────────────────────
 * `/ship` و`/sync` في الويبهوك كانو ينادو `sendShipment`,
 * `syncOpenShipments`, `retryFailedShipments`, `shipmentCreated` —
 * وحتى واحد منهم ما كان مستورد. الأمر يخدم؟ لا. يعطي خطأ؟ لا:
 *
 *   1. ESM وضع صارم: الاسم اللي ما تعرّفش يرمي ReferenceError وقت
 *      **التشغيل**، ماشي وقت التحليل. `node --check` يعدّي، والنشر
 *      يعدّي، والاستيراد روحو يعدّي — الملف يتحمّل مليح.
 *   2. الخطأ يطلع غير كي تتنقر الحاجة، وساعتها يطيح في try/catch
 *      الكبير تاع الويبهوك اللي يسجّل ويرجّع 200.
 *
 * فالمشغّل يكتب /sync ويجيه **سكات**. لا جواب، لا خطأ، لا علامة.
 * عطب كيما هذا يقدر يعيش شهور.
 *
 * ── الطريقة ────────────────────────────────────────────────────────
 * فحص ساكن خفيف بلا أي حزمة: نحيّدو النصوص والتعليقات، نجمعو كل اسم
 * يتنادى (`name(`) وما قبلو نقطة، ونطرحو منّو كل اسم معرَّف في الملف
 * (استيراد، const/let/var، function، class، وسائط) وكل اسم عام
 * معروف. اللي يبقى = نداء لاسم ما كاينش.
 *
 * ⚠️ الفحص تقريبي بقصد: يقرا اللي ينادى برك، ماشي كل مرجع. اللائحة
 * تحت (GLOBALS) هي الثمن — اسم عام جديد يتزاد فيها بيدك. هذا أرخص
 * بزّاف من إضافة مفكّك (parser) للمشروع، والعطب اللي يشدّو حقيقي.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

/* أسماء عامّة موجودة في وقت التشغيل — ماشي لازم تتعرّف في الملف */
const GLOBALS = new Set([
  'require', 'fetch', 'console', 'process', 'Buffer', 'URL', 'URLSearchParams',
  'Request', 'Response', 'Headers', 'AbortController', 'AbortSignal', 'TextEncoder', 'TextDecoder',
  'Promise', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'Map', 'Set',
  'Error', 'TypeError', 'RangeError', 'RegExp', 'Symbol', 'BigInt', 'Intl', 'WeakMap', 'WeakSet',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'globalThis', 'Function', 'Proxy', 'Reflect',
  /* كلمات مفتاحية تتبعها قوس — تبان كأنها نداء */
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'await', 'function', 'super', 'new',
  'do', 'else', 'yield', 'void', 'delete', 'in', 'of', 'instanceof', 'import', 'export', 'default',
  'const', 'let', 'var', 'class', 'extends', 'try', 'finally', 'throw', 'case', 'break', 'continue',
  /* `async (a) => …` — الكلمة تبان قبل قوس كيما نداء */
  'async',
  'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Float32Array', 'Float64Array',
  'ArrayBuffer', 'DataView', 'Blob', 'File', 'FormData', 'ReadableStream', 'crypto',
]);

/* يحيّد التعليقات والنصوص باش ما يتحسبوش ككود */
function stripNoise(source) {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const two = source.slice(i, i + 2);

    if (two === '//') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (two === '/*') {
      i += 2;
      while (i < n && source.slice(i, i + 2) !== '*/') i += 1;
      i += 2;
      continue;
    }

    const ch = source[i];

    /*
     * تعبير نمطي (regex literal). لازم يتحيّد وإلا اللي جواه يتقرا
     * ككود: `/(?:cost|bought)/` تبان فيها `bought(` كأنها نداء.
     *
     * التفريق بين `/` تاع القسمة و`/` تاع regex ما عندوش حلّ كامل بلا
     * مفكّك — نستعملو القاعدة المعروفة: regex تجي بعد عامل ولا فاصلة
     * ولا قوس فاتح، والقسمة تجي بعد قيمة.
     */
    if (ch === '/') {
      const before = out.replace(/\s+$/, '').slice(-1);
      const startsRegex = before === '' || '([,=:!&|?{};+-*%~^<>'.includes(before);
      if (startsRegex) {
        i += 1;
        let inClass = false;
        while (i < n) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '[') inClass = true;
          else if (source[i] === ']') inClass = false;
          else if (source[i] === '/' && !inClass) { i += 1; break; }
          else if (source[i] === '\n') break;   /* ماشي regex — نخرجو */
          i += 1;
        }
        while (i < n && /[a-z]/.test(source[i])) i += 1;   /* الرايات: giu… */
        out += ' ';
        continue;
      }
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) { i += 1; break; }
        /* داخل template: ${...} كود حقيقي، نخلّيوه */
        if (quote === '`' && source.slice(i, i + 2) === '${') {
          let depth = 1;
          i += 2;
          out += ' ';
          const start = i;
          while (i < n && depth > 0) {
            if (source[i] === '{') depth += 1;
            if (source[i] === '}') depth -= 1;
            i += 1;
          }
          out += stripNoise(source.slice(start, i - 1));
          continue;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/** كل اسم معرَّف في الملف: استيرادات، تصريحات، وسائط، ودوال */
function declaredNames(code) {
  const names = new Set();
  const add = (list) => {
    for (const raw of String(list).split(',')) {
      /* نشدّو الاسم الأوّل في كل قطعة: `a = 1`، `b: c`، `...rest` */
      const match = raw.match(/([A-Za-z_$][\w$]*)/g);
      if (!match) continue;
      /* في `{ a: b }` الاسم المربوط هو الثاني — نزيدو الزوج، أوسع من اللازم بصح آمن */
      for (const name of match) names.add(name);
    }
  };

  /* import { a, b as c } from '…' / import d from '…' / import * as e from '…' */
  for (const m of code.matchAll(/import\s+([^;]*?)\s+from/gs)) add(m[1].replace(/[{}*]/g, ' ').replace(/\bas\b/g, ','));
  /* const/let/var — مع التفكيك */
  for (const m of code.matchAll(/\b(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[A-Za-z_$][\w$]*)/g)) add(m[1].replace(/[{}[\]]/g, ' '));
  /* function name(args) / class Name */
  for (const m of code.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  /* وسائط: كل ما بين قوسين بعد function/=> — نزيدوهم كامل، تقريب آمن */
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) add(m[1].replace(/[{}[\]]/g, ' '));
  for (const m of code.matchAll(/\bfunction\s*\*?\s*[A-Za-z_$\w$]*\s*\(([^()]*)\)/g)) add(m[1].replace(/[{}[\]]/g, ' '));
  /* ميثود مختصرة في كائن: `async name(a, b) {` */
  for (const m of code.matchAll(/(?:^|[,{]\s*)(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*\{/gm)) {
    names.add(m[1]);
    add(m[2].replace(/[{}[\]]/g, ' '));
  }
  /* catch (err) */
  for (const m of code.matchAll(/\bcatch\s*\(([^()]*)\)/g)) add(m[1]);

  return names;
}

/** كل اسم يتنادى `name(` وما قبلوش نقطة */
function calledNames(code) {
  const names = new Set();
  for (const m of code.matchAll(/(^|[^\w$.?])([A-Za-z_$][\w$]*)\s*\(/gm)) names.add(m[2]);
  return names;
}

function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (entry.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const targets = [...filesUnder(join(repo, 'api')), ...filesUnder(join(repo, 'lib'))];

let bad = 0;
for (const file of targets) {
  const code = stripNoise(readFileSync(file, 'utf8'));
  const declared = declaredNames(code);
  const missing = [...calledNames(code)]
    .filter((name) => !declared.has(name) && !GLOBALS.has(name));

  const label = relative(repo, file).replace(/\\/g, '/');
  if (missing.length) {
    bad += 1;
    ok(`${label} — كل اسم يتنادى معرَّف`, false, `ناقص: ${missing.join(', ')}`);
  } else {
    ok(`${label} — كل اسم يتنادى معرَّف`, true);
  }
}

console.log(bad ? `\n${bad} ملف فيه نداء لاسم ما كاينش.` : `\n${targets.length} ملف، كل النداءات مربوطة.`);
process.exit(bad ? 1 : 0);
