const fs = require('fs');

const reportFile = 'qaReport.json';

if (!global.__qaReportCleared) {
  fs.writeFileSync(reportFile, JSON.stringify([], null, 2));
  global.__qaReportCleared = true;
  console.log('🧹 cleared old qa logs');
}

module.exports = async (page, scenario, viewport) => {

  console.log("\n==============================");
  console.log("🚀 QA START:", scenario.label, "|", viewport.label);
  console.log("==============================");

  const referenceUrl = scenario.referenceUrl || null;
  const isCompareMode = !!referenceUrl;

  const GLOBAL_WAIT = parseInt(process.env.QA_WAIT || 5000);

  let critical = [];
  let minor = [];
  let missingSections = [];
  let mismatchIndexes = []; // ✅ NEW
  let contentDiff = {};


  /* ---------------- SMART GLOBAL WAIT ---------------- */
  const waitForFullLoad = async (p, label="TEST") => {
    console.log(`⏳ [${label}] Waiting for full load...`);

    await p.waitForLoadState('domcontentloaded').catch(()=>{});
    await p.waitForTimeout(GLOBAL_WAIT);

    await p.evaluate(async () => {
        const imgs = Array.from(document.images).filter(img => {
          const r = img.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
      
        await Promise.all(imgs.map(img => {
          if (img.complete) return Promise.resolve();
      
          return new Promise(res => {
            const timer = setTimeout(res, 3000); // ⬅️ timeout safety
      
            img.onload = () => {
              clearTimeout(timer);
              res();
            };
      
            img.onerror = () => {
              clearTimeout(timer);
              res();
            };
          });
        }));
      });

    console.log(`✅ [${label}] Fully loaded`);
  };

  await waitForFullLoad(page, "TEST");

  

  /* ---------------- SCROLL LOAD ---------------- */
  console.log("🔄 Scrolling for lazy load...");
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const step = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 120);
    });
    window.scrollTo(0, 0);
  });

  await page.waitForTimeout(1500);

  

  /* ---------------- BROKEN IMAGES (IMPROVED) ---------------- */
  console.log("🖼️ Checking broken images...");
  const brokenImages = await page.evaluate(() => {
    let count = 0;

    document.querySelectorAll('img').forEach(img => {
      const r = img.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0;

      // ignore lazy images not yet in viewport
      if (!visible) return;

      if (img.complete && img.naturalWidth === 0) {
        count++;
      }
    });

    return count;
  });

  console.log("📊 Broken images:", brokenImages);

  if (brokenImages > 20) critical.push(`Broken images: ${brokenImages}`);
  else if (brokenImages > 0) minor.push(`Broken images: ${brokenImages}`);

/* ---------------- COMPARE ---------------- */
let refScreenshot = null;
let testScreenshot = null;
let diffImage = null;
let summary = {};

if (isCompareMode) {

  console.log("🔁 Compare Mode ON");

 

  const refPage = await page.context().newPage();

  console.log("🌐 Loading reference...");
  await refPage.goto(referenceUrl, { waitUntil: 'domcontentloaded' });

  await waitForFullLoad(refPage, "REF");

  

   /* ---------- FORCE FULL LOAD ---------- */
   const fullScroll = async (p) => {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(800);
    await p.evaluate(() => window.scrollTo(0, 0));
  };

  await fullScroll(page);
  await fullScroll(refPage);



  // const refSections = await extractSections(refPage, "REF");
  // const testSections = await extractSections(page, "TEST");

  // console.log("⚖️ Matching sections...");

  //const seen = new Set();

 
 

  /* -------- OVERLAY (MOVE UP) -------- */
  console.log("🟥🟦 Drawing overlays...");

  

  const highlightChangedElements = async (p, boxes) => {
    await p.evaluate((boxes) => {
  
      for (const b of boxes) {
  
        const div = document.createElement('div');
  
        // ✅ FIXED (correct for screenshots)
        div.style.position = 'absolute';
div.style.left = (b.minX + window.scrollX) + 'px';
div.style.top = (b.minY + window.scrollY) + 'px';
  
        div.style.width = (b.maxX - b.minX) + 'px';
        div.style.height = (b.maxY - b.minY) + 'px';
  
        div.style.border = b.area > 20000
          ? '4px solid red'
          : '3px solid yellow';
  
        div.style.zIndex = 9999999;
        div.style.pointerEvents = 'none';
  
        document.body.appendChild(div);
      }
  
    }, boxes);
  };
  
// const highlightMismatch = async (p, index, color) => {
//   await p.evaluate(({ i, c }) => {
    
//     const els = Array.from(document.querySelectorAll(`
//     header, nav, section, footer, main,
//     img, button, a,
//     h1, h2, h3,
//     [data-testid],
//     [role]
//   `));


//     const el = els[i];
//     if (!el) return;

//     const r = el.getBoundingClientRect();

//     const div = document.createElement('div');
  
//     div.style.position = 'absolute'; // ✅ FIXED
    
//     div.style.left = (r.left + window.scrollX) + 'px';
//     div.style.top = (r.top + window.scrollY) + 'px';
//     div.style.width = r.width + 'px';
//     div.style.height = r.height + 'px';
//     div.style.border = `4px solid ${c}`;
//     div.style.zIndex = 2147483647;
//     div.style.pointerEvents = 'none';
    

//     document.body.appendChild(div);
//   }, { i: index, c: color });
// };




console.log("LOOP");

  /* -------- LOOP -------- */
//   for (let i = 0; i < refSections.length; i++) {

//     const r = refSections[i];

//     let match = testSections[i];

//     if (!match) {
//       match = testSections.find(t =>
//         t.type === r.type &&
//         Math.abs(t.height - r.height) < 150
//       );
//     }

  

//     const topDiff = Math.abs(match?.top - r.top || 0);
// const heightDiff = Math.abs(match?.height - r.height || 0);


// console.log("✅ dynamic tolerance");

// // ✅ dynamic tolerance (better for real UI)
// const TOP_TOLERANCE = 300;
// const HEIGHT_TOLERANCE = Math.max(150, r.height * 0.3);

// const isMatch =
//   match &&
//   match.type === r.type &&
//   topDiff < TOP_TOLERANCE &&
//   heightDiff < HEIGHT_TOLERANCE;
//   if (r.type === 'footer') continue;

//     if (!isMatch) {

//       const key = `${r.type}-${i}`;
//       if (seen.has(key)) continue; // ✅ FIXED
//       seen.add(key);

//       const label = `${r.type.toUpperCase()} mismatch`;
//       mismatchIndexes.push(i);

//       console.log("❌", label);

//       const isMajorMismatch =
//   r.type === 'hero' ||
//   r.type === 'navbar' ||
//   heightDiff > (r.height * 0.5) ||
//   topDiff > 250;

//       if (isMajorMismatch) {
//         critical.push(label);
//       } else {
//         minor.push(label);
//       }

//       missingSections.push(label);

//       // ✅ highlight works now
//       if (!isMatch) {
//         const color = isMajorMismatch ? 'red' : 'yellow';
//         await highlightMismatch(page, i, color);
//         await highlightMismatch(refPage, i, 'green');
//       }
//     }
//   }

  


  /* -------- TEXT DIFF -------- */
  console.log("📝 Checking text diff...");

  const extractText = async (p) => {
    return await p.evaluate(() => {
      const clean = t => t.replace(/\s+/g, ' ').trim().toLowerCase();

      return {
        headings: [...document.querySelectorAll('h1,h2,h3')]
          .map(el => clean(el.innerText))
          .filter(t => t.length > 15),

        paragraphs: [...document.querySelectorAll('p')]
          .map(el => clean(el.innerText))
          .filter(t => t.length > 30)
      };
    });
  };

  const refText = await extractText(refPage);
  const testText = await extractText(page);
// ✅ STEP 6: better similarity-based comparison

const similarity = (a, b) => {
  let same = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) same++;
  }

  return same / Math.max(a.length, b.length);
};

// ✅ headings comparison (strict)
const missingHeadings = refText.headings.filter(h =>
  !testText.headings.some(t => similarity(h, t) > 0.7)
);

// ✅ paragraph comparison (slightly relaxed)
const missingParagraphs = refText.paragraphs.filter(p =>
  !testText.paragraphs.some(t => similarity(p, t) > 0.6)
);

  if (missingHeadings.length || missingParagraphs.length) {
    console.log("⚠️ Content differences detected");
    contentDiff = { missingHeadings, missingParagraphs };
    critical.push(`Content differences detected`);
  }

  console.log("Mismatch indexes:", mismatchIndexes);

  await page.waitForTimeout(1500);
  // AFTER mismatch loop + content diff

summary = {
   //totalSections: refSections.length,
  mismatches: mismatchIndexes.length,
  // diffPixels,
  // diffRatio,
  // boxes: mergedBoxes.length,
  criticalCount: critical.length,
  minorCount: minor.length,
  contentIssues:
    (contentDiff.missingHeadings?.length || 0) +
    (contentDiff.missingParagraphs?.length || 0)
};
// await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, 0));
await refPage.evaluate(() => window.scrollTo(0, 0));

  /* -------- SCREENSHOT -------- */
  console.log("📸 Capturing screenshots...");
  // ✅ force full page render before screenshot
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1000);
await page.evaluate(() => window.scrollTo(0, 0));

await refPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await refPage.waitForTimeout(1000);
await refPage.evaluate(() => window.scrollTo(0, 0));

  refScreenshot = `ref_${Date.now()}.png`;
  testScreenshot = `test_${Date.now()}.png`;


  console.log("📸 Save + buffer (both)");


// ✅ get dimensions from test page
const { width: pageWidth, height: pageHeight } = await page.evaluate(() => ({
  width: document.documentElement.scrollWidth,
  height: document.documentElement.scrollHeight
}));

// ✅ get both page heights
const { height: testHeight } = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight
  }));

  const { height: refHeight } = await refPage.evaluate(() => ({
    height: document.documentElement.scrollHeight
  }));
  
  // ✅ take MAX height
  const finalHeight = Math.max(testHeight, refHeight);
  
  // ✅ keep original viewport width
  const currentViewport = page.viewportSize() || { width: 1280, height: 800 };
  
  // // ✅ apply SAME height to both
  await page.setViewportSize({
    width: currentViewport.width,
    height: finalHeight
  });
  
  await refPage.setViewportSize({
    width: currentViewport.width,
    height: finalHeight
  });


  
 

  
  

   // 3. wait so DOM updates
   await page.waitForTimeout(1000);
   await refPage.waitForTimeout(1000);



// ✅ take screenshots (same size now)
const refBuffer = await refPage.screenshot({
  path: `backstop_data/bitmaps_test/${refScreenshot}`,
  fullPage: false,
  scale: "css" // ✅ IMPORTANT
});

  
  const testBuffer = await page.screenshot({
    path: `backstop_data/bitmaps_test/${testScreenshot}`,
    fullPage: false,
    scale: "css" // ✅ IMPORTANT
  });
  

  diffImage = `diff_${Date.now()}.png`;

  console.log(" PIXEL DIFF");


/* -------- PIXEL DIFF -------- */

const PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch').default;
 

const img1 = PNG.sync.read(refBuffer);
const img2 = PNG.sync.read(testBuffer);


if (img1.width !== img2.width || img1.height !== img2.height) {
  console.log("⚠️ Resizing images to match");

  const minWidth = Math.min(img1.width, img2.width);
  const minHeight = Math.min(img1.height, img2.height);

  img1.data = img1.data.slice(0, minWidth * minHeight * 4);
  img2.data = img2.data.slice(0, minWidth * minHeight * 4);

  img1.width = img2.width = minWidth;
  img1.height = img2.height = minHeight; }


const { width, height } = img1;

const diff = new PNG({ width, height });
const diffPixels = pixelmatch(
  img1.data,
  img2.data,
  diff.data,
  width,
  height,
  { threshold: 0.1, // slightly tighter
  includeAA: false }  // 🔥 ignore anti-aliasing

);

console.log("🧪 Pixel diff count:", diffPixels);

const diffRatio = diffPixels / (width * height);

console.log("📊 Diff ratio:", diffRatio);

// classify severity
if (diffRatio > 0.15) {
  critical.push(`Major UI difference (${(diffRatio*100).toFixed(2)}%)`);
} else if (diffRatio > 0.05) {
  minor.push(`Minor UI difference (${(diffRatio*100).toFixed(2)}%)`);
}

/* -------- MULTI BOX DETECTION -------- */
const boxes = [];
const visited = new Uint8Array(width * height);

// ❗ ADD LIMIT (VERY IMPORTANT)
let skipBoxes = false;
for (let yy = minY; yy <= maxY; yy += SAMPLE_STEP) {
  for (let xx = minX; xx <= maxX; xx += SAMPLE_STEP) {
if (width * height > MAX_PIXELS) {
  console.log("⚠️ Large image → using fast mode");
  SAMPLE_STEP = 15; // 🔥 increase sampling instead of skipping
}
  }
}

const getIndex = (x, y) => (y * width + x);

if (!skipBoxes) {
  for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {

    const idx = getIndex(x, y);

    // diff pixel = red in pixelmatch output
    const i = idx * 4;
    const isDiff =
    diff.data[i] > 200 &&   // red
    diff.data[i+1] < 50 &&
    diff.data[i+2] < 50;

    if (!isDiff || visited[idx]) continue;

    // BFS to group pixels
    let queue = [[x, y]];
    let minX = x, maxX = x, minY = y, maxY = y;

    while (queue.length) {
      const [cx, cy] = queue.pop();
      const cidx = getIndex(cx, cy);

      

      if (visited[cidx]) continue;
      visited[cidx] = 1;

      const ci = cidx * 4;
      const cDiff = diff.data[ci] > 200 && diff.data[ci+1] < 50 && diff.data[ci+2] < 50;
      if (!cDiff) continue;

      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);

      // neighbors
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy]) => {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
          queue.push([nx, ny]);
        }
      });
    }

    // ignore tiny noise
    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    const area = boxWidth * boxHeight;
    //if (minY > height * 0.9) continue;

    // ✅ NEW: ignore huge boxes (fix big red blocks)
const MAX_BOX_AREA = width * height * 0.2; // 20% of page
if (area > MAX_BOX_AREA) continue;

// ✅ FAST approximation instead of full scan
const SAMPLE_STEP = 4; // 🔥 controls performance

let diffPixelCount = 0;
let sampled = 0;
if (area > width * height * 0.1) continue;
for (let yy = minY; yy <= maxY; yy += SAMPLE_STEP) {
  for (let xx = minX; xx <= maxX; xx += SAMPLE_STEP) {

    const idx2 = (yy * width + xx) * 4;
    sampled++;

    if (
      diff.data[idx2] > 200 &&
      diff.data[idx2 + 1] < 50 &&
      diff.data[idx2 + 2] < 50
    ) {
      diffPixelCount++;
    }
  }
 
}
  }

  const density = diffPixelCount / sampled;

    if (
      area > 300 &&
      boxWidth > 30 &&
      boxHeight > 30 &&
      density > 0.02
    ) {
      boxes.push({
        minX,
        minY,
        maxX,
        maxY,
        area
      });
    }

  }
}


await page.waitForTimeout(1000);
await refPage.waitForTimeout(1000);
const mergeBoxes = (boxes) => {
  const merged = [];

  boxes.forEach(box => {
    let found = false;

    for (let m of merged) {
      // ✅ tighter merge (only merge truly close boxes)
const MERGE_GAP = 3;

const isClose =
  box.minX < m.maxX + MERGE_GAP &&
  box.maxX > m.minX - MERGE_GAP &&
  box.minY < m.maxY + MERGE_GAP &&
  box.maxY > m.minY - MERGE_GAP;

      if (isClose) {
        m.minX = Math.min(m.minX, box.minX);
        m.minY = Math.min(m.minY, box.minY);
        m.maxX = Math.max(m.maxX, box.maxX);
        m.maxY = Math.max(m.maxY, box.maxY);
        found = true;
        break;
      }
    }

    if (!found) merged.push({ ...box });
  });

  return merged; // ✅ VERY IMPORTANT
};

console.log("📦 Boxes detected:", boxes.length);

const mergedBoxes = mergeBoxes(boxes);

console.log("📦 After merge:", mergedBoxes.length);


await page.waitForTimeout(1000);
await refPage.waitForTimeout(1000);
const expandedBoxes = mergedBoxes.map(b => ({
  minX: b.minX - 5,
  minY: b.minY - 5,
  maxX: b.maxX + 5,
  maxY: b.maxY + 5,
  area: b.area
}));

await refPage.evaluate(() => window.scrollTo(0, 0));
await page.evaluate(() => window.scrollTo(0, 0));
if (!expandedBoxes.length) {
  console.log("⚠️ No boxes → fallback highlight");

  const fallbackBox = [{
    minX: 0,
    minY: 0,
    maxX: width,
    maxY: Math.min(800, height),
    area: width * height
  }];

  await highlightChangedElements(page, fallbackBox);
  await highlightChangedElements(refPage, fallbackBox);
}

/* -------- DRAW BOXES -------- */
boxes.forEach(b => {
  for (let x = b.minX; x <= b.maxX; x++) {
    for (let t = 0; t < 3; t++) {
      let top = ((b.minY + t) * width + x) * 4;
      let bottom = ((b.maxY - t) * width + x) * 4;

      diff.data[top] = 255; diff.data[top+1] = 255; diff.data[top+2] = 0;
      diff.data[bottom] = 255; diff.data[bottom+1] = 255; diff.data[bottom+2] = 0;
    }
  }

  for (let y = b.minY; y <= b.maxY; y++) {
    for (let t = 0; t < 3; t++) {
      let left = (y * width + (b.minX + t)) * 4;
      let right = (y * width + (b.maxX - t)) * 4;

      diff.data[left] = 255; diff.data[left+1] = 255; diff.data[left+2] = 0;
      diff.data[right] = 255; diff.data[right+1] = 255; diff.data[right+2] = 0;
    }
  }
});


console.log("HighlightChangedElements");




const diffPath = `backstop_data/bitmaps_test/${diffImage}`;

fs.writeFileSync(diffPath, PNG.sync.write(diff));

  /* -------- CLEAN OVERLAY -------- */
  const removeOverlay = async (p) => {
    await p.evaluate(() => {
      document.querySelectorAll('div').forEach(el => {
        if (el.style && el.style.zIndex === '9999999') {
          el.remove();
        }
      });
    });
  };

  // await removeOverlay(page);
  // await removeOverlay(refPage);
  

 

  await refPage.close();
}





  /* ---------------- SAVE ---------------- */
  console.log("💾 Saving report...");

  let report = [];
  try { report = JSON.parse(fs.readFileSync(reportFile)); } catch {}
  const summarizeIssues = (arr) => {
    const map = {};
    arr.forEach(item => {
      map[item] = (map[item] || 0) + 1;
    });
  
    return Object.entries(map).map(([k, v]) => `${k} (${v})`);
  };
  
  const finalCritical = summarizeIssues(critical);
  const finalMinor = summarizeIssues(minor);

  report.push({
    page: scenario.label,
    url: scenario.url,
    referenceUrl,
    device: viewport.label,

    critical: finalCritical,   // ✅ FIXED
    minor: finalMinor,   
  missingSections,   // (optional but useful)
  contentDiff, 
  
    refScreenshot,
    testScreenshot,
    diffImage, // ✅ must exist now
  
    summary,
  
    timestamp: new Date().toISOString()
  });

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  console.log("✅ QA DONE:", scenario.label);
};