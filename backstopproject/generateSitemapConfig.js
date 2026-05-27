const fs = require('fs');

console.log('✅ backstop.json updated for Sitemap');

const testUrl = process.argv[2];

const URLS = [
  { label: "Sitemap Check", url: testUrl }
];
const viewports = [
  { label: "desktop", width: 1536, height: 730 }
];

const scenarios = URLS.map(page => ({
  label: page.label,
  url: page.url,
  selectors: ["document"],
  fullPage: true,
  selectorExpansion: true,
  requireSameDimensions: true,
  delay: 0,
  misMatchThreshold: 0.1
}));

const config = {
  id: "sitemap-check",
  viewports,
  onReadyScript: "uiChecks.js",
  scenarios,
  paths: {
    bitmaps_reference: "backstop_data/bitmaps_reference",
    bitmaps_test: "backstop_data/bitmaps_test",
    engine_scripts: "backstop_data/engine_scripts",
    html_report: "backstop_data/html_report"
  },
  report: ["browser"],
  engine: "playwright",
  engineOptions: {
    "browser": "chromium",
    "timeout": 60000,
    "args": [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-web-security"
    ]
  }
};

fs.writeFileSync(
  "backstop.json",
  JSON.stringify(config, null, 2)
);

console.log(`✅ Generated ${scenarios.length} scenario for Sitemap`);
