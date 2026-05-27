const fs = require('fs');
console.log("📄 Reading qaReport.json...");

const report = JSON.parse(fs.readFileSync('qaReport.json'));

let html = `
<html>
<head>
<style>
body{font-family:Arial;padding:20px}
h2{margin-top:30px}
ul{margin-left:20px}

.compare{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:15px;
}

.compare div{
  display:flex;
  flex-direction:column;
}

.mismatch{
  margin-top:20px;
  border:1px solid #ddd;
  padding:10px;
  page-break-inside:avoid;
}

img{
  width:100%;
  height:auto;
  object-fit:contain;
  border:1px solid #ccc;
  margin-top:5px;
}

.controls{
  margin-bottom:20px;
  display:flex;
  gap:10px;
}

/* PRINT FIX */
@media print{
  .controls{display:none}
  .page{page-break-after:always}
  img{max-height:90vh}
}
</style>
</head>
<body>

<h1>QA UI Report</h1>

<div class="controls">
<select id="deviceSelect"></select>
<select id="pageSelect"></select>
<button onclick="window.print()">Print PDF</button>
</div>
`;

console.log("📊 Building report HTML...");

report.forEach((r, i) => {

    html += `<div class="page" id="page_${i}" 
    data-page="${r.page}" 
    data-device="${r.device}" 
    data-critical="${r.critical?.length || 0}" 
    data-minor="${r.minor?.length || 0}">
    `;

html += `<h2>${r.page} (${r.device})</h2>`;
html += `<p><b>Test URL:</b> ${r.url}</p>`;
html += `<p><b>Reference URL:</b> ${r.referenceUrl || '-'}</p>`;


/* CRITICAL */
const criticalList = Array.isArray(r.critical) ? r.critical : [];

html += `<h3>🔴 Critical</h3><ul>`;
html += criticalList.length
  ? criticalList.map(i => `<li>${i}</li>`).join('')
  : `<li>None</li>`;
html += `</ul>`;

/* minor */
console.log(`🟡 Rendering minor for ${r.page}`);
const minorList = Array.isArray(r.minor) ? r.minor : [];

html += `<h3>🟡 Minor</h3><ul>`;
html += minorList.length
  ? minorList.map(i => `<li>${i}</li>`).join('')
  : `<li>None</li>`;
html += `</ul>`;




/* CONTENT */
if (r.contentDiff?.missingHeadings?.length || r.contentDiff?.missingParagraphs?.length) {
  console.log(`🔵 Content diff found for ${r.page}`);
  html += `<h3>🔵 Content Differences</h3><ul>`;

  r.contentDiff.missingHeadings?.slice(0,5).forEach(h=>{
    html += `<li>${h}</li>`;
  });

  r.contentDiff.missingParagraphs?.slice(0,3).forEach(p=>{
    html += `<li>${p}</li>`;
  });

  html += `</ul>`;
}
/* FULL PAGE */
if (r.refScreenshot && r.testScreenshot) {
  console.log(`📸 Adding full screenshots for ${r.page}`);
  html += `
  <h3>📸 Full Page Compare</h3>
  <div class="compare">
    <div>
    <b>Refence URL:</b>
      <b>${r.referenceUrl}</b>
      <img src="backstop_data/bitmaps_test/${r.refScreenshot}">
    </div>
    <div>
    <b>Test URL:</b>
      <b>${r.url}</b>
      <img src="backstop_data/bitmaps_test/${r.testScreenshot}">
    </div>
  </div>

  ${r.diffImage ? `
  <h3>🧪 Visual Diff</h3>
  <div style="max-width:900px">
    <img src="backstop_data/bitmaps_test/${r.diffImage}">
  </div>
  ` : ''}
  `;
}

/* SUMMARY */
html += `
<h3>📊 Summary</h3>
<ul>
  <li>Total Sections: ${r.summary?.totalSections || 0}</li>
  <li>Mismatches: ${r.summary?.mismatches || 0}</li>
  <li>Critical Issues: ${r.summary?.criticalCount || 0}</li>
  <li>Minor Issues: ${r.summary?.minorCount || 0}</li>
  <li>Content Issues: ${r.summary?.contentIssues || 0}</li>
</ul>
`;

html += `</div>`;
});


/* SCRIPT */
html += `
<script>
console.log("⚙️ Initializing filters...");





const pages = document.querySelectorAll('.page');
const pageSelect = document.getElementById('pageSelect');

/* CREATE DROPDOWNS */
const deviceSelect = document.createElement('select');
deviceSelect.id = "deviceSelect";

const severitySelect = document.createElement('select');
severitySelect.id = "severitySelect";

document.querySelector('.controls').prepend(severitySelect);
document.querySelector('.controls').prepend(deviceSelect);

/* UNIQUE VALUES */
const devices = [...new Set([...pages].map(p => p.dataset.device))];
const pageNames = [...new Set([...pages].map(p => p.dataset.page))];

/* DEFAULT OPTIONS */
deviceSelect.innerHTML = '<option value="">All Devices</option>';
pageSelect.innerHTML = '<option value="">All Pages</option>';
["All Severity", "Critical", "Minor"].forEach((label, i) => {
    const opt = document.createElement('option');
    opt.value = i === 0 ? "" : label.toLowerCase();
    opt.text = label;
    severitySelect.appendChild(opt);
  });

/* DEVICE */
devices.forEach(d=>{
  const opt = document.createElement('option');
  opt.value = d;
  opt.text = d;
  deviceSelect.appendChild(opt);
});

/* PAGE */
pageNames.forEach(p=>{
  const opt = document.createElement('option');
  opt.value = p;
  opt.text = p;
  pageSelect.appendChild(opt);
});

/* FILTER */
const applyFilter = ()=>{
  const d = deviceSelect.value;
  const p = pageSelect.value;
  const s = severitySelect.value;

  pages.forEach(el=>{
    const hasCritical = parseInt(el.dataset.critical) > 0;
    const hasMinor = parseInt(el.dataset.minor) > 0;

    const severityMatch =
      !s ||
      (s === 'critical' && hasCritical) ||
      (s === 'minor' && hasMinor);

    const match =
      (!d || el.dataset.device === d) &&
      (!p || el.dataset.page === p) &&
      severityMatch;

    el.style.display = match ? 'block' : 'none';
  });
};

/* EVENTS */
deviceSelect.onchange = applyFilter;
pageSelect.onchange = applyFilter;
severitySelect.onchange = applyFilter;

console.log("✅ Filters ready");

applyFilter();
</script>
`;


html += `</body></html>`;

fs.writeFileSync('qaReport.html', html);

console.log("✅ Report Generated");

/* AUTO OPEN */
const { exec } = require('child_process');
exec(`start qaReport.html`);