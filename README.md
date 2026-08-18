<div align="center">

# 🐈 Qiti

**A GPS collar for cats, sold in Algeria.**

One page, in Darija, right-to-left. She pays khlas — cash in her hand, when the delivery guy knocks.

[![live](https://img.shields.io/badge/live-qiti.vercel.app-FF6B2C?style=flat-square)](https://qiti.vercel.app)
[![deployed on Vercel](https://img.shields.io/badge/deployed%20on-Vercel-000000?style=flat-square&logo=vercel)](https://vercel.com)
![runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-22C55E?style=flat-square)
![no build step](https://img.shields.io/badge/build%20step-none-D65C74?style=flat-square)
![checks](https://img.shields.io/badge/checks-118-C79A54?style=flat-square)

<img src="docs/preview-hero.png" width="330" alt="The storefront: product photo, live tracking card, price"> <img src="docs/preview-order.png" width="330" alt="The order form, wearing cat ears and whiskers">

</div>

---

## Why it is built this way

No card, no account, no wallet — that is how things are bought here, so that is what the page does.

It is static: no framework, no build step for the page itself, zero runtime dependencies. It loads fast on a slow connection, which sells more than any animation. A few small Vercel Functions in `api/` do the rest of the work.

## 🚀 Run it

```bash
npx vercel dev                          # page + functions + admin, same as production
PORT=8888 node scripts/dev-server.mjs   # files brk — fastest when you only touch the admin
npm run verify                          # 118 checks
npm run build                           # writes dist/ — public files only
```

## ☁️ Deploy

Vercel, because of the functions in `api/`. GitHub Pages cannot do it — it serves static files and nothing else.

```bash
npx vercel --prod
```

Or connect the repo from the Vercel dashboard and let `vercel.json` talk: build command, output directory, rewrites, and the report crons are all in there.

## 📁 What lives where

```
index.html          the storefront
assets/             styles.css — every color goes through a token — and main.js (form, theme, attribution)
admin/              dashboard: campaigns, products, media, live preview
api/                Vercel Functions, one file per route
lib/                shared code, never served to a visitor
scripts/            build, shipping-rate injection, the verify suite
docs/               screenshots for this page
```

`npm run build` copies only `index.html`, `assets/`, and `admin/` into `dist/`. That list in `scripts/build.mjs` is an allowlist, not a blocklist — add a new public file there by hand or it never ships. It was a blocklist once, and `lib/auth.mjs` was readable from outside.

## 🧩 How a page gets built

```
/toji-outfit → campaign → product → theme (~15 tokens) → sections[] → HTML
```

Same renderer for every product. A new campaign is data, not a new page file. Eleven section types: hero, trust, features, how it works, lifestyle, gallery, testimonials, order form, FAQ, final CTA, footer.

## 🖥️ The admin — `/admin`

A single page, no build, no framework: hash routing, one `api()` call for every action, and a form that is generated from a field recipe instead of written field by field. Add a field to a section, add it to the recipe, and `npm run verify` fails if you forgot.

Getting in takes two steps: your password, then a 6-digit code the same Telegram bot sends you. After that a signed cookie lasts 7 days.

<img src="docs/admin-dashboard.png" width="100%" alt="Admin dashboard: revenue, profit, orders, conversion, and charts">

**Dashboard** — revenue, net profit after cost and ads, orders, average order value, units, customers, conversion. Charts for revenue against pipeline, orders per day, sales by category, plus top products, live campaigns, low stock, and the last orders. One request fills the whole screen; six small ones would be six round trips on a weak connection.

<table>
<tr>
<td><img src="docs/admin-products.png" alt="Products list with price, type, and status"></td>
<td><img src="docs/admin-campaigns.png" alt="Campaigns list with published and draft rows"></td>
</tr>
</table>

**Products** — price, cost, options, and stock per variant, with the margin recalculated as you type. **Campaigns** — create, duplicate, publish, delete; the live preview calls the *same* `renderSections` / `renderPage` the server uses, because a preview built from different code lies to you eventually. **Orders**, **Categories**, and **Media** round it out, and the sidebar carries a badge with the pending order count.

> [!NOTE]
> The numbers in these screenshots are demo data — the admin is rendered locally against fixtures, not a real store.

## 🤖 Telegram

Every order arrives as a message with accept and decline buttons. Accept cuts the stock and can fire a Meta CAPI purchase; decline puts it back. Commands only answer in the chat named by `TELEGRAM_CHAT_ID`:

| Command | Does |
|---|---|
| `/state` | where the orders stand right now, without waiting for midnight |
| `/stock` | stock per product and per variant |
| `/cost` | set product cost, ad cost per order, return loss — no redeploy |
| `/leads` | people who started the form and walked away |
| `/block` · `/unblock` · `/blocked` | phone blocklist |
| `/clear` | wipes every order — it asks twice before it does |

`/help` lists the rest: creating a product or a category from a plain sentence, restocking, and so on. Reports go out on a cron, one at midnight and one every Monday.

> [!TIP]
> When the bot goes quiet, check the webhook before you read a single line of code: `GET /api/telegram-webhook?setup` re-registers it and tells you what it set. Nine times out of ten that is the whole problem.

## 🔑 Environment

Needed in Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`. Upstash Redis and Vercel Blob drop in their own tokens when you connect them.

Optional: `SITE_URL`, Twilio (`TWILIO_*`) for customer SMS, Meta CAPI (`META_*`), trust check (`TKAWEN_*`). Leave one out and that feature just stays asleep.

> [!WARNING]
> The admin fails closed — without both `ADMIN_*` variables nobody gets in, not even you.

```bash
node -e "console.log(require('node:crypto').createHash('sha256').update('yourpassword').digest('hex'))"
```

## 📖 The long version

The old Darija manual — every design decision, the full Telegram walkthrough, delivery prices for the 58 wilayas, the leads system, the trust check — was removed from the tree, but it is still in the history:

```bash
git show e922fd4:README.ar.md > README.ar.md
```

The code itself carries the same reasoning: most files open with a comment saying why they are shaped the way they are.
