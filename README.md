<div align="center">

# 🐈 Qiti

**Page builder for cash-on-delivery stores. API, admin dashboard, Telegram bot.**

[![live](https://img.shields.io/badge/live-qiti.vercel.app-FF6B2C?style=flat-square)](https://qiti.vercel.app)
[![deployed on Vercel](https://img.shields.io/badge/deployed%20on-Vercel-000000?style=flat-square&logo=vercel)](https://vercel.com)
![runtime dependencies](https://img.shields.io/badge/runtime%20deps-2-22C55E?style=flat-square)
![no framework](https://img.shields.io/badge/framework-none-D65C74?style=flat-square)
![checks](https://img.shields.io/badge/checks-118-C79A54?style=flat-square)

</div>

## What it is

I sell online in Algeria, where almost nobody pays with a card. The customer pays khlas, cash to the delivery guy, and she isn't going to make an account to do it. So this is built for that: pages in Darija, RTL, a form that asks for a wilaya and a commune, and a delivery price that changes with the wilaya.

There's no page file per product. A campaign points at a product, picks a theme and a list of sections, and takes a slug. The renderer builds the HTML when someone asks for it. Selling something else is a new row, not a new folder.

The first thing I put on it is a GPS collar for cats. That's what the screenshots show.

<div align="center">
<img src="docs/preview-hero.png" width="300" alt="Rendered storefront: product photo, live tracking card, price"> <img src="docs/preview-order.png" width="300" alt="Order section: name, phone, wilaya, delivery choice, quantity">
</div>

## How a page gets made

```
GET /toji-outfit
      │
      ▼
  route table          slug → campaign id
      │
      ▼
  campaign ─────────► product      price, options, variants, stock
      │                  │
      ▼                  ▼
  theme (~15 tokens)   sections[]  ── section registry ──► HTML
      │
      ▼
  layout               head, SEO, footer
```

Every path falls through to `api/render` (the rewrites are in `vercel.json`), so publishing a page doesn't need a deploy. Hit save in the admin and the next request has it.

Ten section types: `hero`, `trust`, `features`, `how`, `lifestyle`, `gallery`, `reviews`, `faq`, `cta`, `order`. Only `order` deals with money, and it reads the price and the variants off the product, never off the campaign. New campaigns start with a section order picked from the product type (`pet`, `clothing`, `auto`, `tech`, `life`) and you drag from there.

Themes are about fifteen tokens: colors, radius, font. Not free CSS. I tried free CSS first and every campaign turned into its own little stylesheet nobody wanted to maintain.

## API

One file per route in `api/`, no router.

| Route | What it does |
|---|---|
| `api/render` | renders any public path: campaigns, products, categories |
| `api/order` | takes an order, stores it, pings Telegram |
| `api/lead` | saves an abandoned form once the phone number looks real |
| `api/telegram-webhook` | accept/decline taps, `/stock`, `/cost`, product creation from a sentence |
| `api/admin-api` | one authenticated POST behind the whole dashboard |
| `api/admin-login` | password, then a code over Telegram |
| `api/media-upload`, `api/media-serve` | image upload (magic bytes checked) and delivery |
| `api/track` | visit counters |
| `api/daily-report`, `api/weekly-report` | cron reports at midnight and on Mondays |

Storage goes through `getStore()` in `lib/blobs.mjs`: Upstash Redis for data, Vercel Blob for images. Delivery prices for the 58 wilayas sit in `lib/shipping-rates.mjs` and get injected into the static page at build time, so local and deployed can't quote different numbers.

## Admin

`/admin`. Single page, hash routing, one `api()` call per action. The forms aren't written field by field, they're generated from a recipe, and `npm run verify` fails if a section has a field the recipe doesn't.

Login is password plus a 6-digit code the bot sends you. Signed cookie after that, 7 days.

<img src="docs/admin-dashboard.png" width="100%" alt="Admin dashboard: revenue, profit, orders, conversion, charts">

Dashboard: revenue, net profit after cost and ads, orders, average order value, units, customers, conversion. Then revenue vs pipeline, orders per day, sales by category, top products, live campaigns, low stock, last orders. It's one request, not six. Six round trips on a bad connection is a blank screen for two seconds.

<table>
<tr>
<td><img src="docs/admin-products.png" alt="Products list with price, type, status"></td>
<td><img src="docs/admin-campaigns.png" alt="Campaigns list with published and draft rows"></td>
</tr>
</table>

Products hold price, cost, options and per-variant stock, with the margin updating while you type. Campaigns can be created, duplicated, published, deleted, and the preview calls the same `renderSections`/`renderPage` the server does. A preview written separately drifts, and then you ship something you never saw.

Orders, categories and media are there too. The sidebar shows a badge with the pending order count.

Numbers in those shots are fake. There's no live store in the environment I take screenshots in.

## Telegram

Orders show up as a message with accept and decline buttons. Accept cuts stock and can fire a Meta CAPI purchase, decline gives it back. Commands only work in the chat set as `TELEGRAM_CHAT_ID`.

| Command | Does |
|---|---|
| `/state` | orders right now, instead of waiting for the midnight report |
| `/stock` | stock per product and variant |
| `/cost` | product cost, ad cost per order, return loss. No redeploy |
| `/leads` | people who started the form and left |
| `/block`, `/unblock`, `/blocked` | phone blocklist |
| `/clear` | wipes every order, asks twice first |

`/help` has the rest, including making a product or category out of a plain sentence.

If the bot stops responding, check the webhook before reading any code. `GET /api/telegram-webhook?setup` re-registers it and tells you what it set. That's been the problem nearly every time.

## Running it

```bash
npx vercel dev                          # pages + API + admin, like production
PORT=8888 node scripts/dev-server.mjs   # files brk, fastest when I'm only in the admin
npm run verify                          # 118 checks
npm run build                           # writes dist/, public files only
```

Deploy is Vercel, since `api/` needs to run somewhere. GitHub Pages can't host this.

```bash
npx vercel --prod
```

## Environment

Needs `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`. Upstash and Blob add their own when you connect them.

Optional: `SITE_URL`, Twilio (`TWILIO_*`) for SMS, Meta CAPI (`META_*`), trust check (`TKAWEN_*`). Skip one and that feature just doesn't run.

Without both `ADMIN_*` vars the admin locks everyone out, including you. Hash the password with:

```bash
node -e "console.log(require('node:crypto').createHash('sha256').update('yourpassword').digest('hex'))"
```

## Layout

```
index.html          static storefront for the first product
assets/             styles.css (everything goes through tokens) + main.js
admin/              dashboard
api/                one file per route
lib/                renderer, catalog, storage, telegram messages, analytics
  render/sections/  the ten section types
scripts/            build, rate injection, verify suite
docs/               screenshots for this page
```

`npm run build` copies `index.html`, `assets/` and `admin/` into `dist/` and nothing else. The list in `scripts/build.mjs` is an allowlist, so a new public file has to be added there or it won't ship. It used to be a blocklist and `lib/auth.mjs` was readable from the outside.

## Notes

The old Darija manual (design decisions, Telegram setup, per-wilaya prices, leads, trust check) isn't in the tree anymore, but it's in the history:

```bash
git show e922fd4:README.ar.md > README.ar.md
```

Most files in `api/` and `lib/` still start with a comment about why they're built the way they are. The browser JS (`assets/js/`, `admin/js/`) has no comments left in it, since every visitor downloads that.
