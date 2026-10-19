# Linking the hall chat to the D3MON Discord

The Grand Hall's chat, the main page's Cortex chat (main floor) and **one D3MON Discord channel** are one conversation:

- **From Discord to the hall:** every few seconds, the D3MON server reads the channel's new messages with a bot and adds them to the hall chat, under the sender's Discord name and marked "Discord".
- **From the hall to Discord:** every new message in the hall or on the Cortex main floor goes to the channel through a webhook, under the member's name with "· D3MON" after it. Nobody gets pinged from the site: `@everyone` and mentions are switched off.
- **Rules:** the site's chat rules apply to site members (bans, mutes, slow mode, masked words). Discord's own moderators look after Discord.

The code is in `server/arena/discord.js`, and the tests are in `test/discord.test.js`, which use a stand-in Discord.

## Setting it up (once)

You need to be an admin of the D3MON Discord server.

1. **Make the bot.**
   - Go to https://discord.com/developers/applications and choose **New Application**. Name it `D3MON`.
   - Under **Bot**, choose **Reset Token** and copy the token. It's a secret: never paste it in a chat, the repo or a screenshot.
   - Still under **Bot**, turn on **Message Content Intent** and save.
2. **Invite the bot.**
   - Under **OAuth2 → URL Generator**, tick the `bot` scope.
   - Then tick the **View Channels** and **Read Message History** permissions.
   - Open the link it makes and add the bot to the D3MON server.
3. **Make the webhook.**
   - In Discord, open the chosen channel's settings: **Integrations → Webhooks → New Webhook**.
   - Name it `D3MON` and choose **Copy Webhook URL**. That's a secret too.
4. **Copy the channel's id.**
   - In Discord, turn on **User Settings → Advanced → Developer Mode**.
   - Right-click the channel and choose **Copy Channel ID**.
5. **Put the three values on the server.** They go in `/srv/d3mon/.env`, which git never touches:
   ```sh
   sudo nano /srv/d3mon/.env
   ```
   Add these three lines with your values, then save (Ctrl+O, Enter, Ctrl+X):
   ```
   D3MON_DISCORD_BOT_TOKEN=the bot token
   D3MON_DISCORD_CHANNEL_ID=the channel id
   D3MON_DISCORD_WEBHOOK_URL=the webhook URL
   ```
   Then restart:
   ```sh
   sudo systemctl restart d3mon
   ```
6. **Check it.**
   - Post in the Discord channel. Within a few seconds it should show in the hall's chat, marked "Discord".
   - Post in the hall, and it should show in the channel.
   - Admins can see the link's health in `GET /api/v1/hall/chat` (`link`: when it last read and sent, and the last error). The secrets are never shown.

The first read after a restart only marks where to start, so the channel's old messages aren't poured into the hall. To switch the link off, remove the three lines and restart.
