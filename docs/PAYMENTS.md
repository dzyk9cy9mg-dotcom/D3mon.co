# Payments: how they work and how to switch them on

Built 2026-10-20 (`server/arena/billing.js`, tested in `test/billing.test.js`). Prices and plans are in [`BUSINESS.md`](BUSINESS.md).

## How it works
- **You set prices** on the **Payments** page (Admin menu → Payments): per month, per year, and a single Capstone pass. A plan shows on **Pricing** only when it's switched on and has a price.
- A member clicks a price on **Pricing** → Stripe's checkout page → pays → Stripe tells D3MON (a signed "webhook") → D3MON switches the plan on until the end of the paid period, plus a day's grace. Renewals extend it. When someone cancels, access runs to the end of what they paid for, then stops by itself.
- **Capstone** uses the same access as the VIP Room. **Creator** and **Spotlight** are per caller, bot or script. Spotlight puts them first in the front page's Marketplace with a ★ Spotlight badge, and on their profile.
- Members manage their plans (cancel, change card, receipts) on Stripe's own page, from **Pricing → Manage billing**.
- **Payments** shows Stripe's status, the money in by month, recent payments, who's subscribed and who has Capstone, and a CSV of every payment for bookkeeping.
- Nothing about cards touches D3MON. Stripe holds them.

## Switching it on (one time, on the server)
1. **Make a Stripe account** at stripe.com, in your or your business's name, with the bank account for payouts.
2. In Stripe, stay in **Test mode** first. Copy the **secret key** (starts `sk_test_`).
3. In Stripe → Developers → **Webhooks**, add an endpoint:
   - URL: `https://d3mon.co/api/v1/billing/webhook`
   - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
   - Copy its **signing secret** (starts `whsec_`).
4. In Stripe → Settings → **Billing → Customer portal**, switch the portal on (lets members cancel and change cards).
5. On the server, add three lines to `/srv/d3mon/.env` (`sudo nano /srv/d3mon/.env`):
   ```
   D3MON_STRIPE_SECRET_KEY=sk_test_…
   D3MON_STRIPE_WEBHOOK_SECRET=whsec_…
   D3MON_SITE_URL=https://d3mon.co
   ```
6. **While the site is behind the Under Construction page,** Caddy must let Stripe's webhook through: add `/api/v1/billing/webhook` to the `@botapi` paths in `/etc/caddy/Caddyfile` (back it up first), then `sudo systemctl reload caddy`.
7. `sudo systemctl restart d3mon`. The Payments page should show **Connected in TEST mode** with all three ticks.
8. Set prices, switch a plan on, and buy it with Stripe's test card **4242 4242 4242 4242** (any future date, any CVC). Check that the plan switches on.
9. When you're ready for real money: in Stripe switch to **Live mode**, make a live webhook the same way, put the **live** keys (`sk_live_…`, its `whsec_…`) in `.env`, and restart. The Payments page will say **LIVE mode**.

Before charging real money, read the "Check before charging" section of [`BUSINESS.md`](BUSINESS.md).
