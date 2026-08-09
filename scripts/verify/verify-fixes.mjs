import { pathToFileURL } from 'node:url';
const lib = (p) => import(new URL(`../../netlify/lib/${p}`, import.meta.url).href);

const { safeUrl } = await lib('render/html.mjs');
const { totalWith, totalFor, ownerMessage } = await lib('message.mjs');
const cat = await lib('catalog.mjs');

const ok = (l, p, x = '') => console.log(`${p ? 'PASS' : 'FAIL'}  ${l}${x ? '  — ' + x : ''}`);

console.log('══ safeUrl: protocol-relative ══');
ok('//evil.com rejected', safeUrl('//evil.com/pwn.jpg') === '#', safeUrl('//evil.com/pwn.jpg'));
ok('/assets still allowed', safeUrl('/assets/x.png') === '/assets/x.png');
ok('https still allowed', safeUrl('https://ok.com/a') === 'https://ok.com/a');
ok('#anchor still allowed', safeUrl('#order') === '#order');
ok('javascript: still rejected', safeUrl('javascript:alert(1)') === '#');

console.log('\n══ money: the 4000 DZD divergence ══');
/* المنتج اللي كان يتحسب 3900 مهما كانت سومتو */
const opts = [{ name: 'المقاس', values: ['S', 'M', 'L'] }];
const product = { id: 'prd_x', price: 5500, options: opts, variants: cat.buildVariants(opts) };
product.variants[2].priceDelta = 400;   /* L أغلى بـ 400 */

const order = { shipping: 'home', qty: 2 };
const variant = cat.matchVariant(product, { 'المقاس': 'L' });
const unit = cat.variantPrice(product, variant);
const server = totalWith(unit, order);
const browser = (5500 + 400) * 2 + 600;
console.log(`  unit price (5500 + 400 delta) = ${unit}`);
console.log(`  browser summary              = ${browser}`);
console.log(`  server totalWith             = ${server}`);
console.log(`  old totalFor (hardcoded)     = ${totalFor(order)}`);
ok('server now matches browser', server === browser, `${server} === ${browser}`);
ok('old path diverged by 4000', browser - totalFor(order) === 4000);

console.log('\n══ variant reaches the Telegram message ══');
const msg = ownerMessage({
  id: 'x', name: 'كريم', phone: '0661445566', wilaya: 'وهران', commune: 'السانيا',
  shipping: 'home', qty: 2, total: server, status: 'pending', createdAt: new Date().toISOString(),
  variant: { sku: variant.sku, options: variant.options },
});
ok('size shown to the owner', msg.includes('المقاس') && msg.includes('L'));
console.log('   line:', msg.split('\n').find((l) => l.includes('🏷️')));
const legacy = ownerMessage({
  id: 'y', name: 'قديم', phone: '0551112233', wilaya: 'الجزائر', commune: 'حي',
  shipping: 'desk', qty: 1, total: 4300, status: 'pending', createdAt: new Date().toISOString(),
});
ok('legacy order (no variant) has no empty line', !legacy.includes('🏷️'));

console.log('\n══ money validation ══');
for (const [input, shouldThrow] of [['3900 دج', true], ['abc', true], [NaN, true], [-5, true], [Infinity, true], [3900, false], ['4500', false]]) {
  let threw = false;
  try { await cat.saveProduct({ name: 'x', slug: 'x', price: input }); } catch (e) {
    threw = /must be a valid/.test(e.message);
    if (!threw) threw = false;
  }
  /* saveProduct يلمس التخزين، فالمهم هو واش رمى خطأ التحقّق قبل ما يوصل */
  ok(`price ${JSON.stringify(input)} ${shouldThrow ? 'rejected' : 'accepted'}`, threw === shouldThrow, threw ? 'threw' : 'passed validation');
}

console.log('\n══ variant option escaping in the message ══');
const evil = ownerMessage({
  id: 'z', name: 'x', phone: '0661445566', wilaya: 'و', commune: 'س',
  shipping: 'home', qty: 1, total: 1, status: 'pending', createdAt: new Date().toISOString(),
  variant: { sku: '0', options: { '<b>K</b>': '<script>a</script>' } },
});
ok('option name/value escaped', !evil.includes('<script>a') && evil.includes('&lt;script&gt;'));
