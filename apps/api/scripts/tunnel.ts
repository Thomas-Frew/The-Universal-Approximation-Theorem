import { spawn } from "node:child_process";

/**
 * Opens an SSH tunnel to the judge droplet, so JUDGE0_URL (a localhost address)
 * reaches Judge0 there. Run it with `pnpm tunnel` and leave it running;
 * Ctrl+C closes it.
 */

const host = process.env.JUDGE0_SSH_HOST;
const url = process.env.JUDGE0_URL;
if (!host || !url) {
  console.error("Set JUDGE0_SSH_HOST and JUDGE0_URL in apps/api/.env (see .env.example).");
  process.exit(1);
}

// The local end is whatever port JUDGE0_URL names; the far end is where
// Judge0 listens on the droplet.
const localPort = new URL(url).port || "80";
const remotePort = process.env.JUDGE0_REMOTE_PORT ?? "2358";

console.log(`Tunnel open: localhost:${localPort} -> ${host} (Judge0 on port ${remotePort}). Ctrl+C to close.`);

const ssh = spawn(
  "ssh",
  [
    "-N", // no remote shell, only the tunnel
    "-o", "ExitOnForwardFailure=yes", // fail loudly if the local port is taken
    "-o", "ServerAliveInterval=30", // notice a dropped connection
    "-L", `${localPort}:127.0.0.1:${remotePort}`,
    host,
  ],
  { stdio: "inherit" },
);
ssh.on("exit", (code) => process.exit(code ?? 0));

// If this script is stopped, take the ssh process down with it.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => ssh.kill(signal));
}
