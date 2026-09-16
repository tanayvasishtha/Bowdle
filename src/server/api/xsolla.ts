import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cosmeticBySku } from "../../shared/cosmetics.ts";
import type { GameDatabase } from "../db/GameDatabase.ts";

export type XsollaEnv = Partial<Record<"XSOLLA_MERCHANT_ID" | "XSOLLA_PROJECT_ID" | "XSOLLA_API_KEY" | "XSOLLA_WEBHOOK_SECRET_KEY" | "XSOLLA_SANDBOX", string>>;

const TOKEN_ENDPOINT = (projectId: string): string => `https://store.xsolla.com/api/v3/project/${encodeURIComponent(projectId)}/admin/payment/token`;
const PAY_STATION = "https://secure.xsolla.com/paystation4/?token=";
const PAY_STATION_SANDBOX = "https://sandbox-secure.xsolla.com/paystation4/?token=";

const TokenResponse = z.object({ token: z.string().min(1), order_id: z.union([z.number(), z.string()]) });

const WebhookUser = z.object({ id: z.union([z.string(), z.number()]).optional(), external_id: z.union([z.string(), z.number()]).optional() }).passthrough();
const WebhookItem = z.object({ sku: z.string(), quantity: z.number().optional() }).passthrough();
const Webhook = z.discriminatedUnion("notification_type", [
  z.object({ notification_type: z.literal("user_validation"), user: WebhookUser }).passthrough(),
  z.object({ notification_type: z.literal("order_paid"), user: WebhookUser, order: z.object({ id: z.union([z.string(), z.number()]) }).passthrough(), items: z.array(WebhookItem) }).passthrough(),
  z.object({ notification_type: z.literal("order_canceled"), order: z.object({ id: z.union([z.string(), z.number()]) }).passthrough() }).passthrough(),
]);

export type WebhookReply = { status: number; body?: { error: { code: string; message: string } } };
const reject = (code: string, message: string): WebhookReply => ({ status: 400, body: { error: { code, message } } });

/** Xsolla Pay Station for paid cosmetics. Every value comes from the environment; without them the paid shop stays off. */
export class Xsolla {
  private readonly env: XsollaEnv;
  private readonly fetcher: typeof fetch;

  constructor(env: XsollaEnv, fetcher: typeof fetch = fetch) { this.env = env; this.fetcher = fetcher; }

  get enabled(): boolean { return Boolean(this.env.XSOLLA_MERCHANT_ID && this.env.XSOLLA_PROJECT_ID && this.env.XSOLLA_API_KEY && this.env.XSOLLA_WEBHOOK_SECRET_KEY); }
  get sandbox(): boolean { return this.env.XSOLLA_SANDBOX === "1" || this.env.XSOLLA_SANDBOX === "true"; }

  /** Creates a Pay Station token for one item. The account id becomes the Xsolla user id, which comes back as `external_id`. */
  async checkout(accountId: string, name: string, sku: string): Promise<{ orderId: string; url: string } | undefined> {
    if (!this.enabled || !cosmeticBySku(sku)) return undefined;
    // The Store API token call authenticates with the merchant id, not the project id.
    const auth = Buffer.from(`${this.env.XSOLLA_MERCHANT_ID}:${this.env.XSOLLA_API_KEY}`).toString("base64");
    const response = await this.fetcher(TOKEN_ENDPOINT(this.env.XSOLLA_PROJECT_ID!), {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        user: { id: { value: accountId }, name: { value: name } },
        purchase: { items: [{ sku, quantity: 1 }] },
        sandbox: this.sandbox,
      }),
    });
    if (!response.ok) return undefined;
    const parsed = TokenResponse.safeParse(await response.json());
    if (!parsed.success) return undefined;
    return { orderId: String(parsed.data.order_id), url: `${this.sandbox ? PAY_STATION_SANDBOX : PAY_STATION}${encodeURIComponent(parsed.data.token)}` };
  }

  /** Xsolla signs webhooks as `Signature <sha1(raw body + secret)>`. */
  verify(rawBody: Buffer, header: string | undefined): boolean {
    const secret = this.env.XSOLLA_WEBHOOK_SECRET_KEY;
    const match = /^Signature ([0-9a-f]{40})$/i.exec(header ?? "");
    if (!secret || !match) return false;
    const expected = createHash("sha1").update(Buffer.concat([rawBody, Buffer.from(secret)])).digest();
    const actual = Buffer.from(match[1]!.toLowerCase(), "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async handleWebhook(db: GameDatabase, rawBody: Buffer, signature: string | undefined): Promise<WebhookReply> {
    if (!this.enabled || !this.verify(rawBody, signature)) return reject("INVALID_SIGNATURE", "Invalid signature");
    let json: unknown;
    try { json = JSON.parse(rawBody.toString("utf8")); } catch { return reject("INVALID_PARAMETER", "Body is not JSON"); }
    const parsed = Webhook.safeParse(json);
    // Types we do not use still get a success reply, so Xsolla stops retrying them.
    if (!parsed.success) return { status: 204 };
    const event = parsed.data;
    if (event.notification_type === "user_validation") {
      const id = String(event.user.id ?? event.user.external_id ?? "");
      return id && await db.accountExists(id) ? { status: 204 } : reject("INVALID_USER", "Unknown user");
    }
    if (event.notification_type === "order_paid") {
      const accountId = String(event.user.external_id ?? event.user.id ?? "");
      if (!accountId || !(await db.accountExists(accountId))) return reject("INVALID_USER", "Unknown user");
      const skus = event.items.map((item) => item.sku);
      if (skus.some((sku) => !cosmeticBySku(sku))) return reject("INVALID_PARAMETER", "Unknown SKU");
      await db.fulfillOrder(String(event.order.id), accountId, skus);
      return { status: 204 };
    }
    await db.cancelOrder(String(event.order.id));
    return { status: 204 };
  }
}
