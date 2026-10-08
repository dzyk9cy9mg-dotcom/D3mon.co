# Putting D3MON.CO online

The site is a small Node.js program that serves the page and keeps its data. A host needs:

- **Node.js 20 or newer**, running all the time. A host that only serves files can't run the full site (see [Plain file hosting](#plain-file-hosting)).
- **A folder the site can write to** that survives restarts and redeploys. This is where accounts and posts are saved.
- **HTTPS** in front of it. Most hosts and panels set this up for you.

## 1. Build the upload file

```sh
npm run package
```

This makes `dist/d3mon-site.zip`, about 350 KB. It unpacks into a `d3mon/` folder with the page, the server and the docs, and leaves out tests, site data and `.env`. The site has no dependencies, so the host doesn't need `npm install`.

## 2. Claim the owner account first

The first account to sign up becomes the owner, with all the admin tools. On a public address, a stranger could get there before you. Set `D3MON_OWNER` to the username you'll use, then sign up with it as soon as the site is up.

## 3. Set it up on your host

### A server you can SSH into

```sh
scp dist/d3mon-site.zip you@server:
ssh you@server
sudo mkdir -p /srv && sudo unzip ~/d3mon-site.zip -d /srv && sudo chown -R you /srv/d3mon
cd /srv/d3mon
D3MON_OWNER=yourname npm start        # check it starts, then Ctrl+C
```

Keep it running with systemd, in `/etc/systemd/system/d3mon.service`:

```ini
[Unit]
Description=D3MON.CO
After=network.target

[Service]
User=you
WorkingDirectory=/srv/d3mon
ExecStart=/usr/bin/node server/start.js
Environment=PORT=3000 HOST=127.0.0.1 D3MON_TRUST_PROXY=1 D3MON_OWNER=yourname
Restart=always

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now d3mon
```

Put HTTPS in front with Caddy, in `/etc/caddy/Caddyfile`:

```
d3mon.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Or with nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### A hosting panel with Node.js apps

This covers cPanel's "Setup Node.js App", Plesk, and other panels built on Passenger.

1. Upload `d3mon-site.zip` with the file manager and extract it. You get a `d3mon` folder.
2. Create a Node.js application:
   - **Node.js version:** 20 or newer
   - **Application root:** the `d3mon` folder
   - **Startup file:** `app.cjs`
   - **Application URL:** wherever the site should live
3. Add environment variables in the panel:
   - `D3MON_OWNER`: your username
   - `D3MON_TRUST_PROXY=1`
   - If the URL has a path, such as `yourdomain.com/d3mon`: `D3MON_BASE_PATH=/d3mon`
4. Start or restart the app. It doesn't need `npm install`.

The page keeps one connection open for live updates. If a host cuts long connections, the page reconnects by itself.

### An app platform

This covers Render, Railway, Fly.io and similar.

- Give it the `d3mon` folder, either by upload or through a git repository it deploys from.
- **Start command:** `npm start`. There's no build step.
- **Environment:**
  - `HOST=0.0.0.0`, so traffic from outside the container reaches the site
  - `D3MON_TRUST_PROXY=1`
  - `D3MON_OWNER`
  - `D3MON_DATA_DIR` set to a mounted persistent disk. Without one, everything resets on each deploy.
- Run **one instance**. The data lives in that one process.

### Plain file hosting

On a host that only serves files, the page loads but stays in its offline view: no sign-in, posts or live data. Run the site on one of the hosts above instead, and link to it or point a subdomain at it.

## 4. Living under a path on another site

To put D3MON.CO at `https://yourdomain.com/d3mon/` rather than on its own domain:

- Set `D3MON_BASE_PATH=/d3mon`.
- Send `/d3mon/` to the site. Your proxy may keep or strip the `/d3mon` prefix; both work. With nginx:

```nginx
location /d3mon/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 5. Once it's up

- Sign up with the owner username. The admin button appears in the header.
- To make more admins, run this in the `d3mon` folder on the host (over SSH, or in the panel's terminal): `npm run role -- <username> admin`. The README lists the other role commands.
- To turn on Cosmic, the AI assistant, set `ANTHROPIC_API_KEY`. Answers are billed to that key.
- Back up `data/`: `accounts.json`, `roles.json` and `db.json`.
- To update, build a new zip and replace everything except `data/` and any `.env`, then restart.

Every setting is listed in the README.
