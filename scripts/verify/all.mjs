/*
 * يشغّل كل سكريبتات التحقّق ويعدّ النجاحات.
 *
 *   npm run verify
 *
 * كل سكريبت يخدم وحدو تاني (node scripts/verify/integration.mjs) —
 * هذا غير باش تشوف كلش دفعة وحدة قبل ما تدفع.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

/* ملفات مساعدة، ماشي سويتات — تتستورد من غيرها وما تخرجش PASS/FAIL */
const HELPERS = new Set(['all.mjs', 'fake-redis.mjs']);

const suites = readdirSync(here)
  .filter((name) => name.endsWith('.mjs') && !HELPERS.has(name))
  .sort();

/* فحص تغطية حقول اللوحة يعيش برّا verify/ — بصح لازم يجري معاهم */
const extra = [join('scripts', 'check-admin-fields.mjs')];

let failed = 0;
let passes = 0;

const run = (label, file) => {
  const result = spawnSync(process.execPath, [file], { cwd: repo, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const ok = (output.match(/^(?:\[PASS\]|PASS|✓)/gm) ?? []).length;
  const bad = (output.match(/^(?:\[FAIL\]|FAIL|✗)/gm) ?? []).length;

  passes += ok;
  if (bad || result.status !== 0) {
    failed++;
    console.log(`✗ ${label} — ${ok} نجحو، ${bad} طاحو`);
    console.log(output.split('\n').filter((line) => /^(\[FAIL\]|FAIL|✗)/.test(line)).join('\n'));
  } else {
    console.log(`✓ ${label} — ${ok}`);
  }
};

for (const suite of suites) run(suite.replace('.mjs', ''), join(here, suite));
for (const file of extra) run(file.split(/[\\/]/).pop().replace('.mjs', ''), join(repo, file));

console.log(
  failed
    ? `\n${failed} سويت طاحت.`
    : `\nكلش مليح — ${passes} فحص، ولا واحد طاح.`,
);
process.exit(failed ? 1 : 0);
