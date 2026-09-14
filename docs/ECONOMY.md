# Bowdle economy

Milestones M10 (accounts, progression) and M11 (cosmetics, shop). Nothing here exists before M10.

## Principles

1. Cosmetic only. Nothing sold or earned changes damage, speed, hitboxes, cooldowns or visibility.
2. Fixed prices, shown before purchase. No random paid rewards of any kind.
3. No trading, gifting between players, resale or cash out. Items have no money value.
4. One earned currency only.

## Currency: Ink

Earned by playing. Cannot be bought.

| Event | Ink |
|---|---|
| Finish a match | 20 |
| Each kill | 2 |
| Win | 15 |
| First win of the day | 50 |

Paid items are bought directly with money. Nothing converts money into Ink.

## Item slots

| Slot | Examples |
|---|---|
| `bowSkin` | Stripes, stars, flames, gold ink |
| `arrowTrail` | Dashes, sparkles, rainbow highlighter |
| `outfit` | Cap, crown, wizard hat, scarf |
| `killEffect` | Splat shape and color |

## Pricing

| Tier | Price |
|---|---|
| Common | 300 Ink |
| Rare | 900 Ink |
| Premium | $1.99 to $4.99 |
| Bundle (fixed contents, listed up front) | $7.99 |
| Starter pack, once per account | $2.99 for 3 premium items |

## Catalog (`src/shared/cosmetics.ts`)

```ts
export type CosmeticSlot = "bowSkin" | "arrowTrail" | "outfit" | "killEffect";

export type Cosmetic = {
  id: string;                     // stable forever, e.g. "bow.flames"
  slot: CosmeticSlot;
  name: string;
  rarity: "common" | "rare" | "premium";
  price: { ink: number } | { sku: string };   // sku matches the Xsolla item SKU
  render: Record<string, string | number | boolean>;  // params the client renderer reads
};
```

Every player owns a default item in each slot. The renderer must handle every `render` param in the catalog, and a unit test checks that each catalog entry uses only known params.

## Accounts (M10)

Package: `@colyseus/auth`. Read its type definitions before use.

- First visit: `client.auth.signInAnonymously()`. The SDK stores the token.
- "Save your progress": link Discord or Google with `client.auth.signInWithProvider(...)`.
- Rooms verify the token in `onAuth` with `JWT.verify` and load the user.
- Anonymous players can earn Ink and equip Ink items. **Buying with money requires a linked account.**
- Account deletion endpoint that removes the user and their data.

## Database (M10)

Package: `@colyseus/database` (`GameDatabase` on Drizzle ORM). Read its type definitions before use.

- Dialect `pglite` for dev and tests (no Docker needed). Dialect `pg` in production with `DATABASE_URL`.
- Tables:

| Table | Columns |
|---|---|
| users | from the auth user store |
| wallets | `userId`, `ink` |
| entitlements | `userId`, `itemId`, `source` (`ink`, `purchase`, `event`), `orderId` (unique, nullable), `createdAt`, `revokedAt` |
| loadouts | `userId`, `bowSkin`, `arrowTrail`, `outfit`, `killEffect` |
| match_results | `userId`, `matchId`, `kills`, `deaths`, `xp`, `ink`, `won`, `createdAt` |

- Ink changes and entitlement grants happen inside one transaction.
- On join, the server loads the loadout, drops any item the user does not own, and writes the result into `PlayerState`.

## Purchases with Xsolla (M11)

Dodo Payments cannot be used: its merchant policy prohibits video games and in-game items.

### Flow

1. Client asks `POST /shop/token` with `{ sku }`. Requires a linked account.
2. Server requests a payment token from Xsolla: `POST https://store.xsolla.com/api/v3/project/{XSOLLA_PROJECT_ID}/admin/payment/token`, Basic auth `XSOLLA_MERCHANT_ID:XSOLLA_API_KEY`, body with the user (id, name, email, country), `items: [{ sku, quantity: 1 }]`, and sandbox mode outside production.
3. Client opens Pay Station with the token: `https://secure.xsolla.com/paystation4/?token=...` (sandbox: `https://sandbox-secure.xsolla.com/paystation4/?token=...`).
4. When Pay Station closes, the client asks the server for its inventory. The client never grants anything itself.

### Webhook `POST /webhooks/xsolla`

- Read the **raw body** before any JSON parsing.
- Expected header: `Authorization: Signature <sha1 hex of rawBody + XSOLLA_WEBHOOK_SECRET_KEY>`. Compare with `crypto.timingSafeEqual`. Mismatch: reject.
- `user_validation`: confirm the user exists.
- `order_paid`: grant the items. Idempotent by order id: a repeated webhook grants nothing new. Respond `204` within 3 seconds.
- `order_canceled`: set `revokedAt` on those entitlements.
- Tests use fixture payloads signed with a test secret: valid signature, invalid signature, duplicate `order_paid`, cancel after paid.
- Before building this, confirm current payload shapes in Xsolla's webhook docs and save sample payloads as fixtures in `tests/server/fixtures/xsolla/`.

### Environment variables

`JWT_SECRET`, `SESSION_SECRET`, `DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `XSOLLA_MERCHANT_ID`, `XSOLLA_PROJECT_ID`, `XSOLLA_API_KEY`, `XSOLLA_WEBHOOK_SECRET_KEY`.

## Platforms

Build flag `VITE_PLATFORM`: `web` (default), `poki`, `crazygames`.

| Rule | web (bowdle.io) | Poki | CrazyGames |
|---|---|---|---|
| Paid shop | Yes | Never. Poki allows no in-app purchases | Hidden unless `VITE_CG_IAP=1`. Their IAP is invite-only and must use CrazyGames' own Xsolla setup |
| Ink shop | Yes | Yes | Yes |
| Ads | None | `commercialBreak` between matches only | Midgame ads between matches only |
| Links to other sites | Allowed | None except privacy and terms | None except privacy and terms |
| Accounts | Our auth | Guest only | Guest only unless integrated with their account system |

### Poki SDK (verified)

- Script: `https://game-cdn.poki.com/scripts/v2/poki-sdk.js`
- `PokiSDK.init()` at boot, `PokiSDK.gameLoadingFinished()` when loading is done.
- `PokiSDK.gameplayStart()` when a match starts or resumes, `PokiSDK.gameplayStop()` on match end, pause or menu.
- `PokiSDK.commercialBreak(() => { /* mute audio, disable keyboard */ })` before starting the next match. Restore audio and input when its promise resolves.

### CrazyGames SDK

- Uses gameplay signals (loading start and stop, gameplay start and stop, happy time) and midgame ads.
- Read `https://docs.crazygames.com/sdk/intro/` and `https://docs.crazygames.com/sdk/game/` before building. Take exact function names from those pages.

## Compliance checklist

- Privacy policy and terms pages, linked from the menu.
- No chat in v1. Player names pass a blocklist filter.
- Prices shown in the player's currency by Xsolla before payment.
- Account deletion available.
- No feature where money or items can be won, wagered or withdrawn.
