#!/usr/bin/env node

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  // Repo root typically doesn't have playwright installed.
  // Your existing Playwright install is under ./backend.
  ({ chromium } = require('./backend/node_modules/playwright'));
}


function log(...args) {
  process.stdout.write(args.join(' ') + '\n');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeBaseUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') throw new Error('mainUrl is required');
  let url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/$/, '');
  return url;
}

function stripHashAndQuery(u) {
  try {
    const urlObj = new URL(u);
    urlObj.hash = '';
    urlObj.search = '';
    return urlObj.toString().replace(/\/$/, '');
  } catch {
    return u;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchTextWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'seo-audit-playwright/1.0 (+node)' }
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(id);
  }
}

function extractLocsFromXml(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return [];
  const matches = xmlText.match(/<loc>\s*([^<\s]+?)\s*<\/loc>/gi) || [];
  return matches
    .map((m) => m.replace(/<\/?loc>/gi, '').trim())
    .filter(Boolean);
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function concurrencyMapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let active = 0;

  return new Promise((resolve) => {
    const launch = () => {
      while (active < limit && nextIndex < items.length) {
        const idx = nextIndex++;
        active++;
        Promise.resolve(worker(items[idx], idx))
          .then((r) => {
            results[idx] = r;
          })
          .catch((e) => {
            results[idx] = { error: true, message: e?.message || String(e) };
          })
          .finally(() => {
            active--;
            if (nextIndex >= items.length && active === 0) resolve(results);
            else launch();
          });
      }
    };
    launch();
  });
}

function parseCommentBlocks(html) {
  if (!html) return [];
  const re = /<!--([\s\S]*?)-->/g;
  const blocks = [];
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1] || '');
  return blocks;
}

function countOccurrencesFromPattern(pattern, text) {
  if (!text) return 0;
  const re = new RegExp(pattern, 'gi');
  const m = text.match(re);
  return m ? m.length : 0;
}

function isEmptyValue(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function getAllHeadingLevelsFromSource(html) {
  if (!html) return [];
  const re = /<\s*(h([1-4]))\b[^>]*>/gi;
  const levels = [];
  let m;
  while ((m = re.exec(html)) !== null) levels.push(parseInt(m[2], 10));
  return levels;
}

function computeHierarchyStatusFromLevels(levels) {
  if (!levels.length) return { ok: false, reason: 'No h1-h4 headings found in source' };
  let prev = null;
  for (const lvl of levels) {
    if (prev === null) {
      if (lvl !== 1) return { ok: false, reason: `First heading is h${lvl} (expected h1)` };
      prev = lvl;
      continue;
    }
    if (lvl !== prev + 1) return { ok: false, reason: `Broken heading hierarchy: h${prev} -> h${lvl} (expected +1 step)` };
    prev = lvl;
  }
  return { ok: true, reason: 'Valid strict hierarchy (no skipping)' };
}

function buildSeoScore({ criticalCount, minorCount }) {
  const score = 100 - criticalCount * 10 - minorCount * 3;
  return clamp(score, 0, 100);
}

function computeBadLinkCounts(html) {
  const hrefHash = (html.match(/href\s*=\s*(['"])#\1/gi) || []).length;
  const jsVoid = (html.match(/javascript\s*:\s*void\s*\(\s*0\s*\)/gi) || []).length;
  return { hrefHash, jsVoid };
}

async function scanPage({ browser, url, timeoutMs = 15000 }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const started = Date.now();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    try {
      await page.waitForLoadState('networkidle', { timeout: Math.min(8000, timeoutMs) });
    } catch {
      // ignore
    }
    await sleep(500);

    const domHtml = await page.content();

    const domExtract = await page.evaluate(() => {
      const getTextFromMeta = (selector) => {
        const el = document.querySelector(selector);
        return el ? (el.getAttribute('content') || '').trim() : '';
      };
      const titleEl = document.querySelector('title');
      const title = titleEl ? (titleEl.textContent || '').trim() : '';
      const description = getTextFromMeta('meta[name="description"]');

      const ogTitle = getTextFromMeta('meta[property="og:title"]');
      const ogDescription = getTextFromMeta('meta[property="og:description"]');
      const ogImage = getTextFromMeta('meta[property="og:image"]');

      const hiddenHeuristic = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0' ||
          rect.width === 0 ||
          rect.height === 0
        );
      };

      const countVisibleByTag = (tag) => {
        const nodes = Array.from(document.querySelectorAll(tag));
        return nodes.filter((n) => !hiddenHeuristic(n)).length;
      };

      const h1Visible = countVisibleByTag('h1');
      const h2Visible = countVisibleByTag('h2');
      const h3Visible = countVisibleByTag('h3');
      const h4Visible = countVisibleByTag('h4');

      const imgNodes = Array.from(document.querySelectorAll('img'));
      const missingAlt = imgNodes.filter((img) => {
        if (hiddenHeuristic(img)) return false;
        const alt = (img.getAttribute('alt') || '').trim();
        return alt === '';
      }).length;

      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const hrefHash = anchors.filter((a) => (a.getAttribute('href') || '') === '#').length;
      const jsVoid = anchors.filter((a) => {
        const v = (a.getAttribute('href') || '').trim();
        return /^javascript\s*:\s*void\s*\(\s*0\s*\)/i.test(v);
      }).length;

      return { title, description, ogTitle, ogDescription, ogImage, h1Visible, h2Visible, h3Visible, h4Visible, missingAlt, hrefHash, jsVoid };
    });

    const commentBlocks = parseCommentBlocks(domHtml);

    // SOURCE-based strict counts (visible + hidden + commented are approximated by parsing raw HTML)
    const h1CountAll = countOccurrencesFromPattern('<\\s*h1\\b', domHtml);
    const h2CountAll = countOccurrencesFromPattern('<\\s*h2\\b', domHtml);
    const h3CountAll = countOccurrencesFromPattern('<\\s*h3\\b', domHtml);
    const h4CountAll = countOccurrencesFromPattern('<\\s*h4\\b', domHtml);

    const titleCountAll = countOccurrencesFromPattern('<\\s*title\\b', domHtml);
    const titleEmptyCount = countOccurrencesFromPattern('<\\s*title\\b[^>]*>\\s*<\\s*\/\\s*title\\s*>', domHtml);

    const metaDescCount = countOccurrencesFromPattern('<\\s*meta[^>]+name\\s*=\\s*["\']description["\'][^>]*>', domHtml);
    const emptyMetaDescCount = countOccurrencesFromPattern('<\\s*meta[^>]+name\\s*=\\s*["\']description["\'][^>]+content\\s*=\\s*["\']\\s*["\'][^>]*>', domHtml);

    const ogTitleCount = countOccurrencesFromPattern('<\\s*meta[^>]+property\\s*=\\s*["\']og:title["\']', domHtml);
    const ogDescCount = countOccurrencesFromPattern('<\\s*meta[^>]+property\\s*=\\s*["\']og:description["\']', domHtml);
    const ogImageCount = countOccurrencesFromPattern('<\\s*meta[^>]+property\\s*=\\s*["\']og:image["\']', domHtml);

    const ogTagMissing = {
      'og:title': ogTitleCount === 0,
      'og:description': ogDescCount === 0,
      'og:image': ogImageCount === 0
    };

    const commentedH1Count = commentBlocks.reduce((acc, b) => acc + countOccurrencesFromPattern('<\\s*h1\\b', b), 0);
    const commentedTitleCount = commentBlocks.reduce((acc, b) => acc + countOccurrencesFromPattern('<\\s*title\\b', b), 0);

    const emptyH1Count = countOccurrencesFromPattern('<\\s*h1\\b[^>]*>\\s*<\\s*\/\\s*h1\\s*>', domHtml);

    // Duplicate H1 text from source inner text
    const h1TextMatches = [];
    const h1Re = /<\\s*h1\\b[^>]*>([\\s\\S]*?)<\\s*\/\\s*h1\\s*>/gi;
    let hm;
    while ((hm = h1Re.exec(domHtml)) !== null) {
      const raw = (hm[1] || '').replace(/<!--([\\s\\S]*?)-->/g, '$1');
      const txt = raw.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
      if (txt) h1TextMatches.push(txt);
    }
    const h1Dupes = (() => {
      const counts = {};
      for (const t of h1TextMatches.map((x) => x.toLowerCase())) counts[t] = (counts[t] || 0) + 1;
      return Object.entries(counts).filter(([, c]) => c >= 2).map(([t]) => t);
    })();

    const hierarchyLevels = getAllHeadingLevelsFromSource(domHtml);
    const hierarchyStatus = computeHierarchyStatusFromLevels(hierarchyLevels);

    const bad = computeBadLinkCounts(domHtml);

    const issues = { critical: [], minor: [], hidden: [] };
    const addIssue = (severity, name, detail) => issues[severity].push({ name, detail });

    // Critical rules
    if (h1CountAll === 0) addIssue('critical', 'Missing <h1>', 'No h1 tag found in source (visible/hidden/commented).');
    if (h1CountAll > 1) addIssue('critical', 'Multiple <h1>', `Found ${h1CountAll} h1 tags in source (visible + hidden + commented).`);
    if (emptyH1Count > 0) addIssue('critical', 'Empty <h1> tag', `Found ${emptyH1Count} empty h1 tags in source.`);
    if (h1Dupes.length > 0) addIssue('critical', 'Duplicate <h1> text', `Duplicate H1 text detected: ${h1Dupes.slice(0, 5).join(' | ')}${h1Dupes.length > 5 ? '…' : ''}`);

    if (titleCountAll === 0) addIssue('critical', 'Missing <title>', 'No <title> tag found in source.');
    else if (titleEmptyCount > 0) addIssue('critical', 'Empty <title>', `Found ${titleEmptyCount} empty title tag(s) in source.`);
    if (titleCountAll > 1) addIssue('critical', 'Multiple <title> tags', `Found ${titleCountAll} <title> tags in source.`);

    if (isEmptyValue(domExtract.title)) addIssue('critical', 'Empty/invalid title (DOM)', 'title text is empty in DOM.');

    if (metaDescCount === 0) addIssue('critical', 'Missing meta description', 'No meta[name="description"] tag found in source.');
    else if (emptyMetaDescCount > 0 || isEmptyValue(domExtract.description)) addIssue('critical', 'Empty meta description', 'meta[name="description"] exists but is empty.');

    if (metaDescCount > 1) addIssue('minor', 'Multiple meta description tags', `Found ${metaDescCount} description meta tags in source.`);

    if (ogTagMissing['og:title'] || ogTagMissing['og:description'] || ogTagMissing['og:image']) {
      const missing = [];
      if (ogTagMissing['og:title']) missing.push('og:title');
      if (ogTagMissing['og:description']) missing.push('og:description');
      if (ogTagMissing['og:image']) missing.push('og:image');
      addIssue('critical', 'Missing Open Graph tags', `Missing required OG tag(s): ${missing.join(', ')}`);
    } else {
      if (isEmptyValue(domExtract.ogTitle)) addIssue('critical', 'Empty og:title', 'og:title exists but content is empty');
      if (isEmptyValue(domExtract.ogDescription)) addIssue('critical', 'Empty og:description', 'og:description exists but content is empty');
      if (isEmptyValue(domExtract.ogImage)) addIssue('critical', 'Empty og:image', 'og:image exists but content is empty');
    }

    if (bad.hrefHash > 0) addIssue('critical', 'Bad links: href="#"', `Found ${bad.hrefHash} href="#" link(s).`);
    if (bad.jsVoid > 0) addIssue('critical', 'Bad links: javascript:void(0)', `Found ${bad.jsVoid} javascript:void(0) link(s).`);

    if (domExtract.missingAlt > 0) addIssue('critical', 'Images without ALT', `Found ${domExtract.missingAlt} image(s) without alt (visible).`);

    // Hierarchy
    if (!hierarchyStatus.ok) addIssue('critical', 'Broken heading hierarchy', hierarchyStatus.reason);

    // Minor
    const hasCanonical = /<\s*link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i.test(domHtml);
    if (!hasCanonical) addIssue('minor', 'Missing canonical', 'No canonical link tag found in source.');

    const hasHtmlLang = /<\s*html[^>]*\slang\s*=\s*["'][^"']+["']/i.test(domHtml);
    if (!hasHtmlLang) addIssue('minor', 'Missing <html lang>', 'html element missing lang attribute.');

    const hasViewport = /<\s*meta[^>]+name\s*=\s*["']viewport["'][^>]*>/i.test(domHtml);
    if (!hasViewport) addIssue('minor', 'Missing viewport meta', 'meta[name="viewport"] missing.');

    const robotsNoIndex = /<\s*meta[^>]+name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex[^"']*["']/i.test(domHtml);
    const robotsIndex = /<\s*meta[^>]+name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*index[^"']*["']/i.test(domHtml);
    if (robotsNoIndex && robotsIndex) addIssue('minor', 'Robots meta conflict', 'robots meta contains both noindex and index.');

    const emptyMetaContentCount = countOccurrencesFromPattern('<\\s*meta[^>]+content\\s*=\\s*["\']\\s*["\'][^>]*>', domHtml);
    if (emptyMetaContentCount > 0) addIssue('minor', 'Empty meta content tags', `Found ${emptyMetaContentCount} meta tag(s) with empty content attribute.`);

    // Hidden (commented)
    if (commentedH1Count > 0) addIssue('hidden', 'Commented <h1>', `Found <h1> tags inside HTML comments: ${commentedH1Count} occurrence(s).`);
    if (commentedTitleCount > 0) addIssue('hidden', 'Commented <title>', `Found <title> tags inside HTML comments: ${commentedTitleCount} occurrence(s).`);

    const criticalCount = issues.critical.length;
    const minorCount = issues.minor.length;
    const seoScore = buildSeoScore({ criticalCount, minorCount });

    return {
      url,
      title: domExtract.title,
      description: domExtract.description,
      h1Count: h1CountAll,
      h2Count: h2CountAll,
      h3Count: h3CountAll,
      hierarchyStatus: hierarchyStatus.ok ? 'YES (strict hierarchy)' : `NO (${hierarchyStatus.reason})`,
      counts: { hrefHash: domExtract.hrefHash, jsVoid: domExtract.jsVoid, missingAlt: domExtract.missingAlt },
      issues: {
        critical: issues.critical.map((x) => `${x.name}: ${x.detail}`),
        minor: issues.minor.map((x) => `${x.name}: ${x.detail}`),
        hidden: issues.hidden.map((x) => `${x.name}: ${x.detail}`)
      },
      seoScore,
      _debug: { durationMs: Date.now() - started }
    };
  } finally {
    try {
      await page.close();
    } catch {}
    try {
      await context.close();
    } catch {}
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

function generateHtmlReport({ mainUrl, scanDate, pages }) {
  const totalPages = pages.length;
  const totalCritical = pages.reduce((acc, p) => acc + (p.issues.critical?.length || 0), 0);
  const totalMinor = pages.reduce((acc, p) => acc + (p.issues.minor?.length || 0), 0);
  const totalHidden = pages.reduce((acc, p) => acc + (p.issues.hidden?.length || 0), 0);
  const averageScore = totalPages ? pages.reduce((a, p) => a + (p.seoScore || 0), 0) / totalPages : 0;

  const formatHierarchyShort = (s) => {
    const v = (s || '').toString();
    return v.startsWith('YES') ? 'YES' : 'NO';
  };

  const toIssueBullets = (issueList) => {
    if (!issueList || !issueList.length) return [{ text: '• None' }];
    return issueList.map((x) => {
      const t = (x || '').toString();

      // Normalize "Bad links: javascript:void(0): Found 1 ..."
      // into bullets: "• javascript:void(0): 1" etc.
      const mJsVoid = t.match(/Bad links:\s*javascript:void\(0\):\s*Found\s*(\d+)\s+javascript:void\(0\)\s+link\(s\)/i);
      if (mJsVoid) return { text: `• javascript:void(0): ${mJsVoid[1]}` };

      const mHrefHash = t.match(/Bad links:\s*href="#":\s*Found\s*(\d+)\s+href="#"\s+link\(s\)/i);
      if (mHrefHash) return { text: `• href="#": ${mHrefHash[1]}` };

      // Current UI sometimes stores like: "Bad links: javascript:void(0): 12 🔴"
      const mJsVoid2 = t.match(/Bad links:\s*javascript:void\(0\):\s*(\d+)/i);
      if (mJsVoid2 && !mJsVoid) return { text: `• javascript:void(0): ${mJsVoid2[1]}` };

      const mHrefHash2 = t.match(/Bad links:\s*href="#":\s*(\d+)/i);
      if (mHrefHash2 && !mHrefHash) return { text: `• href="#": ${mHrefHash2[1]}` };

      return { text: `• ${t}` };
    });
  };


  const rows = pages
    .map((p) => {
      const criticalLen = p.issues.critical?.length || 0;
      const minorLen = p.issues.minor?.length || 0;
      const hiddenLen = p.issues.hidden?.length || 0;

      const scoreLabel = p.seoScore >= 80 ? '🟢 Good' : p.seoScore >= 50 ? '🟡 Minor' : '🔴 Critical';
      const scoreCls = p.seoScore >= 80 ? 'good' : p.seoScore >= 50 ? 'minor' : 'critical';

      const issuesCell = [criticalLen ? `🔴 ${criticalLen}` : '', minorLen ? `🟡 ${minorLen}` : '', hiddenLen ? `🔵 ${hiddenLen}` : '']
        .filter(Boolean)
        .join(' | ');

      return `
      <tr>
        <td class="mono">${escapeHtml(p.url)}</td>
        <td>${escapeHtml(p.title || '')}</td>
        <td>${p.h1Count}</td>
        <td>${escapeHtml(p.hierarchyStatus || '')}</td>
        <td>${escapeHtml(issuesCell || '—None-')}</td>
        <td>${p.counts?.hrefHash || 0}</td>
        <td>${p.counts?.jsVoid || 0}</td>
        <td>${p.counts?.missingAlt || 0}</td>
        <td><span class="pill ${scoreCls}">${scoreLabel} ${p.seoScore}</span></td>
      </tr>`;
    })
    .join('\n');

  const pageBlocks = pages
    .map((p) => {
      const criticalList = (p.issues.critical || []).map((x) => `<li><code>${escapeHtml(x)}</code></li>`).join('') || '<li>—</li>';
      const minorList = (p.issues.minor || []).map((x) => `<li><code>${escapeHtml(x)}</code></li>`).join('') || '<li>—</li>';
      const hiddenList = (p.issues.hidden || []).map((x) => `<li><code>${escapeHtml(x)}</code></li>`).join('') || '<li>—</li>';

      return `
      <div class="pageCard">
        <div class="pageHeader">
          <div>
            <div class="pageUrl mono">${escapeHtml(p.url)}</div>
            <div class="pageMeta">Title: <b>${escapeHtml(p.title || '')}</b></div>
          </div>
          <div>
            <span class="pill ${p.seoScore >= 80 ? 'good' : p.seoScore >= 50 ? 'minor' : 'critical'}">Score ${p.seoScore}</span>
          </div>
        </div>

        <div class="sectionGrid">
          <details open>
            <summary>🔴 Critical Issues (${(p.issues.critical || []).length})</summary>
            <ul>${criticalList}</ul>
          </details>
          <details open>
            <summary>🟡 Minor Issues (${(p.issues.minor || []).length})</summary>
            <ul>${minorList}</ul>
          </details>
          <details open>
            <summary>🔵 Hidden Issues (${(p.issues.hidden || []).length})</summary>
            <ul>${hiddenList}</ul>
          </details>
        </div>
      </div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SEO Audit Report</title>
<style>
  :root{--bg:#0b1220;--card:#121b2f;--text:#e7eefc;--muted:#a9b6d6;--border:rgba(255,255,255,.10);--good:#22c55e;--minor:#f59e0b;--critical:#ef4444;}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;background:linear-gradient(135deg,#0b1220,#0f1b33);color:var(--text)}
  .wrap{max-width:1200px;margin:0 auto;padding:24px}
  header{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;margin-bottom:16px}
  .brand{font-weight:800;font-size:18px}
  .sub{color:var(--muted);margin-top:6px;font-size:13px}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
  .stat{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:14px;padding:14px}
  .stat .k{color:var(--muted);font-size:12px}
  .stat .v{font-size:18px;font-weight:800;margin-top:6px}
  .controls{display:flex;gap:10px;flex-wrap:wrap}
  button{cursor:pointer;background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:12px;font-weight:700}
  button:hover{background:rgba(255,255,255,.10)}
  .pill{display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border-radius:999px;border:1px solid var(--border)}
  .good{color:var(--good)} .minor{color:var(--minor)} .critical{color:var(--critical)}
  table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:14px;border:1px solid var(--border);background:rgba(255,255,255,.03)}
  th,td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}
  th{font-size:12px;color:var(--muted);text-align:left;background:rgba(255,255,255,.03)}
  tr:last-child td{border-bottom:none}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px}
  .pageCard{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:16px;padding:14px;margin-top:14px}
  .pageHeader{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
  .pageUrl{font-weight:800}
  .pageMeta{color:var(--muted);font-size:13px;margin-top:6px}
  .sectionGrid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}
  @media(min-width:900px){.sectionGrid{grid-template-columns:repeat(3,1fr)}}
  details{background:rgba(0,0,0,.15);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:10px 12px}
  summary{cursor:pointer;font-weight:800}
  ul{margin:10px 0 0 18px;padding:0}
  li{margin:6px 0}
  code{color:#dbe6ff}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <div class="brand">QA Report By MD IMRAN</div>
        <div class="sub">Main URL: <b class="mono">${escapeHtml(mainUrl)}</b></div>
        <div class="sub">Scan date: <b>${escapeHtml(scanDate)}</b></div>
      </div>
      <div class="controls">
        <button onclick="window.print()">Print report</button>
        <button onclick="window.print()">Download PDF</button>
      </div>
    </header>

    <div class="summary">
  <div class="stat">
    <span class="k">Total Pages :</span>
    <span class="v">${totalPages}</span>
  </div>

  <div class="stat">
    <span class="k">🔴 Total Critical Issues :</span>
    <span class="v" style="color:var(--critical)">
      ${pages.reduce((a,p)=>a+(p.issues.critical?.length||0),0)}
    </span>
  </div>

  <div class="stat">
    <span class="k">🟡 Total Minor Issues :</span>
    <span class="v" style="color:var(--minor)">
      ${pages.reduce((a,p)=>a+(p.issues.minor?.length||0),0)}
    </span>
  </div>

  <div class="stat">
    <span class="k">🔵 Total Hidden Issues :</span>
    <span class="v">
      ${pages.reduce((a,p)=>a+(p.issues.hidden?.length||0),0)}
    </span>
  </div>
</div>

    <table>
      <thead>
        <tr>
          <th>URL</th>
          <th>Title</th>
          <th>H1</th>
          <th>Hierarchy</th>
          <th>Issues</th>
          <th>href#</th>
          <th>JS Void</th>
          <th>Img Alt Missing</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    ${pageBlocks}
  </div>
</body>
</html>`;
}

function isSitemapUrl(url, contentType) {
  const u = (url || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();
  return u.endsWith('.xml') || u.includes('sitemap') || ct.includes('xml');
}

async function extractUrlsFromSitemap(url, visited = new Set(), depth = 0) {
  const MAX_DEPTH = 3;
  const MAX_URLS = 50;

  if (!url) return [];
  if (visited.has(url)) return [];
  if (depth > MAX_DEPTH) return [];

  visited.add(url);

  console.log('🔎 Processing sitemap:', url);

  let res;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': 'seo-audit-playwright/1.0 (+node)' }
    });
  } catch {
    return [];
  }

  const contentType = res.headers.get('content-type') || '';
  const xmlText = await res.text().catch(() => '');

  const locs = extractLocsFromXml(xmlText);
  console.log('📄 Found URLs:', locs.length);

  const final = [];

  for (const loc of locs) {
    if (final.length >= MAX_URLS) break;

    const cleaned = stripHashAndQuery(loc);
    if (!cleaned) continue;

    if (isSitemapUrl(cleaned, contentType)) {
      console.log('🔁 Nested sitemap detected:', cleaned);
      const nested = await extractUrlsFromSitemap(cleaned, visited, depth + 1);
      for (const n of nested) {
        if (final.length >= MAX_URLS) break;
        final.push(n);
      }
    } else {
      final.push(cleaned);
    }
  }

  const deduped = Array.from(new Set(final));
  console.log('✅ Final page URLs:', deduped.length);
  return deduped;
}

async function detectSitemapUrls(mainUrl) {
  const sitemap1 = `${mainUrl}/sitemap.xml`;
  const sitemap2 = `${mainUrl}/sitemap_index.xml`;

  const r1 = await fetchTextWithTimeout(sitemap1, 8000).catch(() => null);
  if (r1 && r1.ok) return { found: true, sitemapUrl: sitemap1, xmlText: r1.text };

  const r2 = await fetchTextWithTimeout(sitemap2, 8000).catch(() => null);
  if (r2 && r2.ok) return { found: true, sitemapUrl: sitemap2, xmlText: r2.text };

  return { found: false, xmlText: '' };
}

async function runSeoAudit({ mainUrl }) {
  const baseUrl = normalizeBaseUrl(mainUrl);
  const scanDate = new Date().toISOString();

  let urls = [baseUrl];

  log('🔎 Detecting sitemap...');
  const sitemap = await detectSitemapUrls(baseUrl);
  if (sitemap.found) {
    const max = 50;
    const min = 20;

    // New: recursively extract page URLs from nested sitemaps.
    const extractedPages = await extractUrlsFromSitemap(sitemap.sitemapUrl, new Set(), 0);
    const cleaned = uniq(extractedPages.map((u) => stripHashAndQuery(u))).filter((u) => u.startsWith(baseUrl));

    const limited = cleaned.length ? cleaned.slice(0, Math.min(max, cleaned.length)) : [baseUrl];
    urls = limited.length < min ? cleaned : limited;
    if (!urls.length) urls = [baseUrl];

    log('✅ Sitemap found:', sitemap.sitemapUrl);
    log('📄 URLs extracted:', urls.length);
  } else {
    log('⚠️ Sitemap not found; scanning main URL only');
  }


  const concurrency = 4;
  const timeoutMs = 15000;
  const retryCount = 1;

  const browser = await chromium.launch({ headless: true });
  try {
    log('🚀 Starting Playwright scan (headless)...');
    log(`📄 Total URLs to scan: ${urls.length}`);
    log(`🌐 Browser launched (headless) using Chromium`);

    let completed = 0;

    const pages = await concurrencyMapLimit(urls, concurrency, async (url) => {
      let lastErr;
      for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
          const currentIndex = completed + 1;
          log(`[${currentIndex}/${urls.length}] 🔎 Opening: ${url}`);
          log(`⏳ Waiting for DOM load...`);
          log(`🔍 Running SEO checks...`);

          const result = await scanPage({ browser, url, timeoutMs });
          completed++;
          log(`✅ Completed: ${url}`);
          return result;
        } catch (e) {
          lastErr = e;
          if (attempt < retryCount) {
            log(`🔁 Retrying: ${url} (Attempt ${attempt + 2})`);
          } else {
            log(`❌ Failed: ${url}`);
          }
          log(`⚠️ Error: ${e?.message || e}`);
        }
      }


      return {
        url,
        title: '',
        description: '',
        h1Count: 0,
        h2Count: 0,
        h3Count: 0,
        hierarchyStatus: 'NO (page scan failed)',
        counts: { hrefHash: 0, jsVoid: 0, missingAlt: 0 },
        issues: { critical: ['Page scan failed (headless Playwright error)'], minor: [], hidden: [] },
        seoScore: 0,
        _debug: { error: lastErr?.message || String(lastErr) }
      };
    });

    // Cross-page duplicate validation
    const titleToUrls = new Map();
    const descToUrls = new Map();

    for (const p of pages) {
      const t = (p.title || '').trim().toLowerCase();
      if (t) titleToUrls.set(t, [...(titleToUrls.get(t) || []), p.url]);

      const d = (p.description || '').trim().toLowerCase();
      if (d) descToUrls.set(d, [...(descToUrls.get(d) || []), p.url]);
    }

    const dupTitleSet = new Set();
    for (const [, us] of titleToUrls.entries()) if (us.length > 1) us.forEach((u) => dupTitleSet.add(u));

    const dupDescSet = new Set();
    for (const [, us] of descToUrls.entries()) if (us.length > 1) us.forEach((u) => dupDescSet.add(u));

    for (const p of pages) {
      if (dupTitleSet.has(p.url)) p.issues.critical.push('Duplicate title across pages (CRITICAL)');
      if (dupDescSet.has(p.url)) p.issues.critical.push('Duplicate description across pages (CRITICAL)');

      const criticalCount = p.issues.critical.length;
      const minorCount = p.issues.minor.length;
      p.seoScore = buildSeoScore({ criticalCount, minorCount });
    }

    log('🎉 All pages processed. Generating reports...');

    const htmlReport = generateHtmlReport({ mainUrl: baseUrl, scanDate, pages });

    return {

      meta: {
        tool: 'Playwright SEO Audit (headless)',
        mainUrl: baseUrl,
        startedAt: scanDate,
        sitemapUsed: sitemap.found ? sitemap.sitemapUrl : null,
        urlsAttempted: urls.length,
        concurrency,
        timeoutMs
      },
      pages,
      summary: {
        totalPages: pages.length,
        totalCritical: pages.reduce((a, p) => a + (p.issues.critical?.length || 0), 0),
        totalMinor: pages.reduce((a, p) => a + (p.issues.minor?.length || 0), 0),
        totalHidden: pages.reduce((a, p) => a + (p.issues.hidden?.length || 0), 0),
        averageScore: pages.reduce((a, p) => a + (p.seoScore || 0), 0) / (pages.length || 1)
      },
      htmlReport
    };
  } finally {
    try {
      await browser.close();
    } catch {}
  }
}

module.exports = {
  runSeoAudit,
  generateHtmlReport
  
  
};


