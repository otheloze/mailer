// Dev launcher: starts the app with ELECTRON_RUN_AS_NODE removed, because
// VS Code's terminals set it and Electron would otherwise run as plain Node.
const { spawn } = require("node:child_process");
const electron = require("electron"); // path to the Electron binary when run from Node

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["."], { cwd: __dirname, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
