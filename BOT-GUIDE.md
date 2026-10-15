# D3MON.CO: connecting your bot

This guide is for owners of an **approved** bot or script in Battle of the Bots. It shows how to make an API key and send a test call. It takes about five minutes.

In the examples below, replace `https://YOUR-D3MON-SITE` with the D3MON.CO web address you were given.

## What the key is (and isn't)

- **A D3MON.CO bot key only sends your bot's up/down calls.** It can't sign in to the site, see anything private, or touch money.
- **Never send D3MON.CO your exchange or Kalshi keys, passwords or wallet phrases.** We never ask for them, and the site refuses anything that looks like one.
- **Keep your bot key private.** Anyone holding it can send calls as your bot. If it leaks, revoke it (step 5) and make a new one.

## 1. Make a key

1. Sign in, then open **`https://YOUR-D3MON-SITE/my`**.
2. Under your bot's name, type a label (for example `my server`) and click **Make a new key**.
3. Click **Copy key**. The key starts with `d3b_`. **It's shown only once**, so save it somewhere safe, like your bot's settings or a password manager.
4. Click **I've saved it**.

## 2. Check the key works

On macOS or Linux, run this in a terminal. Replace `d3b_YOUR_KEY` with your key:

```sh
curl https://YOUR-D3MON-SITE/api/v1/bot/me -H "Authorization: Bearer d3b_YOUR_KEY"
```

**If it works**, you'll see your bot's name and `"nextRound"`, the time the next round starts.

**If you see `bad_key`**, the key was copied wrong or has been revoked.

## 3. Send a test call

```sh
curl -X POST https://YOUR-D3MON-SITE/api/v1/bot/calls \
  -H "Authorization: Bearer d3b_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"schema":"d3mon.call/v1","market":"KXBTC15M","direction":"up"}'
```

**If it works**, you'll see `"ok":true`, the `round` your call is for, and the time the server received it. Use `"direction":"down"` for down.

The same call from Python, with no extra packages:

```python
import json, urllib.request

req = urllib.request.Request(
    "https://YOUR-D3MON-SITE/api/v1/bot/calls",
    data=json.dumps({"schema": "d3mon.call/v1", "market": "KXBTC15M", "direction": "up"}).encode(),
    headers={"Authorization": "Bearer d3b_YOUR_KEY", "Content-Type": "application/json"},
    method="POST",
)
print(urllib.request.urlopen(req).read().decode())
```

## 4. The rules

- **Rounds:** they're Kalshi's BTC 15-minute rounds, starting at :00, :15, :30 and :45 each hour.
- **Which round:** a call goes to the **next round** that hasn't started yet. To call a later one, add `"round":"2026-10-15T19:00:00Z"`, which is the round's start time in UTC.
- **The lock:** calls must arrive **before the round starts**. The server's clock decides, not yours. After that the round is locked, and you'll get `round_locked`.
- **Changing your mind:** you can change your call any time before the lock, and the last one counts. Sending the same call twice is harmless.
- **Sealed calls:** until the round starts, others can see that your bot has called, but not which way. Then everyone sees it.
- **Results:** when the round's result is in, your call is marked right or wrong.
- **Watching:** your recent calls are on `/my`. If you're in a battle, they're also on **`/board`**.

## 5. Optional: custom stats for your card

Your card shows stats D3MON.CO works out from your calls (hit rate, streaks and so on). You can add up to 20 of your own, such as your average edge or an equity curve. They're always shown as **self-reported**.

1. On `/my`, under **Add a custom stat**, choose:
   - a **key**, such as `avg_edge` (lowercase letters, digits and `_`)
   - a **label**, such as `Average edge`
   - a **type**: `number`, `integer`, `percent` (0 to 1), `duration` (milliseconds), `text`, `series` or `histogram`
2. Every stat starts **hidden**. Choose who sees it (Public, Members only or Private), then click **Save stats card**.
3. Have your bot send values whenever they change:

```sh
curl -X POST https://YOUR-D3MON-SITE/api/v1/bot/stats \
  -H "Authorization: Bearer d3b_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"schema":"d3mon.stats/v1","values":[{"key":"avg_edge","value":0.034}]}'
```

**If it works**, you'll see `"accepted":["avg_edge"]`. Sending the same value again shows it under `"unchanged"`. Only read-only results belong here: never send keys, passwords or account details.

## 6. If something goes wrong

| You see | What it means |
| --- | --- |
| `bad_key` | Wrong, mistyped or revoked key |
| `round_locked` | Too late: that round has started. Your next call goes to the following round |
| `entrant_suspended` | Your bot has been paused. Ask HardSmoke |
| `looks_like_secret` | Something in your request looked like a password or key. Remove it |
| `invalid_argument` | A field is missing or wrong. The message says which one |
| `not_defined` | That custom stat isn't defined on `/my` yet |
| `resource_exhausted` | Too many requests. Slow down: one call per round is all you need |

To **revoke** a key, open `/my` and click **Revoke** next to it. It stops working straight away, and you can make a new one. Each bot can have up to 3 keys.

Questions? Ask HardSmoke.
