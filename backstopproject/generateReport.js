

const fs = require('fs');

const path = require('path');

const REPORT_FILE = 'qaReport.json';
const SCREENSHOT_DIR = './backstop_data/bitmaps_test';

let qaData = [];

if (fs.existsSync(REPORT_FILE)) {
  qaData = JSON.parse(fs.readFileSync(REPORT_FILE));
}

const folders = fs.readdirSync(SCREENSHOT_DIR)
  .filter(item =>
    fs.statSync(
      path.join(SCREENSHOT_DIR, item)
    ).isDirectory()
  );
console.log("ALL ITEMS:",
  fs.readdirSync(SCREENSHOT_DIR));
console.log("DIRECTORIES ONLY:",
  folders);
const latestFolder = folders
  .map(f => ({
    name: f,
    time: fs.statSync(path.join(SCREENSHOT_DIR, f)).mtime.getTime()
  }))
  .sort((a,b) => b.time - a.time)[0].name;

const imageDir = path.join(SCREENSHOT_DIR, latestFolder);

const grouped = {};

/* ---------------- SCREENSHOTS ---------------- */

fs.readdirSync(imageDir).forEach(img => {

  if (
    !img.endsWith('.png') ||
    img.includes('diff') ||         // ❌ remove diff images
    img.includes('reference')    // ❌ safety
  ) return;

  const clean = img.replace('.png', '');
  
  const parts = clean.split('_');

// page name
const rawPage = parts.slice(1, parts.length - 4).join('_');

const page = rawPage
  .replace(/_\d+$/, '')   // 🔥 removes "_0"
  .replace(/_/g, ' ')
  .trim();

  // device label (LAST 2 parts ALWAYS)
  const last = parts.slice(-1)[0];
  const secondLast = parts.slice(-2, -1)[0];
  
  const device =
    ['mobile','tablet','desktop'].includes(last)
      ? last
      : (['portrait','landscape'].includes(last)
          ? secondLast + '_' + last
          : last); // mobile_portrait ✅

const cleanPage = page.replace(/\s\d+$/, '').trim();
const key = `${cleanPage}__${device}`;

  if (!grouped[key]) {
    grouped[key] = {
      page,
      device,
      image: img,
      issues: []
    };
  }

});


/* ---------------- MERGE ISSUES ---------------- */

const normalize = str =>
  str?.toLowerCase().replace(/[\s_-]+/g, '');

qaData.forEach(entry => {

  let foundKey = null;

  Object.keys(grouped).forEach(k => {

    const [page, device] = k.split('__');

    if (
      normalize(page).includes(normalize(entry.page)) &&
      normalize(device).includes(normalize(entry.device))
    ) {
      foundKey = k;
    }

  });

  if (foundKey) {
    grouped[foundKey].issues = [
      ...new Set([
        ...grouped[foundKey].issues,
        ...entry.issues
      ])
    ];
  } else {
    console.log("❌ NO MATCH FOUND FOR:", entry.page, entry.device);
  }

});
console.log(JSON.stringify(grouped, null, 2));

/* ---------------- HTML ---------------- */

let html = `
<html>
<head>
<title>QA Reprot By Md Imran</title>
<link rel="icon" href="./assets/favicon.png">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

<style>
body {
  font-family: Arial;
  background:#0f172a;
  color:#fff;
  padding:20px;
}
.severity {
  margin-left: 10px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: bold;
}

.severity.critical {
  background: #ff4757;
  color: white;
}

.severity.major {
  background: #ffa502;
  color: black;
}

.severity.minor {
  background: #2ed573;
  color: black;
}

h1 {
  margin-bottom:20px;
}

.filters {
  margin-bottom:20px;
}

select {
  padding:6px;
  margin-right:10px;
}

.card {
  background:#1e293b;
  padding:15px;
  margin-bottom:15px;
  border-radius:8px;
}

.pass { border-left:5px solid #22c55e; }
.fail { border-left:5px solid #ef4444; }

.score {
  font-size:18px;
  margin:10px 0;
}

img {
  width:500px;
  cursor:pointer;
  margin-top:10px;
  border:1px solid #333;
}

.viewer {
  display:none;
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.9);
  text-align:center;
}

.viewer img {
  max-width:90%;
  max-height:90%;
  margin-top:5%;
}
</style>
</head>

<script>
async function downloadPDF() {
  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF('p', 'mm', 'a4');

  const cards = document.querySelectorAll('.card');

  const margin = 10;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const usableWidth = pageWidth - (margin * 2);

  for (let i = 0; i < cards.length; i++) {

    const canvas = await html2canvas(cards[i], {
      scale: 2,
      useCORS: true
    });

    const imgData = canvas.toDataURL('image/png');

    const imgHeight = (canvas.height * usableWidth) / canvas.width;

    if (i > 0) pdf.addPage();

    /* ---------- HEADER ---------- */
    pdf.setFontSize(12);
    pdf.text("QA Report - Md Imran", margin, 8);

    pdf.setFontSize(9);
    pdf.text(new Date().toLocaleString(), pageWidth - 60, 8);

    /* ---------- IMAGE ---------- */
    pdf.addImage(
      imgData,
      'PNG',
      margin,
      15,
      usableWidth,
      imgHeight
    );

    /* ---------- FOOTER ---------- */
    
  }

  pdf.save('QA-Report.pdf');
}
</script>
<body>

<h1>QA Reprot by Md Imran</h1>



<div class="filters">
  <label>Page:</label>
  <select id="pageFilter"></select>

  <label>Device:</label>
  <select id="deviceFilter"></select>
  <label>Severity:</label>
<select id="severityFilter">
  <option value="">All</option>
  <option value="critical">Critical</option>
  <option value="major">Major</option>
  <option value="minor">Minor</option>
</select>

<button onclick="window.print()">🖨️ Print / Save PDF</button>

<style>
@media print {
  .filters, button {
    display: none;
  }

  .card {
    page-break-after: always;
  }
}

</style>

</div>
`;


Object.values(grouped).forEach(item => {

  const uniqueIssues = [...new Set(item.issues)];
  const isFail = uniqueIssues.length > 0;

  //ADD SEVERITY LOGIC
  let severity = 'minor';

uniqueIssues.forEach(i => {
  const t = i.toLowerCase();

  if (t.includes('broken') || t.includes('blank')) {
    severity = 'critical';
  } else if (
    t.includes('overflow') ||
    t.includes('overlap') ||
    t.includes('alignment')
  ) {
    if (severity !== 'critical') severity = 'major';
  }
});

  /* ---------------- ISSUE COUNT ---------------- */

  const issueCount = {
    broken: 0,
    overlap: 0,
    overflow: 0,
    alignment: 0,
    baseline: 0,
    center: 0,
    rhythm: 0,
    spacing: 0,
    font: 0
  };
  
  const weights = {
    broken: 15,
    overlap: 12,
    overflow: 10,
    alignment: 6,
    baseline: 8,
    center: 8,
    spacing: 7,
    component: 9
  };

  let score = 100;

  uniqueIssues.forEach(i => {

    const t = i.toLowerCase();
    const num = parseInt(i.match(/\d+/)?.[0] || 1);
  
    if (t.includes('broken')) {
      issueCount.broken += num;
      score -= weights.broken * num;
    }
  
    if (t.includes('overlap')) {
      issueCount.overlap += num;
      score -= weights.overlap * num;
    }
  
    if (t.includes('overflow')) {
      issueCount.overflow += num;
      score -= weights.overflow * num;
    }
  
    if (t.includes('alignment')) {
      issueCount.alignment += num;
      score -= weights.alignment * num;
    }
  
    if (t.includes('baseline')) {
      issueCount.baseline += num;
      score -= weights.baseline * num;
    }
  
    if (t.includes('center-axis')) {
      issueCount.center += num;
      score -= weights.center * num;
    }
    
    if (t.includes('rhythm')) {
        const num = parseInt(i.match(/\d+/)?.[0] || 1);
        issueCount.rhythm += num;
        score -= weights.rhythm * num;
      
      }
  
    if (t.includes('spacing')) {
      issueCount.spacing += num;
      score -= weights.spacing * num;
    }
    
   if (t.includes('font')) {
        const num = parseInt(i.match(/\d+/)?.[0] || 1);
        issueCount.font += num;
      score -= weights.font * num;
      }
    
    if (t.includes('navbar') || t.includes('hero') || t.includes('card')) {
      score -= weights.component * num;
    }
  
  
  });

  if (score < 0) score = 0;

  html += `
  <div class="card ${isFail ? 'fail' : 'pass'}"
  data-page="${item.page}"
  data-device="${item.device}"
  data-severity="${severity}">

  <h2>
  ${item.page} | ${item.device} | Issues: ${uniqueIssues.length}
  
  <span class="severity ${severity}">
    ${severity.toUpperCase()}
  </span>
  
  <span class="${isFail ? 'fail' : 'pass'}">
    ${isFail ? 'FAIL' : 'PASS'}
  </span>
  </h2> 

<div class="score">
UI Health Score: ${score}/100
</div>

<br>

<img src="${path.join(imageDir, item.image)}"
onclick="openImage(this.src)" />

${isFail ? `

<h3>Issue Breakdown</h3>
<ul>
<li>Broken: ${issueCount.broken}</li>
<li>Overlap: ${issueCount.overlap}</li>
<li>Overflow: ${issueCount.overflow}</li>
<li>Alignment: ${issueCount.alignment}</li>
<li>Baseline: ${issueCount.baseline}</li>
<li>Center-axis: ${issueCount.center}</li>
<li>Spacing: ${issueCount.spacing}</li>
</ul>


<style>
.pulse-alert {
  background: #ff4757;
  color: white;
  padding: 12px;
  border-radius: 8px;
  font-weight: bold;
  text-align: center;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(255,71,87, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(255,71,87, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255,71,87, 0); }
}

.legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px;
  background: #1e293b;
  border-radius: 8px;
}

.item {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
}

.broken { background:#ffe5e5; color:#d63031; }
.overflow { background:#fff4e5; color:#e67e22; }
.overlap { background:#f3e5f5; color:#8e44ad; }
.alignment { background:#e7f1ff; color:#2980b9; }

.high { color:#ef4444; }
.medium { color:#f59e0b; }
.low { color:#22c55e; }
</style>


<div class="pulse-alert">
⚠️ Check highlight colors in screenshot
</div>

<div class="legend">
  <span class="item broken">🔴 Broken</span>
  <span class="item overflow">🟠 Overflow</span>
  <span class="item overlap">🟣 Overlap</span>
  <span class="item alignment">🔵 Alignment</span>
</div>

<h3>⚠️ Detected Issues</h3>
<ul>
${uniqueIssues.map(issue => {

  let color = '#22c55e'; // default green

  if (issue.includes('Broken images')) {
    color = '#d63031'; // red
  }
  
  else if (issue.includes('Possible overlaps')) {
    color = '#8e44ad'; // purple
  }
  else if (issue.includes('CTA not visible above fold')) {
    color = '#d63031'; // red
  }
  
  else if (issue.includes('Alignment issues')) {
    color = '#8e44ad'; // purple
  }
  
  else if (issue.includes('Baseline grid alignment issues')) {
    color = '#e67e22'; // orange
  }
  
  else if (issue.includes('Center-axis alignment issues')) {
    color = '#e67e22'; // orange
  }

  else if (issue.includes('Layering issues')) {
    color = '#e67e22'; // orange
  }

  else if (issue.includes('Duplicate URLs')) {
    color = '#e67e22'; // orange
  }

  else if (issue.includes('Broken links')) {
    color = '#e67e22'; // orange
  }

  else if (issue.includes('Potential bad links')) {
    color = '#e67e22'; // orange
  }
 

  
  return `<li style="color:${color}; font-weight:600;">${issue}</li>`;

}).join('')}
</ul>

` : `<p>No issues detected</p>`}

</div>
`;
});

/* ---------------- LIGHTBOX ---------------- */

html += `

<div class="viewer" id="viewer" onclick="this.style.display='none'">
  <img id="fullImg">
</div>

<script>

const pageSet = new Set();
const deviceSet = new Set();

document.querySelectorAll('.card').forEach(card => {
  pageSet.add(card.dataset.page);
  deviceSet.add(card.dataset.device);
});

const pageFilter = document.getElementById('pageFilter');
const deviceFilter = document.getElementById('deviceFilter');

pageFilter.innerHTML =
  '<option value="">All</option>' +
  [...pageSet].map(p => '<option>'+p+'</option>').join('');

deviceFilter.innerHTML =
  '<option value="">All</option>' +
  [...deviceSet].map(d => '<option>'+d+'</option>').join('');

  const severityFilter = document.getElementById('severityFilter');

  pageFilter.onchange =
  deviceFilter.onchange =
  severityFilter.onchange = filterData;

function filterData() {

  const p = pageFilter.value;
  const d = deviceFilter.value;
  const s = severityFilter.value;

  document.querySelectorAll('.card').forEach(card => {

    const show =
    (!p || card.dataset.page === p) &&
    (!d || card.dataset.device === d) &&
    (!s || card.dataset.severity === s);

    card.style.display = show ? 'block' : 'none';

  });

}

function openImage(src){
  document.getElementById('viewer').style.display='block';
  document.getElementById('fullImg').src = src;
}

</script>

</body>
</html>
`;

// NOTE: generateReport.js is reused by multiple pipelines.
// For Sitemap pipeline we want a distinct output filename.
const outputName = process.env.SITEMAP_OUTPUT_HTML === '1'
  ? 'reportsitemap.html'
  : 'qa-report.html';


fs.writeFileSync(outputName, html);

console.log(`✅ QA report generated: ${outputName}`);

const { exec } = require('child_process');


exec(`start qa-report.html`); // Windows
