import { spawnSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
// Serve PDF.js directly from public/ so Vite does not inject its dev client into a worker.
copyFileSync(
  fileURLToPath(new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url)),
  fileURLToPath(new URL("../public/pdf.worker.min.mjs", import.meta.url)),
);
copyFileSync(
  fileURLToPath(new URL("../node_modules/pdfjs-dist/LICENSE", import.meta.url)),
  fileURLToPath(new URL("../public/pdfjs-LICENSE.txt", import.meta.url)),
);
const managedLinux = readExecutionProfile() === "managed-linux";

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []), ...args];
await import(cli.href);
