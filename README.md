<div align="center">

# 🐈 Qiti

**An ecommerce page builder for cash-on-delivery stores — API, admin, and a Telegram bot for the day-to-day.**

Campaign pages are data, not files. Write a product, pick sections, publish a slug — the renderer builds the page on request, the order lands in Telegram, and the stock moves by itself.

[![live](https://img.shields.io/badge/live-qiti.vercel.app-FF6B2C?style=flat-square)](https://qiti.vercel.app)
[![deployed on Vercel](https://img.shields.io/badge/deployed%20on-Vercel-000000?style=flat-square&logo=vercel)](https://vercel.com)
![runtime dependencies](https://img.shields.io/badge/runtime%20deps-2-22C55E?style=flat-square)
![no framework](https://img.shields.io/badge/framework-none-D65C74?style=flat-square)
![checks](https://img.shields.io/badge/checks-118-C79A54?style=flat-square)

</div>

---

## What it is

A small store engine, built for how things are actually bought in Algeria: no card, no account, no wallet — the customer pays khlas, cash in her hand, when the delivery guy knocks. Everything else follows from that. The page is in Darija and right-to-left. The form asks for a wilaya and a commune, and the delivery price changes with it. Nobody signs up for anything.

There is no page-per-product. A **campaign** points at a **product**, picks a theme and a list of **sections**, and claims a slug; the renderer turns that into HTML on request. Adding a second store means adding a row, not a folder.

The first store on it sells a GPS collar for cats — that is the page in the screenshots.

<div align="center">
<img src="docs/preview-hero.png" width="300" alt="A rendered storefront: product photo, live tracking card, price"> <img src="docs/preview-order.png" width="300" alt="The order section: name, phone, wilaya, delivery choice, quantity">
</div>

## How a request becomes a page

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

Every path falls through to `api/render` (see the rewrites in `vercel.json`), so a new page needs no deploy — publish it from the admin and it answers on the next request.

**Ten section types** — `hero`, `trust`, `features`, `how`, `lifestyle`, `gallery`, `reviews`, `faq`, `cta`, and `order`, the only one that touches money: it reads price, options, and variants from the product, never from the campaign. A new campaign starts from a default section order chosen by product type (`pet`, `clothing`, `auto`, `tech`, `life`), then you rearrange.

**Themes are tokens, not CSS.** A campaign can set around fifteen values — colors, radius, font — and nothing else. Free CSS per campaign is a promise you cannot keep once there are twenty of them.

## The API

Every file in `api/` is a route. No router, no framework.

| Route | What it does |
|---|---|
| `api/render` | renders any public path — campaigns, products, categories |
| `api/order` | takes an order, stores it, pings Telegram |
| `api/lead` | captures an abandoned form once the phone number is valid |
| `api/telegram-webhook` | accept/decline taps, `/stock`, `/cost`, product creation from a sentence |
| `api/admin-api` | one authenticated POST endpoint behind the whole dashboard |
| `api/admin-login` | password, then a code sent over Telegram |
| `api/media-upload` · `api/media-serve` | image upload (checked by magic bytes) and delivery |
| `api/track` | visit counters, atomic |
| `api/daily-report` · `api/weekly-report` | cron reports, midnight and Mondays |

Storage sits behind one `getStore()` in `lib/blobs.mjs` — Upstash Redis for data, Vercel Blob for media. Shipping rates for all 58 wilayas live in a single file, `lib/shipping-rates.mjs`, and are injected into the static page at build time so the local copy never quotes a price the deployed one does not.

## 🖥️ The admin — `/admin`

One page, no build, no framework: hash routing, a single `api()` call for every action, and forms generated from a field recipe instead of written field by field. Add a field to a section, add it to the recipe — `npm run verify` fails if you forget.

Getting in takes two steps: your password, then a 6-digit code the same Telegram bot sends you. After that a signed cookie lasts 7 days.

<img src="docs/admin-dashboard.png" width="100%" alt="Admin dashboard: revenue, profit, orders, conversion, and charts">

**Dashboard** — revenue, net profit after cost and ads, orders, average order value, units, customers, conversion. Charts for revenue against pipeline, orders per day, and sales by category, plus top products, live campaigns, low stock, and the latest orders. One request fills the screen; six small ones would be six round trips on a weak connection.

<table>
<tr>
<td><img src="docs/admin-products.png" alt="Products list with price, type, and status"></td>
<td><img src="docs/admin-campaigns.png" alt="Campaigns list with published and draft rows"></td>
</tr>
</table>

**Products** — price, cost, options, and stock per variant, with the margin recalculated as you type. **Campaigns** — create, duplicate, publish, delete; the live preview calls the *same* `renderSections` / `renderPage` the server uses, because a preview built from different code lies to you eventually. **Orders**, **Categories**, and **Media** finish the set, and the sidebar carries a badge with the pending order count.

> [!NOTE]
> The numbers in these shots are demo data — the admin is rendered locally against fixtures, not a real store.

## 🤖 Telegram, as the back office

Every order arrives as a message with accept and decline buttons. Accept cuts the stock and can fire a Meta CAPI purchase; decline puts it back. Commands answer only in the chat named by `TELEGRAM_CHAT_ID`:

| Command | Does |
|---|---|
| `/state` | where the orders stand right now, without waiting for midnight |
| `/stock` | stock per product and per variant |
| `/cost` | set product cost, ad cost per order, return loss — no redeploy |
| `/leads` | people who started the form and walked away |
| `/block` · `/unblock` · `/blocked` | phone blocklist |
| `/clear` | wipes every order — it asks twice before it does |

`/help` lists the rest: creating a product or a category from a plain sentence, restocking, and so on.

> [!TIP]
> When the bot goes quiet, check the webhook before you read a single line of code: `GET /api/telegram-webhook?setup` re-registers it and reports what it set. Nine times out of ten that is the whole problem.

## 🚀 Run it

```bash
npx vercel dev                          # pages + API + admin, same as production
PORT=8888 node scripts/dev-server.mjs   # files brk — fastest when you only touch the admin
npm run verify                          # 118 checks
npm run build                           # writes dist/ — public files only
```

## ☁️ Deploy

Vercel, because of `api/`. GitHub Pages cannot do it — it serves static files and nothing else.

```bash
npx vercel --prod
```

Or connect the repo from the dashboard and let `vercel.json` talk: build command, output directory, rewrites, and the cron schedule are all in there.

## 🔑 Environment

Required: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`. Upstash Redis and Vercel Blob drop in their own tokens when you connect them.

Optional: `SITE_URL`, Twilio (`TWILIO_*`) for customer SMS, Meta CAPI (`META_*`), trust check (`TKAWEN_*`). Leave one out and that feature stays asleep.

> [!WARNING]
> The admin fails closed — without both `ADMIN_*` variables nobody gets in, not even you.

```bash
node -e "console.log(require('node:crypto').createHash('sha256').update('yourpassword').digest('hex'))"
```

## 📁 What lives where

```
index.html          the static storefront for the first product
assets/             styles.css — every color goes through a token — and main.js
admin/              dashboard: campaigns, products, categories, media, orders
api/                one file per route
lib/                renderer, catalog, storage, Telegram messages, analytics
  render/sections/  the ten section types
scripts/            build, rate injection, the verify suite
docs/               screenshots for this page
```

`npm run build` copies only `index.html`, `assets/`, and `admin/` into `dist/`. That list in `scripts/build.mjs` is an allowlist, not a blocklist — a new public file has to be added by hand or it never ships. It was a blocklist once, and `lib/auth.mjs` was readable from outside.

## 📖 Notes

The old Darija manual — every design decision, the Telegram setup walkthrough, delivery prices per wilaya, the leads system, the trust check — was removed from the tree but is still in the history:

```bash
git show e922fd4:README.ar.md > README.ar.md
```

The server side carries the same reasoning inline: most files in `api/` and `lib/` open with a comment explaining why they are shaped the way they are. The browser JavaScript (`assets/js/`, `admin/js/`) is comment-free on purpose — every visitor downloads it.
