const fs = require('fs');
const axios = require('axios');
const xml2js = require('xml2js');
fs.writeFileSync('qaReport.json', JSON.stringify([], null, 2));
async function run() {
  const sitemapUrl = 'https://brbmd.com/sitemap.xml';

  const response = await axios.get(sitemapUrl);
  const parsed = await xml2js.parseStringPromise(response.data);

  const urls = parsed.urlset.url.map(u => u.loc[0]);

  const scenarios = urls.slice(0, 20).map(url => ({
    label: `Page_${url.replace('https://brbmd.com/', '').replace(/\//g, '_') || 'home'}`,
    url: url,
    referenceUrl: url.replace('https://brbmd.com', 'https://staging.brbmd.com'),
    delay: 12000,
    selectors: ["document"],
    hideSelectors: [".dynamic-content", ".live-clock", ".ads"],
    removeSelectors: [".dynamic-content", ".live-clock", ".ads"],
    misMatchThreshold: 0.1,
    requireSameDimensions: true
  }));

  const config = {
    id: "backstop_default",

    viewports: [
      { label: "Windows", width: 1536, height: 864 }
     /* { label: "MacBook Pro", width: 1440, height: 900 },
      { label: "iPhone 15 Plus", width: 430 , height: 932 },
      { label: "iphone 13", width: 390, height: 844 },
      { label: "iPad Pro 11 ", width: 834 , height: 1194 },
      { label: "iPad Air", width: 834 , height: 1112 },
      { label: "S21 FE", width: 360 , height: 800 }*/
    ],

    onReadyScript: "removeDynamic.js",

    scenarios: scenarios,

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
    "timeout": 12000,
    "args": [
      "--no-sandbox",
    "--disable-blink-features=AutomationControlled" ]
    }
  };

  fs.writeFileSync('backstop.json', JSON.stringify(config, null, 2));
  console.log("✅ backstop.json generated!");
}

run();