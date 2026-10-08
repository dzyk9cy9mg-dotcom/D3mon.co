// Member admin from the command line. Works while the server runs: it re-reads roles.json within seconds.
//   npm run users                              list members and their roles
//   npm run role -- <username> owner|admin|member
//   npm run role -- <username> ban|unban
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { readRoles, writeRoles } from "./accounts.js";

const cfg = loadConfig();
const rolesFile = path.join(cfg.dataDir, "roles.json");

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, "accounts.json"), "utf8")).users || [];
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const [cmd, username, action] = process.argv.slice(2);
const users = loadUsers();
const roles = readRoles(rolesFile);

if (cmd === "users") {
  if (!users.length) console.log("No accounts yet.");
  for (const u of users) {
    const role = roles.owner === u.id ? "owner" : roles.admins.includes(u.id) ? "admin" : "member";
    console.log(`${u.username.padEnd(24)} ${role.padEnd(7)} ${roles.banned.includes(u.id) ? "banned " : "       "} ${u.name}`);
  }
} else if (cmd === "role") {
  const u = users.find(x => x.username.toLowerCase() === String(username || "").toLowerCase());
  if (!u) fail(username ? `No account named "${username}".` : "Usage: npm run role -- <username> owner|admin|member|ban|unban");
  const admins = new Set(roles.admins), banned = new Set(roles.banned);
  let owner = roles.owner;
  switch (action) {
    case "owner":
      if (owner && owner !== u.id) admins.add(owner); // the previous owner stays an admin
      owner = u.id;
      admins.delete(u.id);
      break;
    case "admin":
      if (owner === u.id) fail("That account is the owner. Make someone else the owner first.");
      admins.add(u.id);
      break;
    case "member":
      if (owner === u.id) fail("That account is the owner. Make someone else the owner first.");
      admins.delete(u.id);
      break;
    case "ban":
      if (owner === u.id) fail("The owner can't be banned.");
      banned.add(u.id);
      break;
    case "unban":
      banned.delete(u.id);
      break;
    default:
      fail("Usage: npm run role -- <username> owner|admin|member|ban|unban");
  }
  writeRoles(rolesFile, { owner, admins: [...admins], banned: [...banned] });
  console.log(`${u.username}: ${action} done.`);
} else {
  fail("Usage:\n  npm run users\n  npm run role -- <username> owner|admin|member|ban|unban");
}
