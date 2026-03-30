#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");

function stripEnvVar(env, key) {
  const target = key.toLowerCase();
  for (const name of Object.keys(env)) {
    if (name.toLowerCase() === target) delete env[name];
  }
}

const env = { ...process.env, NODE_ENV: "development" };
stripEnvVar(env, "ELECTRON_RUN_AS_NODE");

const child = spawn(electronBinary, ["."], { env, stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (typeof code === "number") process.exit(code);
  process.exit(signal ? 1 : 0);
});

child.on("error", () => {
  process.exit(1);
});
