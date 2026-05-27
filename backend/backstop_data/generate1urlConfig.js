const fs = require('fs');

// Reset QA report each run
fs.writeFileSync('qaReport.json', JSON.stringify([], null, 2));



  /* ---------------- URLS ---------------- */

const URLS = [
  {
    label: "Home Compare",

    // TEST URL
    url: "https://staging.telehealthmed.com/",

    // REFERENCE URL
    referenceUrl: "https://telehealthmed.com/"
  }
];

/* ---------------- VIEWPORTS ---------------- */

const viewports = [
  { label: "desktop", width: 1536, height: 730 }
// { label: "iPhone13_portrait", width: 390, height: 844 },
//   { label: "iPhone13_landscape", width: 844, height: 390 },
//   { label: "iPhone15plus_portrait", width: 430, height: 932 },
//   { label: "iPhone15plus_landscape", width: 932, height: 430 },
//   { label: "S21_portrait", width: 360, height: 800 },
//   { label: "S21_landscape", width: 800, height: 360 },
//   { label: "tablet_portrait", width: 768, height: 1024 },
//   { label: "tablet_landscape", width: 1024, height: 768 }
];


/* ---------------- SCENARIOS ---------------- */

const scenarios = URLS.map(page => ({
  label: page.label,

  // TEST PAGE
  url: page.url,

  // REFERENCE PAGE
  referenceUrl: page.referenceUrl,

  selectors: ["document"],
  readySelector: "body",

  fullPage: true,
  selectorExpansion: true,
  requireSameDimensions: true,


  delay: 8000,
  misMatchThreshold: 0.1
}));

/* ---------------- CONFIG ---------------- */ 
  const config = {
    id: "ui-check",
  
    viewports,
  
    onReadyScript: "UIcheckReference.js",
  
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
  "--disable-web-security" ]
  }
  };

  fs.writeFileSync(
    'backstop.json',
    JSON.stringify(config, null, 2)
  );

  console.log("✅ backstop.json generated!");


