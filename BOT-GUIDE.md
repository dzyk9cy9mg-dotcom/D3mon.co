# D3MON.CO: connecting your bot

This guide is for owners of an **approved** bot or script in Battle of the Bots. It shows how to make an API key, send a test call and send your stats. The first part takes about five minutes.

In the examples below, replace `https://YOUR-D3MON-SITE` with the D3MON.CO web address you were given.

## What the key is (and isn't)

- **A D3MON.CO bot key only sends your bot's up/down calls and its stats.** It can't sign in to the site, see anything private, or touch money.
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

## 5. Send your stats for your card

Your stats card can show two kinds of stat:

- **Verified:** worked out by D3MON.CO from the calls your bot sends (timed and locked by the server) and Kalshi's results: win rate, record, streaks, form, against the crowd and more. Nobody can type these in. They appear once your bot makes calls.
- **Self-reported:** the stats below, which you send. D3MON.CO doesn't check them, so they're labelled **self-reported**.

Battles are scored separately by the server, whatever your card shows.

Every stat starts **hidden**. On `/my`, choose who sees each one (Public, Members only or Private), then click **Save stats card**. Only stats that have a value appear on a card. Send only read-only results: never keys, passwords or account details.

### Typing them in

No code needed: on `/my`, type values in the **New value** column and click **Save values**. Type percentages as percentages (`62` for 62%), durations in seconds, records as `wins-losses` (`12-7`), and series or histograms in the JSON shape shown below. This is the easiest route for chart scripts that can't send a request with a key.

### Sending them from your bot

Send any of the stats below, as many as you like in one request (up to 50), whenever they change. Values that haven't changed are skipped, and each new value is kept in your history. Leave a stat out if you don't track it.

```sh
curl -X POST https://YOUR-D3MON-SITE/api/v1/bot/stats \
  -H "Authorization: Bearer d3b_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"schema":"d3mon.stats/v1","values":[{"key":"win_rate","value":0.62},{"key":"total_profit","value":184.25}]}'
```

**If it works**, you'll see `"accepted":["win_rate","total_profit"]`. Sending the same values again shows them under `"unchanged"`. Add `"asOf":"2026-10-15T19:00:00Z"` if the numbers are from earlier (up to 30 days ago).

The same from Python:

```python
import json, urllib.request

stats = {"win_rate": 0.62, "total_calls": 412, "wins_losses": {"w": 255, "l": 157}}
req = urllib.request.Request(
    "https://YOUR-D3MON-SITE/api/v1/bot/stats",
    data=json.dumps({"schema": "d3mon.stats/v1", "values": [{"key": k, "value": v} for k, v in stats.items()]}).encode(),
    headers={"Authorization": "Bearer d3b_YOUR_KEY", "Content-Type": "application/json"},
    method="POST",
)
print(urllib.request.urlopen(req).read().decode())
```

### The standard stats

HardSmoke keeps this list, and it can grow. The live list, with each stat's type, is always at `https://YOUR-D3MON-SITE/api/v1/stat-catalog`.

| Key | What it is | Type | Example value |
| --- | --- | --- | --- |
| **Performance** | | | |
| `win_rate` | Win rate | percent | `0.62` |
| `total_calls` | Total calls | integer | `412` |
| `wins_losses` | Wins / losses | record | `{"w": 255, "l": 157}` |
| `current_streak` | Current streak: + wins, − losses in a row | integer | `3` (or `-2`) |
| `best_win_streak` | Best win streak | integer | `9` |
| `worst_loss_streak` | Worst losing streak | integer | `5` |
| **Profit** | | | |
| `total_profit` | Total profit | money | `184.25` |
| `profit_per_contract` | Profit per $1 contract | money | `0.0412` |
| `roi` | ROI | return | `0.237` |
| `avg_profit_per_trade` | Average profit per trade | money | `0.45` |
| `biggest_win_loss` | Biggest win / biggest loss | histogram (dollars) | `{"win": 12.4, "loss": -8.1}` |
| `max_drawdown` | Max drawdown | percent | `0.14` |
| `equity_curve` | Equity curve | series (dollars) | `[{"t": "2026-10-14", "v": 1040.1}, …]` |
| **Timing** | | | |
| `best_hours` | Best trading hours (win rate by UTC hour) | histogram (percent) | `{"13:00": 0.71, "14:00": 0.66}` |
| `best_days` | Best days of the week (win rate by day) | histogram (percent) | `{"Mon": 0.64, "Fri": 0.68}` |
| `avg_lead_time` | Average lead time before the round starts | duration | `95000` (1 min 35 s) |
| `trades_per_day` | Trades per day | number | `38.5` |
| **Daily & records** | | | |
| `today_record` | Today's record | record | `{"w": 12, "l": 7, "profit": 4.2}` |
| `best_day` | Best day ever | record | `{"w": 31, "l": 9, "t": "2026-09-02"}` |
| `last_7_days` | Last 7 days | record | `{"w": 160, "l": 101}` |
| `last_30_days` | Last 30 days | record | `{"w": 650, "l": 431}` |
| **Strategy** | | | |
| `avg_confidence` | Average confidence | percent | `0.68` |
| `high_conf_accuracy` | Accuracy on high-confidence calls | percent | `0.74` |
| `up_down_ratio` | Up vs down calls (counts) | histogram | `{"up": 230, "down": 182}` |
| `win_rate_up_down` | Win rate on up / down calls | histogram (percent) | `{"up": 0.64, "down": 0.59}` |
| `strategy` | Strategy, in your words | text | `"Momentum on the 1-minute chart"` |
| `data_sources` | Data sources | text | `"Coinbase and Kraken BTC trades"` |
| **Risk** | | | |
| `avg_position_size` | Average position size | money | `25` |
| `sharpe_ratio` | Sharpe ratio | number | `1.8` |
| `launch_date` | Launch date (the card also shows days active) | date | `"2026-03-01"` |

### Types

| Type | Send | Example |
| --- | --- | --- |
| `number` | any number | `1.8` |
| `integer` | a whole number | `412` |
| `percent` | a fraction from 0 to 1 | `0.62` means 62% |
| `return` | a signed fraction, −1 or more | `0.237` means +23.7%, `-0.1` means −10% |
| `money` | US dollars, signed, up to 4 decimals | `184.25` means $184.25 |
| `duration` | milliseconds, 0 or more | `95000` means 1 min 35 s |
| `text` | 1 to 500 characters | `"Momentum on the 1-minute chart"` |
| `date` | a date, not in the future | `"2026-03-01"` |
| `record` | wins `w` and losses `l`, with an optional label `t` and `profit` in dollars | `{"w": 12, "l": 7, "t": "2026-10-15", "profit": 4.2}` |
| `series` | up to 500 points, each a label `t` and a number `v` | `[{"t": "2026-10-14", "v": 1040.1}]` |
| `histogram` | up to 48 named numbers | `{"up": 0.64, "down": 0.59}` |

### A full example

Every standard stat in one request:

```json
{"schema": "d3mon.stats/v1", "values": [
  {"key": "win_rate", "value": 0.62},
  {"key": "total_calls", "value": 412},
  {"key": "wins_losses", "value": {"w": 255, "l": 157}},
  {"key": "current_streak", "value": 3},
  {"key": "best_win_streak", "value": 9},
  {"key": "worst_loss_streak", "value": 5},
  {"key": "total_profit", "value": 184.25},
  {"key": "profit_per_contract", "value": 0.0412},
  {"key": "roi", "value": 0.237},
  {"key": "avg_profit_per_trade", "value": 0.45},
  {"key": "biggest_win_loss", "value": {"win": 12.4, "loss": -8.1}},
  {"key": "max_drawdown", "value": 0.14},
  {"key": "equity_curve", "value": [{"t": "2026-10-13", "v": 1012.5}, {"t": "2026-10-14", "v": 1040.1}, {"t": "2026-10-15", "v": 1063.8}]},
  {"key": "best_hours", "value": {"13:00": 0.71, "14:00": 0.66, "20:00": 0.58}},
  {"key": "best_days", "value": {"Mon": 0.64, "Tue": 0.59, "Fri": 0.68}},
  {"key": "avg_lead_time", "value": 95000},
  {"key": "trades_per_day", "value": 38.5},
  {"key": "today_record", "value": {"w": 12, "l": 7, "profit": 4.2}},
  {"key": "best_day", "value": {"w": 31, "l": 9, "t": "2026-09-02", "profit": 22.5}},
  {"key": "last_7_days", "value": {"w": 160, "l": 101}},
  {"key": "last_30_days", "value": {"w": 650, "l": 431}},
  {"key": "avg_confidence", "value": 0.68},
  {"key": "high_conf_accuracy", "value": 0.74},
  {"key": "up_down_ratio", "value": {"up": 230, "down": 182}},
  {"key": "win_rate_up_down", "value": {"up": 0.64, "down": 0.59}},
  {"key": "strategy", "value": "Momentum on the 1-minute chart, fading moves after big news candles."},
  {"key": "data_sources", "value": "Coinbase and Kraken BTC trades, Kalshi order book"},
  {"key": "avg_position_size", "value": 25},
  {"key": "sharpe_ratio", "value": 1.8},
  {"key": "launch_date", "value": "2026-03-01"}
]}
```

### Your own extra stats

Bots and scripts can also add up to 20 stats of their own, such as an average edge.

1. On `/my`, under **Add a custom stat**, choose a **key** such as `avg_edge` (lowercase letters, digits and `_`, and not one of the keys above), a **label**, and a **type** from the table above.
2. Choose who sees it, like any other stat.
3. Send it the same way: `{"key": "avg_edge", "value": 0.034}`.

## 6. If something goes wrong

| You see | What it means |
| --- | --- |
| `bad_key` | Wrong, mistyped or revoked key |
| `round_locked` | Too late: that round has started. Your next call goes to the following round |
| `entrant_suspended` | Your bot has been paused. Ask HardSmoke |
| `looks_like_secret` | Something in your request looked like a password or key. Remove it |
| `invalid_argument` | A field is missing or wrong. The message says which one |
| `not_defined` | That key isn't one of the standard stats, or a custom stat you've defined on `/my` |
| `resource_exhausted` | Too many requests. Slow down: one call per round is all you need |

To **revoke** a key, open `/my` and click **Revoke** next to it. It stops working straight away, and you can make a new one. Each bot can have up to 3 keys.

Questions? Ask HardSmoke.
