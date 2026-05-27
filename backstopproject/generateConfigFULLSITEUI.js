const fs = require('fs');
const axios = require('axios');
const xml2js = require('xml2js');

fs.writeFileSync('qaReport.json', JSON.stringify([], null, 2));
// TERMINAL ARGS
const testUrl = process.argv[2];
const referenceUrl = process.argv[3];

// VALIDATION
if (!testUrl) {
  console.log("❌ Please provide test URL");
  process.exit(1);
}

// CLEAN URLS
const cleanTestUrl = testUrl.replace(/\/$/, "");

const cleanReferenceUrl = referenceUrl
  ? referenceUrl.replace(/\/$/, "")
  : null;

// SITEMAP URL
const sitemapTestUrl = `${cleanTestUrl}/sitemap.xml`;
const sitemapReferenceUrl = cleanReferenceUrl
  ? `${cleanReferenceUrl}/sitemap.xml`
  : null;


  console.log("🌐 Sitemap Test:", sitemapTestUrl);
  console.log("🌐 Sitemap Reference:", sitemapReferenceUrl);

console.log('✅ backstop.json updated');


async function run() {
 // FETCH SITEMAP
 const response = await axios.get(sitemapTestUrl);

 // PARSE XML
 const parsed = await xml2js.parseStringPromise(response.data, {
  ignoreAttrs: true,
  explicitArray: false
});


 console.log("🌐  parsed:", parsed);

 
 // EXTRACT URLS
 let urls = [];

// CASE 1: sitemap index (your case)
if (parsed?.sitemapindex?.sitemap) {
  const sitemapUrls = parsed.sitemapindex.sitemap.map(s => s.loc);

  console.log(`📦 Found ${sitemapUrls.length} child sitemaps`);

  const results = await Promise.all(
    sitemapUrls.map(async (smUrl) => {
      try {
        const res = await axios.get(smUrl);

        const p = await xml2js.parseStringPromise(res.data, {
          ignoreAttrs: true,
          explicitArray: false
        });

        return p?.urlset?.url?.map(u => u.loc) || [];
      } catch (err) {
        console.log("❌ Failed sitemap:", smUrl);
        return [];
      }
    })
  );

  urls = results.flat();
}

// CASE 2: normal sitemap
else if (parsed?.urlset?.url) {
  urls = parsed.urlset.url.map(u => u.loc);
}

console.log("🌐 FINAL URL COUNT:", urls.length);

 // GENERATE SCENARIOS
 const scenarios = urls.slice(0, 20).map((url) => ({
   label:
     `Page_${
       url.replace(cleanTestUrl, "").replace(/\//g, "_") || "home"
     }`,

   url,

   referenceUrl: cleanReferenceUrl
     ? url.replace(cleanTestUrl, cleanReferenceUrl)
     : url,
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