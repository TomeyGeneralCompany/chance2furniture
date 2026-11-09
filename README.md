# Chance 2 Furniture

Furniture storefront with the approved purple / teal / boar branding, all 1,008 imported catalog entries, product details, category browsing, search, price sorting, a persistent quantity-aware bag, Stripe Checkout, and the original Chance 2 Five punch card.

## Run

Node 22.13+ (Node 24 recommended), Python 3 and curl for catalog refresh. No npm dependencies.

```sh
cp .env.example .env
npm start
# http://localhost:3000
npm test
```

Without Stripe keys, the storefront runs and punch cards can be created and restored. Checkout reports that payment setup is incomplete. No pretend paid orders or sample punch balances are shown.

## Original punch-card rules

- Each successfully paid full-price order earns one punch, regardless of its size. No minimum spend.
- Five punches unlock **25% off the next merchandise order**, with **no dollar cap**. Shipping is excluded.
- The discounted order consumes the reward and resets the card; the following paid order starts the new card.
- Cycles repeat indefinitely. No expiration, lifetime maximum, account requirement, or refund clawback.
- Five tiny orders followed by a large discounted order are intentionally allowed.
- Guests receive a reusable card code. Save it to restore the same card on another device; no login is required. The code gives access to its punch card. No email or identity binding is imposed.

Paid events come from verified Stripe webhooks. Duplicate events do not add extra punches. One in-progress checkout per card is resumed on retry; customers can cancel that pending checkout to edit the bag. This preserves the promised next-order reward across retries and failed payments. Failed/abandoned sessions do not consume the reward. These are payment bookkeeping rules, not added eligibility restrictions. Refunds leave earned punches alone.

## Connect Stripe

1. Deploy this Node app on a host with a **persistent disk** for SQLite. Run `npm start`. Set `DATABASE_PATH` to the mounted disk path. Keep one app process per SQLite database, and back up the disk. Ephemeral/serverless disks are unsuitable for the reward ledger.
2. Set `PUBLIC_ORIGIN` to the HTTPS storefront origin used in Stripe return URLs. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the host's environment/secret controls. Never commit real keys to GitHub or put them in `dist/`.
3. Add the HTTPS backend endpoint `/api/stripe/webhook` in Stripe. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, and `checkout.session.async_payment_failed`.
4. Set `CUSTOMER_SHIPPING_CENTS` to your customer-facing per-order delivery fee (an explicit `0` is allowed if that is your chosen policy). This fee is separate from supplier shipping used in landed-cost pricing. A variable shipping carrier/quote service is not connected.
5. Product prices use Office Crave’s product price × 2.5. Configure customer shipping separately.
6. Start with Stripe **test** credentials and exercise five paid orders, the uncapped sixth-order discount, cancellation, duplicate webhook delivery, and a second cycle. Switch to live credentials only after your Stripe account and server endpoint are ready. No live payments have been tested in this repository.
7. Set `STRIPE_AUTOMATIC_TAX=true` if Stripe Tax is configured for your business; otherwise tax calculation remains disabled. Checkout collects a US delivery address and phone number. Orders and customer details are available in your Stripe dashboard; the local ledger stores ordered items and links to each Checkout Session. Automated supplier purchasing is not included.

For local Stripe testing, forward the four event types to `localhost:3000/api/stripe/webhook` using the official Stripe CLI and put its signing secret in `.env`.

### GitHub Pages frontend

GitHub Pages can host `dist/` but cannot run the payment server or SQLite ledger. Either serve both together through `npm start`, or deploy the Node backend separately, set `window.CHANCE2_STORE.apiOrigin` in `dist/store-config.js` to its HTTPS origin, and include the frontend origin in `STOREFRONT_ORIGINS`. Set `PUBLIC_ORIGIN` to the actual frontend origin (including the repository path for project Pages). The included manual Pages deployment publishes only static assets.

## Pricing

**Price = supplier product price × 2.5**, rounded to cents. Shipping is charged separately. Server totals are rebuilt from the catalog; browser-submitted prices are never charged. Missing supplier prices fail the catalog refresh.

## Catalog

```sh
python3 import_catalog.py
```

The importer discovers all listing pages, retries fetch failures, deduplicates products, and preserves the previous catalog if any page fails or the product count drops by more than 20%. Source markup changes can require parser changes. Product images load from Office Crave. The snapshot was retrieved November 2, 2026. Refresh using the included manual GitHub workflow or the command above. The importer does not obtain checkout-specific supplier shipping quotes.

## Verification

`npm test` covers small orders unlocking an uncapped large reward, repeated cycles, duplicate paid events, unpaid/cancelled sessions, amount mismatches, reservation retries, no refund clawbacks, landed-cost pricing, webhook signatures, and Stripe Checkout request construction. Tests use a simulated Stripe transport; no Stripe keys or live payments are used.
