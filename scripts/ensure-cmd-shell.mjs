// scripts/ensure-cmd-shell.mjs
// Auto-configures npm to use cmd.exe on Windows (prevents Git Bash shim issues)

import { execSync } from "node:child_process";
import os from "node:os";

if (os.platform() === "win32") {
  try {
    const out = execSync("npm config get script-shell", { encoding: "utf-8" }).trim().toLowerCase();

    if (!out.includes("cmd.exe")) {
      execSync('npm config set script-shell "C:\\Windows\\System32\\cmd.exe"', { stdio: "inherit" });
      console.log("[ensure-cmd-shell] ✅ Set npm script-shell to cmd.exe");
    } else {
      console.log("[ensure-cmd-shell] ✅ npm script-shell already configured correctly");
    }
  } catch (error) {
    console.error("[ensure-cmd-shell] ⚠️  Could not configure script-shell:", error.message);
    process.exit(1);
  }
} else {
  console.log("[ensure-cmd-shell] ℹ️  Non-Windows platform - skipped");
}
