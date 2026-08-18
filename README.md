# Qiti

Page builder for cash-on-delivery stores. Renderer, API, admin, and a Telegram bot I run the shop from.

Live: [qiti.vercel.app](https://qiti.vercel.app)

## What it is

Almost nobody here pays with a card, and nobody makes an account to buy one thing. Orders are cash to the delivery guy, so the whole flow is built around that: pick the product, type a name and a phone, choose a wilaya, done. Delivery price depends on the wilaya, and the 58 of them are in `lib/shipping-rates.mjs`.

There's no page file per product. A campaign points at a product, picks a theme and a list of sections, and takes a slug. The renderer builds the HTML when someone asks for it, so selling something else is a new row, not a new folder.

First thing I put on it is a GPS collar for cats. That's what the screenshots are.

<img src="docs/preview-hero.png" width="290" alt="Storefront: product photo, tracking card, price"> <img src="docs/preview-order.png" width="290" alt="Order section: name, phone, wilaya, delivery, quantity">

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

Everything falls through to `api/render` (rewrites are in `vercel.json`), so publishing doesn't need a deploy. Save in the admin, next request has it.

Sections: `hero`, `trust`, `features`, `how`, `lifestyle`, `gallery`, `reviews`, `faq`, `cta`, `order`. Only `order` touches money, and it takes the price and variants from the product, never from the campaign. A new campaign starts from a section order based on the product type (`pet`, `clothing`, `auto`, `tech`, `life`), then you drag them around.

Themes are about fifteen tokens: colors, radius, font. I let campaigns write their own CSS at first and after four of them it was four stylesheets nobody wanted to touch.

## API

One file per route in `api/`, no router.

| Route | What it does |
|---|---|
| `api/render` | renders any public path |
| `api/order` | takes an order, stores it, pings Telegram |
| `api/lead` | saves an abandoned form once the phone looks real |
| `api/telegram-webhook` | accept/decline taps and the bot commands |
| `api/admin-api` | one authenticated POST behind the dashboard |
| `api/admin-login` | password, then a code over Telegram |
| `api/media-upload`, `api/media-serve` | image upload and delivery |
| `api/track` | visit counters |
| `api/daily-report`, `api/weekly-report` | cron reports, midnight and Mondays |

Storage goes through `getStore()` in `lib/blobs.mjs`: Upstash Redis for data, Vercel Blob for images.

## Admin

`/admin`. Single page, hash routing, one `api()` call per action. Forms are generated from a field recipe instead of written out, and `npm run verify` fails if a section has a field the recipe doesn't.

Login is a password plus a 6-digit code the bot sends. Signed cookie after that, 7 days.

<img src="docs/admin-dashboard.png" width="100%" alt="Admin dashboard: revenue, profit, orders, conversion, charts">

The dashboard is one request, not six. Six round trips on a bad connection is two seconds of blank screen.

<table>
<tr>
<td><img src="docs/admin-products.png" alt="Products list"></td>
<td><img src="docs/admin-campaigns.png" alt="Campaigns list"></td>
</tr>
</table>

Campaign preview calls the same `renderSections`/`renderPage` the server does. A separate preview drifts, and then you ship a page you never actually saw.

Numbers in those shots are fake, there's no live store in the environment I take screenshots in.

## Telegram

Orders arrive as a message with accept and decline buttons. Accept cuts stock and can fire a Meta CAPI purchase, decline puts it back. Commands only work in the chat set as `TELEGRAM_CHAT_ID`.

| Command | Does |
|---|---|
| `/state` | orders right now, instead of waiting for the midnight report |
| `/stock` | stock per product and variant |
| `/cost` | product cost, ad cost per order, return loss. No redeploy |
| `/leads` | people who started the form and left |
| `/block`, `/unblock`, `/blocked` | phone blocklist |
| `/clear` | wipes every order, asks twice first |

`/help` has the rest.

If the bot goes quiet, check the webhook before reading any code. `GET /api/telegram-webhook?setup` re-registers it and tells you what it set. That's been the problem nearly every time.

## Running it

```bash
npx vercel dev                          # pages + API + admin, like production
PORT=8888 node scripts/dev-server.mjs   # files only, fastest when I'm in the admin
npm run verify                          # 118 checks
npm run build                           # writes dist/
npx vercel --prod                       # deploy
```

Has to be Vercel, or anything that runs `api/`. GitHub Pages can't host it.

## Environment

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`. Upstash and Blob add theirs when you connect them.

Optional: `SITE_URL`, Twilio (`TWILIO_*`), Meta CAPI (`META_*`), trust check (`TKAWEN_*`). Skip one and that part doesn't run.

Without both `ADMIN_*` vars the admin locks everyone out, including you. Hash the password with:

```bash
node -e "console.log(require('node:crypto').createHash('sha256').update('yourpassword').digest('hex'))"
```

## Layout

```
index.html          static storefront for the first product
assets/             styles.css + main.js
admin/              dashboard
api/                one file per route
lib/                renderer, catalog, storage, telegram, analytics
  render/sections/  the ten section types
scripts/            build, rate injection, verify suite
```

`npm run build` copies `index.html`, `assets/` and `admin/` into `dist/` and nothing else. The list in `scripts/build.mjs` is an allowlist, so a new public file has to be added there or it won't ship. It used to be a blocklist and `lib/auth.mjs` was readable from outside.

Most files in `api/` and `lib/` open with a comment about why they're built that way. The browser JS has none left, since every visitor downloads it.

The old long manual isn't in the tree anymore but it's still in the history:

```bash
git show e922fd4:README.ar.md > README.ar.md
```
