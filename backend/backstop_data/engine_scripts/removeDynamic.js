const fs = require('fs');

const file = 'qaReport.json';

// Reset file ONLY once
if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify([], null, 2)); // changed to array for multiple entries
}

module.exports = async (page, scenario) => {

    let issues = []; // ✅ collect issues for this page

    await page.evaluate(() => {
        document.querySelectorAll('.ads, .popup, .modal').forEach(el => el.remove());
    });

    // 🔴 Highlight broken images
    const brokenImages = await page.evaluate(() => {
        let count = 0;
        document.querySelectorAll('img').forEach(img => {
            if (!img.complete || img.naturalWidth === 0) {
                img.style.border = '3px solid red';
                count++;
            }
        });
        return count;
    });
    if (brokenImages > 0) issues.push(`Broken images: ${brokenImages}`); // ✅ log

    // 🟡 Highlight overflow elements
    const overflowCount = await page.evaluate(() => {
        let count = 0;
        document.querySelectorAll('*').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
                el.style.outline = '3px solid orange';
                count++;
            }
        });
        return count;
    });
    if (overflowCount > 0) issues.push(`Overflow elements: ${overflowCount}`);

    // 🔵 Highlight empty elements
    /* const emptyCount = await page.evaluate(() => {
        let count = 0;
        document.querySelectorAll('p, span, div').forEach(el => {
            if (el.innerText.trim() === '') {
                el.style.outline = '2px dashed blue';
                count++;
            }
        });
        return count;
    });
    if (emptyCount > 0) issues.push(`Empty elements: ${emptyCount}`);

    await page.addStyleTag({
        content: `
        * {
          animation: none !important;
          transition: none !important;
        }
      `
    }); */

    //await page.waitForLoadState('networkidle');
    await page.waitForSelector('body', { timeout: 30000 });
    await page.waitForTimeout(60000);

    let hasError = false;

    // 1. Listen for runtime errors
    page.on('pageerror', () => {
        hasError = true;
    });

    // 2. Listen for failed requests (CSS/JS not loading)
    page.on('requestfailed', () => {
        hasError = true;
    });

    // 3. Check blank page
    const bodyText = await page.evaluate(() => document.body.innerText);

    if (!bodyText || bodyText.trim().length === 0 || hasError) {
        console.log("⚠️ Page has issue but screenshot will continue");
        issues.push("Page load error / blank page"); // ✅ log
    }

    // 🚨 Add visual marker in screenshot
    await page.evaluate(() => {
        const div = document.createElement('div');
        div.innerText = '⚠️ PAGE LOAD ERROR';
        div.style.position = 'fixed';
        div.style.top = '10px';
        div.style.left = '10px';
        div.style.background = 'red';
        div.style.color = 'white';
        div.style.padding = '10px';
        div.style.zIndex = '9999';
        document.body.appendChild(div);
    });

    // ✅ WRITE QA REPORT (NEW LOGIC)
    if (issues.length > 0) {
        const report = JSON.parse(fs.readFileSync(file));
    
        // ✅ ADD THIS
        const viewport = await page.evaluate(() => {
            return `${window.innerWidth}x${window.innerHeight}`;
        });
    
        report.push({
            page: scenario?.label || "unknown",
            url: scenario?.url,
            device: viewport, // now works ✅
            issues: issues,
            timestamp: new Date().toISOString()
        });
    
        fs.writeFileSync(file, JSON.stringify(report, null, 2));
    }

    const viewport = await page.evaluate(() => {
        return `${window.innerWidth}x${window.innerHeight}`;
      });

     // 🔕 Disable console warnings (like Swiper warning)
  await page.evaluate(() => {
    console.warn = () => {};
  });
};