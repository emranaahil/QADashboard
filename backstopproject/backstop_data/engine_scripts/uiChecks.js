console.log("✅ UI CHECKS RUNNING");

const fs = require('fs');


const reportFile = 'qaReport.json';

// Clear old report
if (!global.__qaReportCleared) {
  fs.writeFileSync(reportFile, JSON.stringify([], null, 2));
  console.log('🧹 cleared old qa logs');
  global.__qaReportCleared = true;
}
 
  // Ensure file exists
if (!fs.existsSync(reportFile)) {
  fs.writeFileSync(reportFile, JSON.stringify([], null, 2));
}

let issueSummary = {
  broken: 0,
  overflow: 0,
  overlap: 0,
  alignment: 0
};


// ✅ GLOBAL CONFIG
const referenceUrl = process.env.REFERENCE_URL || null;
const testUrl = process.env.TEST_URL || null;
const isCompareMode = referenceUrl && testUrl;


// ✅ FUNCTIONS (TOP)
console.log('RUNNING autoScroll ✅'); 

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;

      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

console.log('RUNNING waitForImages ✅'); 

async function waitForImages(page) {
  try{
    await Promise.race([
       page.evaluate(async () => {
    const imgs = Array.from(document.images);

    await Promise.all(
      imgs.map(img => {
        if (img.complete) return;

        return new Promise(resolve => {
          const timer = setTimeout(resolve, 3000); // ✅ safety timeout
          img.onload = () => {
            clearTimeout(timer);
            resolve();
          };
         
        });
      })
    );
  }),
  page.waitForTimeout(5000) // ✅ hard stop
]);
}
catch (e) {
  console.log("⚠️ Image wait skipped");
}
}






console.log('PAGE LOAD ✅');

module.exports = async (page, scenario, viewport) => {

  console.log("\n==============================");
  console.log("🚀 QA START:", scenario.label, "|", viewport.label);
  console.log("==============================");


let issues=[];

await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
  });
});

/* ---------------- LOAD ---------------- */


  
  

// optional: wait for visible content
await page.waitForSelector('img, p, div', { timeout: 15000 }).catch((ex) => {});

// 3. Try network idle (optional, skip if fails)
try {
  await page.waitForLoadState("networkidle", { timeout: 40000 });
} catch {
  console.log("⚠️ networkidle skipped");
} 



// allow JS rendering
//await page.waitForTimeout(3000);

  // 4. Handle lazy loading (scroll full page)
  await autoScroll(page);
  console.log('autoScroll LOAD ✅');
   // 5. Wait for images to settle
   await waitForImages(page);
   console.log('waitForImages LOAD ✅');

   // 6. Extra buffer for JS-heavy sites
 await page.waitForTimeout(2000);
 console.log('waitForTimeout LOAD ✅');

  console.log('CHECKING PAGE EERORS ✅'); 
/* ---------------- ERRORS ---------------- */

if (!page.__qa_listeners_added) {
  page.on('pageerror', err => {
    issues.push(`JS Error: ${err.message}`);
  });

  page.on('requestfailed', req => {
    const url = req.url();
  
    if (
      url.includes('facebook') ||
      url.includes('instagram') ||
      url.includes('cptn') ||
      url.includes('analytics') ||
      url.includes('legitscript')
    ) return;
  
    issues.push(`Failed Request: ${url}`);
  });

  page.on('console', msg => {
    if (
      msg.type() === 'error' &&
      !msg.text().includes('CORS')
    ) {
      issues.push(`Console Error: ${msg.text()}`);
    }
  });

  page.__qa_listeners_added = true;
} 


console.log('RUNNING STABILIZE ✅'); 

/* ---------------- STABILIZE ---------------- */

await page.evaluate(()=>{

document.querySelectorAll(
'.ads,.popup,.modal,.cookie-banner'
).forEach(el=>el.remove());

const style=document.createElement('style');

/* ✅ ADD THIS BLOCK HERE */
document.body.style.minHeight = "auto";
document.body.style.height = "auto";
document.documentElement.style.height = "auto";

style.innerHTML=`
*,*:before,*:after{
 animation:none !important;
 transition:none !important;
}
`

document.head.appendChild(style);



});
await page.evaluate(() => {
  window.scrollTo(0, 0); // force top
});
await page.waitForTimeout(5000);

console.log('SCROLLING PAGES ✅ '); 

/* ✅ SCROLL FULL PAGE BEFORE CHECKS */
await page.evaluate(async () => {
  await new Promise(resolve => {
    let totalHeight = 0;
    const distance = 500;

    const timer = setInterval(() => {
      window.scrollBy(0, distance);
      totalHeight += distance;

      if (totalHeight >= document.body.scrollHeight) {
        clearInterval(timer);
        resolve();
      }
    }, 200);
  });
});
//await page.waitForLoadState?.('networkidle').catch(()=>{}); //user when ss is getting fail to capture 
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1000);


console.log('RUNNING POPUP DETECTION ✅'); 

// -------- POPUP DETECTION --------
const popupDetected = await page.evaluate(() => {
  console.log("POPUP DETECTION RUNNING✅ ");
  const popupSelectors = [
    '.modal',
    '.popup',
    '[role="dialog"]',
    '.cookie-banner',
    '.overlay'
  ];
  console.log("Checking VisiblePopups ✅ ");
  const visiblePopups = [];

  popupSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      
      if (
        r.width > 50 &&
        r.height > 50 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      ) {
        visiblePopups.push(`${sel} (${el.className || 'no-class'})`);
      }
    });
  });

  return visiblePopups;
});

if (popupDetected.length > 0) {
  const popupFile = `popup_${Date.now()}.png`;

await page.screenshot({
  path: `backstop_data/bitmaps_test/${popupFile}`,
  fullPage: true
});

issues.push(`Popup detected: ${popupFile}`);
}

console.log("✅ closing VisiblePopups");

await page.evaluate(() => {

  const closeSelectors = [
    '.close',
    '.close-btn',
    '.modal-close',
    '[aria-label="close"]',
    '[aria-label="Close"]'
  ];

  // click standard close buttons
  closeSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(btn => btn.click());
  });

  // ✅ handle "×" buttons manually (SAFE way)
  document.querySelectorAll('button').forEach(btn => {
    if (btn.innerText.trim() === '×') {
      btn.click();
    }
  });

  // fallback: force remove stubborn popups
  document.querySelectorAll('.modal,.popup,[role="dialog"],.overlay').forEach(el => {
    el.remove();
  });

});


await page.waitForTimeout(2000);

await page.screenshot({
  path: `backstop_data/bitmaps_test/clean_${Date.now()}.png`,
  fullPage: true
});



/* ---------------- BROKEN IMAGES ---------------- */

const brokenImages = await page.evaluate(async () => {
  
console.log("BROKEN IMAGES RUNNING ✅");

  let count = 0;

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      r.width > 20 &&
      r.height > 20 &&
      r.bottom > 0 &&
      r.top < window.innerHeight &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'&&
      style.opacity !== '0' 
    );
    
  };

  

  const imgs = Array.from(document.querySelectorAll('img'));

  await Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();

    return new Promise(res => {
      const timer = setTimeout(res, 3000); // ⏱️ timeout safety
      img.onload = img.onerror = () => {
        clearTimeout(timer);
        res();
      };
    });
  }));

  imgs.forEach(img => {
    const r = img.getBoundingClientRect();

  

    const isBroken =
      !img.src ||
      img.naturalWidth === 0 ||
      img.src.includes('placeholder');

      if (isBroken) {
        console.log("BROKEN:", img.src, "VISIBLE:", isVisible(img));
      }
      
      if (isBroken && isVisible(img)) {
        count++;
      }
  });

  return count;
});

if (brokenImages > 0) {
  issues.push(`Broken images: ${brokenImages}`);
}




/* ---------------- OVERFLOW ---------------- */

const overflow=
await page.evaluate(()=>{

let count=0;

document.body.querySelectorAll('*')
.forEach(el=>{

 const r=
 el.getBoundingClientRect();
 const style = getComputedStyle(el)


 if (
  r.right > window.innerWidth + 20 &&
  r.width > 120 &&
  r.height > 40 &&
  style.position !== 'fixed' &&
  style.overflow !== 'hidden'
){
   count++;
   el.style.outline=
   '3px solid orange';
 }

});

return count;


});



if(overflow>0){
issues.push(
`Overflow elements: ${overflow}`
);
}



console.log("✅ OVERLAPS RUNNING");
/* ---------------- OVERLAPS ---------------- */

const overlaps=
await page.evaluate(()=>{

let count=0;

document.querySelectorAll(
'button,a,img,input,[class*=card]'
).forEach(el=>{

 const r=
 el.getBoundingClientRect();

 if(
 r.width<10 ||
 r.height<10
 ) return;

 const topEl=
 document.elementFromPoint(
  r.left + r.width / 2,
  r.top + r.height / 2
 );
 const style = getComputedStyle(el);

 if (
  topEl &&
  topEl !== el &&
  !el.contains(topEl) &&
  style.position !== 'fixed' &&
  r.width > 40 &&
  r.height > 40
){
   count++;
   el.style.outline=
   '3px solid purple';
 }

});

return count;

});

if(overlaps>0){
issues.push(
`Possible overlaps: ${overlaps}`
);
}

console.log("✅ OFFSCREEN DETECTION"); 
/* ---------------- OFFSCREEN DETECTION ---------------- */

const offscreen=
await page.evaluate(()=>{

let count=0;

// ✅ DEFINE HERE (inside evaluate)
const isVisible = (el) => {
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return (
    r.width > 20 &&
    r.height > 20 &&
    r.bottom > 0 &&
    r.top < window.innerHeight &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
};

document.querySelectorAll('section,div,img,button,[class*=card]')
  .forEach(el => {

    const r = el.getBoundingClientRect();


    if (!isVisible(el)) return;

    if (
      (r.left < -50 || r.right > window.innerWidth + 50) &&
      r.width > 100 &&
      r.height > 50
    ) {
      count++;
    }

});

return count;


});

if(offscreen>0){
issues.push(
`Offscreen elements: ${offscreen}`
);
}

console.log("✅  TEXT CLIPPING "); 
/* ---------------- TEXT CLIPPING ---------------- */
const clippedText = await page.evaluate(() => {

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      r.width > 50 &&
      r.height > 20 &&
      r.bottom > 0 &&
      r.top < window.innerHeight &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  };

  let bad = 0;

  document.querySelectorAll('p,h1,h2,h3,span,button,a').forEach(el => {

    const r = el.getBoundingClientRect();

    // ✅ ADD FILTER HERE
  if (!isVisible(el)) return;
  if (r.width < 80 || r.height < 20) return;

    const style = getComputedStyle(el);

    if (
      el.scrollWidth > el.clientWidth + 10 &&
      !['auto', 'scroll'].includes(style.overflowX)
    ) {
      bad++;
      el.style.outline = '3px solid red';
    }

  });

  return bad;
});

if(clippedText>0){
issues.push(
`Clipped text: ${clippedText}`
);
}

console.log("✅ SPACING CONSISTENCY "); 
/* ---------------- SPACING CONSISTENCY ---------------- */

const spacingIssues=
await page.evaluate(()=>{

let bad=0;

document.querySelectorAll(
'section,[class*=card]'
).forEach(parent=>{

const kids=
[...parent.children];

if(kids.length<3) return;

let gaps=[];

for(
let i=1;
i<kids.length;
i++
){

const a=
kids[i-1]
.getBoundingClientRect();

const b=
kids[i]
.getBoundingClientRect();

gaps.push(
Math.abs(
b.top-a.bottom
)
);

}

if(gaps.length){

const avg=
gaps.reduce(
(a,b)=>a+b,0
)/gaps.length;

gaps.forEach(g=>{

if(
Math.abs(
g-avg
)>avg*1.2
){
bad++;
}

});

}

});
return bad;

});

if(spacingIssues>0){
issues.push(
`Spacing inconsistencies: ${spacingIssues}`
);
}


///Component-Level Detection (SAFE)
const componentIssues = await page.evaluate(() => {

  const result = {
    navbar: 0,
    hero: 0,
    card: 0
  };

  const check = (selector, key) => {
    document.querySelectorAll(selector).forEach(el => {

      const r = el.getBoundingClientRect();

      if (r.width < 50 || r.height < 20) return;

      if (r.right > window.innerWidth || r.left < 0) {
        result[key]++;
      }

    });
  };

  

  check('nav,header', 'navbar');
  check('[class*=hero]', 'hero');
  check('[class*=card]', 'card');

  return result;


});


  //Push into issues:
  if (componentIssues.navbar > 0)
    issues.push(`Navbar issues: ${componentIssues.navbar}`);
  
  if (componentIssues.hero > 0)
    issues.push(`Hero issues: ${componentIssues.hero}`);
  
  if (componentIssues.card > 0)
    issues.push(`Card issues: ${componentIssues.card}`);

  console.log("✅ IMAGE DISTORTION RUNNING");

  

/* ---------------- IMAGE DISTORTION ---------------- */

const distorted=
await page.evaluate(()=>{

let bad=0;

document.querySelectorAll('img')
.forEach(img=>{

if(
img.naturalWidth &&
img.naturalHeight
){

const natural=
img.naturalWidth/
img.naturalHeight;

const rendered=
img.clientWidth/
img.clientHeight;

if(
Math.abs(
natural-rendered
)>0.4
){
bad++;
}

}

});

return bad;


});

if(distorted>0){
issues.push(
`Distorted images: ${distorted}`
);
}

console.log("✅ BUTTONS Checking RUNNING");

/* ---------------- BUTTONS ---------------- */


const buttonIssues=
await page.evaluate(()=>{

let bad=0;

const vw=
window.innerWidth;

document.querySelectorAll(
'button'
).forEach(btn=>{

const r=
btn.getBoundingClientRect();

if (
  r.width < 20 ||
  r.height < 20 ||
  r.bottom < 100 ||
  r.top > window.innerHeight + 100
) return;


const isMobile = window.innerWidth < 768;
const isSmall =
(
  (isMobile && (r.width < 40 || r.height < 40)) ||
  (!isMobile && (r.width < 60 || r.height < 30))
) 
if (isSmall) {
  bad++;
 // addBox(r, 'green');
}

});

return bad;


});


if(buttonIssues>0){
issues.push(
`Small buttons: ${buttonIssues}`
);
}

// wait for overlays to render
await page.waitForTimeout(800);

/* ---------------- Z-INDEX / LAYERING ---------------- */
const zIndexIssues = await page.evaluate(() => {
  console.log("Z-INDEX / LAYERING Checking RUNNING ✅ ");
  
  let bad = 0;

   // ✅ DEFINE HERE
   const addBox = (rect, color) => {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.left = rect.left + 'px';
    div.style.top = rect.top + 'px';
    div.style.width = rect.width + 'px';
    div.style.height = rect.height + 'px';
    div.style.border = `2px solid ${color}`;
    div.style.pointerEvents = 'none';
    div.style.zIndex = 9999999;
    document.body.appendChild(div);
  };
  

  document.querySelectorAll('button,a,input').forEach(el => {
    const r = el.getBoundingClientRect();
    if (
      r.width < 20 ||
      r.height < 20 ||
      r.bottom < 100 ||
      r.top > window.innerHeight + 100
    ) return;

    const topEl = document.elementFromPoint(
      r.left + r.width/2,
      r.top + r.height/2
    );

    const style = getComputedStyle(el);

    if (
      topEl &&
      topEl !== el &&
      !el.contains(topEl) &&
      style.position !== 'fixed' &&
      r.width > 40 &&
      r.height > 40
    ) {
      bad++;
      addBox(r, 'orange');
      
    }
  });

  return bad;
});

if (zIndexIssues > 0) {
  issues.push(`Layering issues: ${zIndexIssues}`);
}



/* ---------------- SMART LINK DETECTOR ---------------- */
const result  = await page.evaluate(async () => {
  console.log("✅ SMART LINK DETECTOR RUNNING");

  const links = [...document.querySelectorAll('a')].slice(0, 20);

  const map = {};        // count per URL
  const brokenMap = {};  // broken URLs
  const badLinks = [];   // missing href

  // helper: visible check
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      r.width > 20 &&
      r.height > 20 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'&&
      style.opacity !== '0'&&
      style.opacity !== '0'

    );
  };
 

  await Promise.all(
    links.map(async (a) => {

      const href = a.getAttribute('href');

      // ❌ BAD LINK (no href)
      if (!href || href.trim() === "" || href === "#" ) {
        if (isVisible(a)) {
          badLinks.push(a.innerText.trim() || "(no text)");
          a.style.outline = '3px solid orange';
        }
        return;
      }

      const url = a.href.trim();

      // ✅ COUNT DUPLICATES
      map[url] = (map[url] || 0) + 1;

      // ❌ CHECK BROKEN (HEAD request)
      let isBroken = false;
      try {
        const headRes = await fetch(url, { method: 'HEAD' });
        if (!headRes || !headRes.ok) {
          throw new Error('HEAD failed');
        }
      } catch {
        try {
          const getRes = await fetch(url, { method: 'GET' });
          if (!getRes || !getRes.ok) {
            isBroken = true;
          }
        } catch {
          isBroken = true;
        }
      }
      
      if (isBroken) {
        brokenMap[url] = (brokenMap[url] || 0) + 1;
      
        if (isVisible(a)) {
          a.style.outline = '3px solid orange';
        }
      }

    })
  );

  // ✅ FORMAT OUTPUT

  return {
    duplicates: Object.entries(map)
      .filter(([_, c]) => c > 1)
      .map(([url, c]) => `${url} (${c} times)`),
  
    broken: Object.entries(brokenMap)
      .map(([url, c]) => `${url} (${c})`),
  
    bad: Object.entries(
      badLinks.reduce((acc, txt) => {
        acc[txt] = (acc[txt] || 0) + 1;
        return acc;
      }, {})
    ).map(([txt, c]) => `${txt} (${c})`)
  };
});

if (result.duplicates.length > 0) {
  issues.push(
    `Duplicate links:<br>• ${result.duplicates.join('<br>• ')}`
  );
}

if (result.broken.length > 0) {
  issues.push(
    `Broken links:<br>• ${result.broken.join('<br>• ')}`
  );
}

if (result.bad.length > 0) {
  issues.push(
    `Bad links:<br>• ${result.bad.join('<br>• ')}`
  );
}



console.log("✅ CTA ABOVE THE FOLD RUNNING");

/* ---------------- CTA ABOVE THE FOLD ---------------- */



const ctaIssues = await page.evaluate(() => {
  let missing = 0;

  const fold = window.innerHeight;

  const ctas = [...document.querySelectorAll('button,a')].filter(el => {
    const text = el.innerText.toLowerCase();
    return (
      text.includes('buy') ||
      text.includes('start') ||
      text.includes('signup') ||
      text.includes('login') ||
      text.includes('try')
    );
  });

  if (ctas.length === 0) return 0;

  const visible = ctas.some(el => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < fold;
  });

  if (!visible) missing++;

  return missing;
});

if (ctaIssues > 0) {
  issues.push(`CTA not visible above fold`);
}

console.log("✅ CONTENT COMPARISON RUNNING");

/* ---------------- CONTENT COMPARISON ---------------- */

let refData = null;

if (isCompareMode) {
  const refPage = await page.context().newPage();

  await refPage.goto(referenceUrl, { waitUntil: 'domcontentloaded' });

  refData = await refPage.evaluate(() =>{
      const clean = t => t.replace(/\s+/g, ' ').trim();
  
      const getText = sel =>
        [...document.querySelectorAll(sel)]
          .map(el => clean(el.innerText))
          .filter(t => t.length > 20);
  
      return {
        headings: getText('h1,h2,h3'),
        paragraphs: getText('p')
      };
    });
  
    await refPage.close();
  

  // 🔹 Get current page data
  const currentData = await page.evaluate(() => {

    const cleanText = (txt) =>
      txt.replace(/\s+/g, ' ').trim();

    const getText = (selector) =>
      [...document.querySelectorAll(selector)]
        .map(el => cleanText(el.innerText))
        .filter(t => t.length > 20);

    // remove dynamic junk
    document.querySelectorAll(
      '.ads,.ad,.banner,.popup,.modal,.cookie,.overlay,[id*=ad]'
    ).forEach(el => el.remove());

    return {
      headings: getText('h1,h2,h3'),
      paragraphs: getText('p')
    };

  });

  // 🔹 Compare with reference
  const contentDiff = {
    missingHeadings: refData.headings.filter(h => !currentData.headings.includes(h)),
    extraHeadings: currentData.headings.filter(h => !refData.headings.includes(h)),
    missingParagraphs: refData.paragraphs.filter(p => !currentData.paragraphs.includes(p))
    
  };
  

  // 🔹 Push only meaningful visible issues
  if (contentDiff.missingHeadings.length)
    issues.push(`Missing headings: ${contentDiff.missingHeadings.length}`);

  if (contentDiff.missingParagraphs.length)
    issues.push(`Missing paragraphs: ${contentDiff.missingParagraphs.length}`);
}

console.log("✅ TOUCH TARGET SPACING RUNNING");

/* ---------------- TOUCH TARGET SPACING ---------------- */

const touchIssues = await page.evaluate(() => {

  
  let bad = 0;

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      r.width > 20 &&
      r.height > 20 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
      &&
    style.opacity !== '0'
    );
  };
 

  const buttons = [...document.querySelectorAll('button,a')];

  for (let i = 1; i < buttons.length; i++) {

    const a = buttons[i-1].getBoundingClientRect();
    const b = buttons[i].getBoundingClientRect();
  
    if (
      isVisible(buttons[i-1]) &&
      isVisible(buttons[i]) &&
      Math.abs(b.top - a.bottom) < 8
    ) {
      bad++;
      buttons[i].style.outline = '3px solid green';
    }
  }
  
  return bad;   // ✅ REQUIRED
  
  }); // ✅ CLOSE evaluate

/* ---------------- CLS ---------------- */
console.log("✅ CLS RUNNING");
const shifts=
await page.evaluate(()=>{

try{
return performance
.getEntriesByType(
'layout-shift'
).length;
}
catch(e){
return 0;
}


});

if(shifts>0){
issues.push(
`Layout shifts: ${shifts}`
);
}


/* ---------------- FAQ ---------------- */
console.log("✅ FAQ RUNNING");
const faq=
await page.$$eval(
'.faq,.accordion',
els=>els.length
);

if(faq>0){
issues.push(
`FAQ sections found: ${faq}`
);
}


/* ---------------- MODALS ---------------- */
console.log("✅ MODALS RUNNING");
const closeButtons=
await page.$$eval(
'.close,.modal-close,[aria-label="Close"]',
els=>els.length
);

if(closeButtons>0){
issues.push(
`Modal close buttons found: ${closeButtons}`
);
}


/* ---------------- BLANK PAGE ---------------- */
console.log("✅ BLANK PAGE RUNNING");
const bodyText=
await page.evaluate(
()=>document.body.innerText
);

if(
!bodyText ||
bodyText.trim().length===0
){

issues.push(
'Page load error / blank page'
);

}

/* ---------------- VISUAL HIGHLIGHT OVERLAY ---------------- */

await page.evaluate(() => {
  console.log("VISUAL HIGHLIGHT OVERLAY ✅");

  const addBox = (rect, color) => {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.left = rect.left + 'px';
    div.style.top = rect.top + 'px';
    div.style.width = rect.width + 'px';
    div.style.height = rect.height + 'px';
    div.style.border = `2px solid ${color}`;
    div.style.pointerEvents = 'none';
    div.style.zIndex = 999999;
    document.body.appendChild(div);
  };

 // BROKEN IMAGES
 
  console.log("BROKEN IMAGES Count ✅");

  let count = 0;

  document.querySelectorAll('img').forEach(img => {

    const isBroken =
      !img.src ||
      img.naturalWidth === 0 ||
      img.src.includes('placeholder');

      if (isBroken) {
        count++;
        addBox(img.getBoundingClientRect(), 'red'); // 👈 THIS WAS MISSING
      }
    
});

 // OVERFLOW
 console.log("OVERFLOW ✅");
 document.querySelectorAll('section,div,img,button,[class*=card],[class*=container]').forEach(el => {
 
   const r = el.getBoundingClientRect();
   if (
     r.right > window.innerWidth + 10 &&
     getComputedStyle(el).position !== 'fixed'
   ) {
    addBox(r, 'orange', 0.35);
   }
 });

 
  console.log("VISIBILITY FILTER ✅");
 // OVERLAP
 document.querySelectorAll('button,a,img,.card,input').forEach(el => {
   const r = el.getBoundingClientRect();
   

   
  
  if (
    r.width < 20 ||
    r.height < 20 ||
    r.bottom < 100 ||
    r.top > window.innerHeight + 100
  ) return;

   if (r.width < 10 || r.height < 10) return;

   const topEl = document.elementFromPoint(
    r.left + r.width / 2,
    r.top + r.height / 2
   );

   if (topEl && topEl !== el && !el.contains(topEl)) {
    addBox(r, 'purple', 0.35);
   }
 });

 console.log("MISALIGNED CENTER ✅");
 // MISALIGNED CENTER (simple heuristic)
 const centerX = window.innerWidth / 2;

 document.querySelectorAll('section,div,img').forEach(el => {
   const r = el.getBoundingClientRect();
   const style = getComputedStyle(el);

   if (
    r.width < 50 ||
    r.height < 50 ||
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) return;

   const elCenter = r.left + r.width / 2;

   const diff = Math.abs(elCenter - centerX);

   // ✅ ignore perfectly centered
   if (diff <= 10) return;
   
   // ✅ ignore intentional layouts (left/right aligned)
   if (diff > 120) return;
   
   // ✅ only flag "almost centered but wrong"
   if (diff > 20 && diff <= 100 && r.width > 300) {
     addBox(r, 'blue', 0.35);
   }
 });

 /* ---------- LEGEND PANEL ---------- */

 const panel = document.createElement('div');
 console.log("LEGEND PANEL ✅");
panel.style.cssText = `
 position:fixed;
 bottom:20px;
 right:20px;
 background:;
 color:;
 padding:12px;
 font-size:13px;
 z-index:999999;
 border-radius:6px;
 font-family:Arial;
 `;

 //panel.innerHTML = `
//  <b>UI Highlight Guide</b><br>
//  🔴 Broken<br>
//  🟠 Overflow<br>
//  🟣 Overlap<br>
//  🔵 Alignment
//  `;

 document.body.appendChild(panel);
 const isVisible = (el) => {
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return (
    r.width > 20 &&
    r.height > 20 &&
    r.bottom > 0 &&
    r.top < window.innerHeight &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  );
};


});

await page.waitForTimeout(2000);


/* ---------------- REPORT ---------------- */

if(issues.length>0){

  let report = [];

  try {
    report = JSON.parse(fs.readFileSync(reportFile));
  } catch(e) {
    report = [];
  }



const viewportLabel =
  scenario?.viewportLabel ||
  (viewport && viewport.label) ||
  'unknown';


report.push({
  page: (scenario?.label || 'unknown').trim(),
  url: scenario?.url,
  device: viewportLabel,   // ✅ ONLY viewport label
  issues: [...new Set(issues)],
  timestamp: new Date().toISOString()

  
});



fs.writeFileSync(
  reportFile,
JSON.stringify(
report,
null,
2
)
);

}

};