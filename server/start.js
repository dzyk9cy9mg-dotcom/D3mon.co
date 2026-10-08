// Starts the D3MON.CO server (`npm start`). Hosting panels that ask for a startup file can use app.cjs.
import { loadConfig } from "./config.js";
import { createApp } from "./index.js";

const cfg = loadConfig();
const app = await createApp(cfg);

app.server.listen(cfg.port, cfg.host, () => {
  // Hosting panels may move the server onto a socket of their own; then just report the configured port.
  const addr = app.server.address();
  const port = addr && typeof addr === "object" ? addr.port : cfg.port;
  console.log(`D3MON.CO is running at http://${cfg.host === "0.0.0.0" ? "localhost" : cfg.host}:${port}${cfg.basePath}/`);
  if (!cfg.anthropicKey) console.log("Cosmic, the AI assistant, is off. Set ANTHROPIC_API_KEY to turn it on.");
  if (!app.accounts.hasOwner()) console.log(cfg.owner ? `"${cfg.owner}" becomes the site owner when that account signs up.` : "The first account to sign up becomes the site owner.");
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    app.shutdown();
    process.exit(0);
  });
}
