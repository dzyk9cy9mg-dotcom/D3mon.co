# Linking the site's chat to the D3MON Discord

The Grand Hall's chat, the main page's Cortex chat and the D3MON Discord are one conversation:

- **The main channel** (for example `#trading-floor`) is the hall's chat and the Cortex main floor.
- **Whole categories** add every text channel in them, and the text chat of their voice channels, each as a channel of its own on the site:
  - in the hall's chat panel, each one is a tab;
  - in the Cortex, each one is a channel. A Discord channel named like a Cortex channel (`btc`, `eth`, `sol`, `xrp`, `kalshi`, `polymarket`, `off-topic`) joins that one.
  - A channel added to a linked category joins by itself within 5 minutes, and one moved out is unlinked (its messages stay).
- **From Discord to the site:** every few seconds, D3MON reads each linked channel's new messages with a bot and adds them under the sender's Discord name, marked "Discord".
- **From the site to Discord:** every new message in a linked channel, from the hall or the Cortex, goes to that Discord channel under the member's name with "· D3MON" after it. Nobody gets pinged from the site: `@everyone` and mentions are switched off.
- **Voice talk isn't carried,** only voice channels' text chat. If Discord won't let the bot post in a voice channel's chat, that channel is read-only on the site, and the admins' health check shows why.
- **Rules:** the site's chat rules apply to site members (bans, mutes, slow mode, masked words). Discord's own moderators look after Discord.
- **Only link public categories.** The site's chat is public, so anyone visiting the site can read every linked channel. Never link staff, mod or private channels.

The code is in `server/arena/discord.js`, and the tests are in `test/discord.test.js`, which use a stand-in Discord.

## Setting it up (once)

You need to be an admin of the D3MON Discord server.

1. **Make the bot.**
   - Go to https://discord.com/developers/applications and choose **New Application**. Name it `D3MON`.
   - Under **Bot**, choose **Reset Token** and copy the token. It's a secret: never paste it in a chat, the repo or a screenshot.
   - Still under **Bot**, turn on **Message Content Intent** and save.
2. **Invite the bot with the three permissions it needs:** View Channels, Read Message History and Manage Webhooks. Manage Webhooks lets it make its own "D3MON" webhook in each linked channel.
   - Copy the **Application ID** from **General Information**.
   - Open this link with your Application ID in place of `PASTE_ID_HERE`:
     ```
     https://discord.com/oauth2/authorize?client_id=PASTE_ID_HERE&scope=bot&permissions=536937472
     ```
   - Choose the D3MON server and authorize it. If the bot is already in the server, authorizing again just updates its permissions.
3. **Copy the ids.**
   - In Discord, turn on **User Settings → Advanced → Developer Mode**.
   - Right-click the main channel and choose **Copy Channel ID**.
   - Right-click each category to link and choose **Copy Category ID**.
   - You don't need to keep track of which id is which: D3MON asks Discord. Just put the main channel's id first.
4. **Put them on the server.**
   - The settings go in `/srv/d3mon/.env`, which git never touches. Open it with:
     ```sh
     sudo nano /srv/d3mon/.env
     ```
   - Put these two lines in it, with your values, each on its own line and with no spaces around the `=`. The ids are separated by commas, with the main channel first.
     ```
     D3MON_DISCORD_BOT_TOKEN=the bot token
     D3MON_DISCORD_IDS=main channel id,category id,another id
     ```
   - Save with Ctrl+O, Enter (nano should say "Wrote 2 lines"), then close with Ctrl+X.
   - Each id may be a channel or a category: a category links every channel in it, and a channel links itself. The first channel in the line is the main one. (`D3MON_DISCORD_CHANNEL_ID` names the main channel instead, if you prefer to say it outright.)
   - **The `d3mon` service doesn't read `.env` by itself:** its unit sets `D3MON_DOTENV=off`. So systemd loads the file instead, through a drop-in. It only needs doing once:
     ```sh
     sudo chmod 600 /srv/d3mon/.env
     sudo mkdir -p /etc/systemd/system/d3mon.service.d
     printf '[Service]\nEnvironmentFile=/srv/d3mon/.env\n' | sudo tee /etc/systemd/system/d3mon.service.d/discord.conf
     sudo systemctl daemon-reload && sudo systemctl restart d3mon
     ```
   - To check the file without showing the token, run `sudo grep -o '^[A-Z0-9_]*=' /srv/d3mon/.env`. It should list both names.
   - If you change `.env` later, run `sudo systemctl restart d3mon` afterwards.
5. **Check it.**
   - Post in a linked Discord channel. Within a few seconds it should show on the site, marked "Discord".
   - Post in the hall, and it should show in Discord.
   - Admins can see each link's health in `GET /api/v1/hall/chat` (`link`: when each channel was last read and sent to, and any error). The secrets are never shown.

The first read of each channel only marks where to start, so old messages aren't poured into the site. Without categories, the main channel alone works too, using the bot's own webhook or one you give in `D3MON_DISCORD_WEBHOOK_URL`. To switch the link off, remove the lines and restart.
