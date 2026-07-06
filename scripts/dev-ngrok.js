const { spawn } = require("node:child_process");

const port = process.env.NGROK_PORT || process.env.API_PORT || "3000";
const domain = process.env.NGROK_DOMAIN;
const args = ["http", port];

if (domain) {
  args.push("--domain", domain);
}

const child = spawn("ngrok", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
