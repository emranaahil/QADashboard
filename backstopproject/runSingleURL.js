// Do NOT hardcode PLAYWRIGHT_BROWSERS_PATH — Render/Dockerfile set it to the
// correct location for the Playwright base image (/ms-playwright). Overriding
// it here used to make BackstopJS look for Chromium under the wrong path.
console.log(
  "PLAYWRIGHT_BROWSERS_PATH=",
  process.env.PLAYWRIGHT_BROWSERS_PATH
);
process.chdir(__dirname);

const path = require("path");
const fs = require("fs");
const { execSync, spawnSync } = require("child_process");

const backstopEntry = require.resolve("backstopjs");
console.log("Backstop package:", backstopEntry);

try {
  // List the actual backstopjs install directory (resolved via Node) so this
  // works regardless of which node_modules tree the package lives in.
  const backstopDir = path.dirname(backstopEntry).replace(/\/core.*$/, "");
  console.log("Backstop files:", fs.readdirSync(backstopDir));
} catch (e) {
  console.error("Cannot read backstop folder:", e.message);
}

function runReference() {
  console.log("Running from:", __dirname);

  const result = spawnSync(
    "npx",
    ["backstop", "reference"],
    {
      stdio: "inherit",
      cwd: __dirname,
      shell: true
    }
  );

  if (result.status !== 0) {
    throw new Error(`backstop reference failed (exit ${result.status})`);
  }
}


try {
  const testUrl = process.argv[2];

  execSync(`node generateSingleURL.js "${testUrl}"`, {
    stdio: "inherit"
  });

  runReference();
  
  try {
  execSync("npx backstop test", {
      stdio: "inherit",
      cwd: __dirname,
      shell: true
    });
  } catch (err) {
    console.log("Backstop test failed (expected), continuing...");
  }

  execSync("node generateReport.js", {
    stdio: "inherit"
  });


} catch (e) {
  console.error("❌ Pipeline failed:", e.message);
  process.exit(1);
}
