const fs = require('fs');


console.log('✅ backstop.json updated');
/* ---------------- SINGLE URL ---------------- */
///best site to verfiy https://thebiguglywebsite.com/ and https://the-internet.herokuapp.com/challenging_dom 

const testUrl = process.argv[2];


const URLS = [
  { label: "Home Page", url: testUrl }
];
const viewports = [
  { label: "desktop", width: 1536, height: 730 },
  { label: "iPhone13_portrait", width: 390, height: 844 },
  { label: "iPhone13_landscape", width: 844, height: 390 },
  { label: "iPhone15plus_portrait", width: 430, height: 932 },
  { label: "iPhone15plus_landscape", width: 932, height: 430 },
  { label: "S21_portrait", width: 360, height: 800 },
  { label: "S21_landscape", width: 800, height: 360 },
  { label: "tablet_portrait", width: 768, height: 1024 },
  { label: "tablet_landscape", width: 1024, height: 768 }
  
];

/* ---------------- SCENARIOS ---------------- */

const scenarios = URLS.map(page => ({
  label: page.label,
  url: page.url,
  selectors: ["document"],
 // readySelector: "html",
  fullPage: true,
  selectorExpansion: true,
  requireSameDimensions: true,
  delay: 0,
  misMatchThreshold: 0.1
}));

  /*
const config = {
  id: "ui-check",
  ///always keep viewport in this format
  "viewports": [
    { "label": "mobile_portrait", "width": 375, "height": 667 },
    { "label": "mobile_landscape", "width": 667, "height": 375 },
    { "label": "tablet_portrait", "width": 768, "height": 1024 },
    { "label": "tablet_landscape", "width": 1024, "height": 768 },
    { "label": "desktop", "width": 1440, "height": 900 }
  ],*/

  //onReadyScript: "uiChecks.js",
  
  

  /* ---------------- CONFIG ---------------- */

  const config = {
    id: "ui-check",
  
    viewports,
  
    onReadyScript: "uiChecks.js",
  
    scenarios,
  
    paths: {
      bitmaps_reference: "backstop_data/bitmaps_reference",
      bitmaps_test: "backstop_data/bitmaps_test",
      engine_scripts: "backstop_data/engine_scripts",
      html_report: "backstop_data/html_report"
    },
  

  /*
 
  scenarios: [
    {
      label: "Home Page",
      url: "https://thebiguglywebsite.com/",
      selectors: ["document"],
      "readySelector":"body",
      fullPage: true,
      delay: 1000,
      misMatchThreshold: 0.1
      
    }
  ],

  paths: {
    bitmaps_reference: "backstop_data/bitmaps_reference",
    bitmaps_test: "backstop_data/bitmaps_test",
    engine_scripts: "backstop_data/engine_scripts",
    html_report: "backstop_data/html_report"
  },*/

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

/* ---------------- WRITE FILE ---------------- */

fs.writeFileSync(
  "backstop.json",
  JSON.stringify(config, null, 2)
);

console.log(`✅ Generated ${scenarios.length} scenario with ${viewports.length} viewports`);