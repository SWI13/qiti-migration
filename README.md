# Qiti

A GPS collar for cats, sold in Algeria. One static page in Algerian Darija (RTL), cash on delivery, and a Telegram bot that pings you the second an order lands.

No framework, no build step for the page itself, no runtime dependencies. Small Vercel Functions in `api/` do the rest.

Live: **https://qiti.vercel.app**

## Run it

```bash
npx vercel dev                          # page + functions + admin, like production
PORT=8888 node scripts/dev-server.mjs   # files only — fastest for admin work
npm run verify                          # 118 checks
npm run build                           # writes dist/ (public files only)
```

## Deploy

Vercel only — the `api/` functions need a server, so GitHub Pages will not do.

```bash
npx vercel --prod
```

Or connect the repo in the Vercel dashboard; `vercel.json` already carries the build command, output directory, rewrites, and the report crons.

## Layout

```
index.html          the storefront
assets/             styles.css (all design tokens) + main.js (form, theme, attribution)
admin/              dashboard — campaigns, products, media, live preview
api/                Vercel Functions, one file per route
lib/                shared code, never served to visitors
scripts/            build, rate injection, verify suite
```

`npm run build` copies only `index.html`, `assets/`, and `admin/` into `dist/`. The list in `scripts/build.mjs` is an allowlist — a new public file has to be added there by hand or it will not ship.

## How a page is built

```
/toji-outfit → campaign → product → theme (~15 tokens) → sections[] → HTML
```

One renderer serves every product. Campaign pages are data, not new files. Eleven section types: hero, trust, features, how it works, lifestyle, gallery, testimonials, order form, FAQ, final CTA, footer.

## Telegram

Every order becomes a message with accept / decline buttons. Accepting cuts stock and can fire a Meta CAPI purchase; declining puts it back. Bot commands, restricted to the chat in `TELEGRAM_CHAT_ID`:

| Command | Does |
|---|---|
| `/state` | orders right now, without waiting for the nightly report |
| `/stock` | stock per product and variant |
| `/cost` | set product cost, ad cost per order, return loss — no redeploy |
| `/leads` | people who started the form and left |
| `/block`, `/unblock`, `/blocked` | phone blocklist |
| `/clear` | wipes every order, asks twice first |

`/help` lists the rest — creating products and categories from a plain sentence, restocking, and so on.

Reports run on a cron: one at midnight, one every Monday.

If the bot goes quiet, re-register the webhook before reading any code: `GET /api/telegram-webhook?setup`.

## Environment

Required in Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`. Upstash Redis and Vercel Blob add their own tokens when you connect them.

Optional: `SITE_URL`, Twilio (`TWILIO_*`) for customer SMS, Meta CAPI (`META_*`), trust check (`TKAWEN_*`). Leave one out and that feature simply stays off.

Admin login fails closed: without both `ADMIN_*` variables nobody gets in. Generate the hash with:

```bash
node -e "console.log(require('node:crypto').createHash('sha256').update('yourpassword').digest('hex'))"
```

## Full docs

The long version — every design decision, the Telegram setup walkthrough, shipping rates for all 58 wilayas, the leads system, the trust check — lives in **[README.ar.md](README.ar.md)**, in Darija.
