# Bowdle economy

Milestones M10 (accounts, progression) and M11 (cosmetics, shop). Nothing here exists before M10.

## Principles

1. Cosmetic only. Nothing sold or earned changes damage, speed, hitboxes, cooldowns or visibility.
2. Fixed prices, shown before purchase. No random paid rewards of any kind.
3. No trading, gifting between players, resale or cash out. Items have no money value.
4. One earned currency only.

## Currency: Ink

Earned by playing. Cannot be bought. Values live in `src/shared/progression.ts`.

| Event | Ink | XP |
|---|---|---|
| Finish a match | 10 | 100 |
| Win | 10 | 200 |
| Each kill | 1 (up to 10) | 50 |
| Each assist | 0 | 25 |

Level n takes 500 x n XP to clear, up to level 100. Rewards are granted once per match id, only to signed-in players still in the room at the end.

Paid items are bought directly with money. Nothing converts money into Ink.

## Catalog (`src/shared/cosmetics.ts`)

Four categories, one free default plus six items each: 24 items, 16 for Ink and 8 paid.

| Category | Loadout slot | What changes | Draw cost |
|---|---|---|---|
| `bow` | `bowSkin` | Limb paint, grip paint (first person), tip ornament | Shares a draw call with any part of the same paint |
| `trail` | `arrowTrail` | Ribbon style (dots, dashes, zigzag, ribbon) and paint | One ribbon mesh per arrow |
| `outfit` | `outfit` | Headgear, accessory, hat and trim paint | Rig parts are merged by paint |
| `effect` | `killEffect` | Burst shape and paint, shown on every kill by the owner | One instanced mesh for 0.9 s |

Rules the catalog test enforces: ids are `<category>.<name>` and never change, SKUs are unique lowercase slugs, Ink prices are at least 100, and no item uses a team color. Shirts and sleeves stay the crew color whatever the outfit.

| Tier | Price |
|---|---|
| Ink items | 250 to 700 Ink |
| Paid bows and trails, effects | $1.99 to $2.99 |
| Paid outfits | $4.99 |

## Accounts and database (M10)

Built without `@colyseus/auth` or an ORM; the model is small.

- Guest accounts are created on first Play, Profile or Locker visit. Tokens are `<account id>.<secret>`, one per device, stored only as SHA-256 hashes (`account_tokens`).
- Discord and Google sign-in link to the current account or sign in on a new device. A provider is offered only when its client id, secret and `PUBLIC_URL` are set.
- Tables: `accounts` (name, xp, ink, provider ids, loadout columns), `account_tokens`, `match_rewards` (primary key match id + account), `season_stats`, `inventory` (source `ink` or `xsolla`, order id), `orders`.
- PGlite in dev and tests, Postgres through postgres.js when `DATABASE_URL` is set. Migrations are numbered in `src/server/db/migrations.ts`.
- Ink spending and grants run in one transaction. Deleting an account removes every row tied to it.
- On join, the room loads the stored loadout and writes it into `PlayerState`. What the client sends is ignored, and loadouts are re-checked against the inventory on every read.

## Purchases with Xsolla (M11)

Dodo Payments cannot be used: its merchant policy prohibits video games and in-game items.

### Flow

1. The locker calls `POST /api/shop/checkout` with `{ sku }`. The account must have Discord or Google linked (403 `link_required` otherwise), because a guest token lives in one browser.
2. The server requests a token: `POST https://store.xsolla.com/api/v3/project/{XSOLLA_PROJECT_ID}/admin/payment/token`, Basic auth `XSOLLA_MERCHANT_ID:XSOLLA_API_KEY`, body `{ user: { id: { value: accountId }, name: { value } }, purchase: { items: [{ sku, quantity: 1 }] }, sandbox }`. The response is `201 { token, order_id }`; the order is stored as `created`.
3. The client opens Pay Station in a new tab: `https://secure.xsolla.com/paystation4/?token=...` (sandbox: `https://sandbox-secure.xsolla.com/paystation4/?token=...`) and polls `GET /api/locker` until the item appears. The client never grants anything.

### Webhook `POST /api/xsolla/webhook`

- The route reads the raw body before JSON parsing.
- `Authorization: Signature <sha1 hex of rawBody + XSOLLA_WEBHOOK_SECRET_KEY>`, compared with `timingSafeEqual`. A mismatch returns 400 `INVALID_SIGNATURE`.
- `user_validation`: 204 if the account exists, else 400 `INVALID_USER`.
- `order_paid`: grants the items for `user.external_id`. Idempotent by `order.id`. Unknown SKUs return 400 `INVALID_PARAMETER`.
- `order_canceled`: removes what that order granted; an equipped item falls back to the default.
- Other notification types get 204 so Xsolla stops retrying.
- Covered by `tests/server/shop.test.ts` with signed payloads: valid and invalid signature, duplicate `order_paid`, cancel after paid, unknown user and SKU.

### Setup Tanay does in the Xsolla Publisher Account

- Create virtual items with exactly these SKUs: `bow-gilded-relic`, `bow-night-canopy`, `trail-gold-leaf`, `trail-shadow-vine`, `outfit-canopy-shaman`, `outfit-golden-idol`, `effect-blue-morpho`, `effect-relic-rubble`, priced as in the catalog.
- Set the webhook URL to `https://bowdle.io/api/xsolla/webhook` and enable user validation, order paid and order canceled.
- Run a sandbox purchase with `XSOLLA_SANDBOX=1` before switching it off.

### Environment variables

`DATABASE_URL`, `PUBLIC_URL`, `TRUST_PROXY`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `XSOLLA_MERCHANT_ID`, `XSOLLA_PROJECT_ID`, `XSOLLA_API_KEY`, `XSOLLA_WEBHOOK_SECRET_KEY`, `XSOLLA_SANDBOX`. The paid shop stays off unless the four Xsolla ids and keys are all set.

## Platforms

Build flag `VITE_PLATFORM`: `web` (default), `poki`, `crazygames`.

| Rule | web (bowdle.io) | Poki | CrazyGames |
|---|---|---|---|
| Paid shop | Yes | Never. Poki allows no in-app purchases | Not in v1. Their IAP is invite-only and would need CrazyGames' own Xsolla token (`SDK.user.getXsollaUserToken()`) |
| Ink shop | Yes | Yes | Yes |
| Ads | None | `commercialBreak` between matches only | Midgame ads between matches only |
| Links to other sites | Allowed (Share on X) | None except privacy and terms | None except privacy and terms |
| Accounts | Guest plus Discord or Google | Guest only (sign-in redirects hidden) | Guest only (sign-in redirects hidden) |

### Poki SDK (verified)

- Script: `https://game-cdn.poki.com/scripts/v2/poki-sdk.js`
- `PokiSDK.init()` at boot, `PokiSDK.gameLoadingFinished()` when loading is done.
- `PokiSDK.gameplayStart()` when a match starts or resumes, `PokiSDK.gameplayStop()` on match end, pause or menu.
- `PokiSDK.commercialBreak(() => { /* mute audio, disable keyboard */ })` before starting the next match. Restore audio and input when its promise resolves.

### CrazyGames SDK

- Uses gameplay signals (loading start and stop, gameplay start and stop, happy time) and midgame ads.
- Built in `src/client/platform/sdk.ts`: `SDK.init()`, `SDK.game.loadingStart/loadingStop/gameplayStart/gameplayStop/happytime`, and `SDK.ad.requestAd("midgame", { adStarted, adFinished, adError })`. An `environment` of `disabled` means no SDK.

## Compliance checklist

- Privacy policy and terms pages, linked from the menu.
- No chat in v1. Player names pass a blocklist filter.
- Prices shown in the player's currency by Xsolla before payment.
- Account deletion available.
- No feature where money or items can be won, wagered or withdrawn.
