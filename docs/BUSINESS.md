# D3MON: pricing, marketing and sales (draft for the owner)

Owner, 2026-10-20: "I'm trying to charge for membership. Have the bot owners, bots, scripters and callers pay a little extra to market themselves, because they'll get traffic from my site. Capstone is a premium, paid service." This is a first draft to react to. Every number here is a suggestion.

## 1. What people pay for

| Plan | Who | What they get | Suggested price |
| --- | --- | --- | --- |
| **Member** | everyone | Live floor, chat, Up/Down votes and a record, tournaments, profiles, battles to watch | **Free** |
| **Creator** | callers, bot owners, chart scripters | A listed profile (the shop window with "Get NAME"), stats card, tournaments, battles, moving profile picture | **Free at launch**, then about **$15/month** |
| **Creator Spotlight** | creators who want traffic | Everything in Creator, plus: featured on the front page's Marketplace and the Live page, a marketing video slot, their badge highlighted on the floor, first pick for HardSmoke's battles | about **$49/month** |
| **Capstone** | traders who want the premium sessions | The scheduled live Capstone sessions, featured callers' calls before the close, the Capstone floor and its record | about **$39/month**, or a **$12 single-session pass** |

**Annual:** 2 months free (pay for 10, get 12). **Founders:** the first 50 creators and first 100 Capstone members keep 40% off for as long as they stay. This rewards early people and gives you something to announce.

### Why these numbers
- Paid crypto-signal Discords commonly sit around **$28 to $50 a month** (for example [$28](https://gannjourneyman.gumroad.com/l/insider), [$40](https://retrohq.gumroad.com/l/xjfwx) and [$50](https://kryptonbtc.gumroad.com/l/GENZDISCORDACCESS) a month on Gumroad). Capstone at $39 sits inside that range, and D3MON can show something they can't: **every call priced and checked against Kalshi**.
- **Keep creator listing free at first.** A marketplace needs sellers before buyers come, and buyers before sellers will pay. Free listings fill the Marketplace; Spotlight is what creators pay for once there's traffic to buy. Start charging for basic listing when the traffic numbers (section 4) make the case.

## 2. How money comes in
1. **Plans** above (monthly or yearly).
2. **Referral commissions** on creators' shop links ("Get NAME", already built).
3. **Ads and sponsored slots** later (the display slots and marketing video slots).

## 3. The sales system (what gets built)
- **Stripe** for payments: cards, monthly and yearly renewals, receipts, failed-payment retries, and a page where members cancel or change plans themselves. Fees are about [2.9% + 30¢ per charge, plus 0.7% for subscriptions](https://flexprice.io/blog/stripe-pricing-breakdown-2026). On a $39 plan that's about $1.70, so you keep about $37.30.
- **Paying switches access on, stopping switches it off, automatically.** Stripe tells the site when someone pays, renews or cancels; the site turns on Capstone access, the Creator plan or Spotlight, and turns it off at the end of the paid period. No more granting VIP by hand (that stays as a backup for comps and promos).
- **Every payment is recorded twice:** in Stripe (the money) and in D3MON's ledger (who got what, when).
- **Pages:** a Pricing page, a "Go Spotlight" button on My bots, a "Join Capstone" button on the Capstone page, and your own admin view of members, plans and monthly totals.
- **Keeping track for taxes:** Stripe's reports export to a spreadsheet or bookkeeping app. Sales tax on digital services depends on your state; [Stripe Tax](https://flexprice.io/blog/stripe-pricing-breakdown-2026) (about 0.5% per sale) can work it out and add it at checkout. **Ask an accountant** what you need to file.

What you'll need to set up Stripe: a Stripe account in your (or your business's) name, a bank account for payouts, and your business details. I'll walk you through it.

## 4. Marketing
- **HardSmoke's battles are the main event.** Regular, scheduled, streamed on YouTube at the same time, with creators streaming on their own channels too. Every battle ends with results and winner badges that are easy to share.
- **Creators bring their own audiences.** Each profile is proof, priced and checked against Kalshi, so creators will share their D3MON link. Give them a "Share my record" card image to post.
- **Weekly tournament results** posted to X and the Discord: winners, best records, best paper result.
- **The free Live floor is the funnel.** People come for the round, the lasers and the chat, vote, see their record, then see Capstone and the creators.
- **Referrals:** a member who brings a paying member gets a free month.
- **Launch:** a countdown on the under-construction page, the founders' price, and a launch-night battle.

### Numbers to watch every week
Members joined, members who voted, creators listed, Spotlight and Capstone subscribers, monthly income, cancellations, and Capstone attendance.

## 5. Check before charging (not legal advice)
- **Paid trading calls can be regulated.** The CFTC treats someone who, for money, advises others about trading futures, options or swaps as a commodity trading advisor, which can mean registering ([explainer](https://btlaw.com/en/insights/alerts/2023/does-the-cftc-require-trading-screens-and-technology-providers-to-register-as-ctas)). Kalshi's markets are CFTC-regulated. Before selling Capstone (where members see callers' calls early) or Spotlight for signal sellers, **ask a lawyer** whether you, or the callers, need to register or qualify for an exemption, and how to word the offer.
- **Prizes:** if tournaments or battles ever give prizes for winning, check the rules on contests first.
- **Terms and Privacy** are written with paid plans in mind (`/terms`, `/privacy`), but a lawyer should read them before launch.

## 6. Build order
1. Owner decides prices (this doc) and sets up a Stripe account.
2. Pricing page and the plan records in the ledger.
3. Stripe Checkout and the automatic on/off (tested against Stripe's test mode).
4. Spotlight placement on the front page, Live page and Marketplace.
5. The owner's money view (members, plans, monthly totals, export).
