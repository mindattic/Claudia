#!/usr/bin/env node
/*
 * build-html.js — render Claudia_vN.md to a self-contained Claudia_vN.htm.
 *
 * Output is ONE file. No CDN. No <link>. No <script src>. Inlined CSS, inlined
 * JS, inlined images (base64 data URIs in the CSS). Modeled on mindattic.com's
 * single-file design convention with a light/dark theme toggle.
 *
 * Image pipeline:
 *   - parts.json + an internal lookup map per-part-id supply image URLs.
 *   - First build: downloads each image, caches under config/images-cache/.
 *   - Every build: reads the cached bytes, base64-encodes, embeds in CSS.
 *   - Any fetch failure falls back to an SVG placeholder so the build never
 *     breaks on network hiccups.
 *
 * Usage:
 *   node scripts/build-html.js [source.md] [--no-images] [--refresh-images]
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const crypto = require('crypto');
const https = require('https');
const http  = require('http');
const { URL } = require('url');
const { marked } = require('marked');
const hljs  = require('highlight.js');

const repoRoot     = path.resolve(__dirname, '..');
const configDir    = path.join(repoRoot, 'config');
const imagesCache  = path.join(configDir, 'images-cache');
const partsJsonPath = path.join(configDir, 'parts.json');

const argv = process.argv.slice(2);
const flagNoImages      = argv.includes('--no-images');
const flagRefreshImages = argv.includes('--refresh-images');
const sourceArg = argv.find(a => !a.startsWith('--'));

// ──────────────────────────────────────────────────────────────────────
// Part-id -> image URL. Kept in the build script (not parts.json) so the
// shopping catalog and the visual gallery stay decoupled. Pick stable hosts
// (Wikimedia, vendor product pages). Any URL that 403s / 404s / times out
// will fall back to a generated SVG placeholder; the build never fails.
// ──────────────────────────────────────────────────────────────────────
const PART_IMAGE_URLS = {
    'pi-zero-2-wh':       'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Raspberry_Pi_Zero_2_W_top.jpg/640px-Raspberry_Pi_Zero_2_W_top.jpg',
    'whisplay-hat':       'https://www.pisugar.com/assets/whisplay.png',
    'microsd-32gb':       'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/MicroSD_Karte.jpg/640px-MicroSD_Karte.jpg',
    'pi-power-supply':    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Raspberry_Pi_universal_power_supply.jpg/640px-Raspberry_Pi_universal_power_supply.jpg',
    'sunfounder-mic':     'https://m.media-amazon.com/images/I/61TgWzVfL5L._AC_SL1500_.jpg',
    'respeaker-xvf3800':  'https://files.seeedstudio.com/wiki/respeaker_xvf3800/img/main.jpg',
    'otg-adapter':        'https://cdn-shop.adafruit.com/970x728/1099-04.jpg',
    'pisugar3-battery':   'https://www.pisugar.com/assets/pisugar3.png',
    'tplink-kasa-hs103':  'https://static.tp-link.com/2020/202010/20201023/HS103P4_un_normal_1.0.jpg',
    'shelly-plug-us':     'https://www.shelly.com/cdn/shop/products/Shelly_Plug_US_3.jpg',
    'sonoff-s31':         'https://itead.cc/wp-content/uploads/2019/01/SONOFF-S31-1.jpg',
    'hiwonder-wonderecho':'https://www.hiwonder.com/cdn/shop/files/WonderEcho_Voice_AI_Voice_Module_AI_Voice_Recognition_AI_Module.jpg',
};

// ──────────────────────────────────────────────────────────────────────
// Markdown plumbing
// ──────────────────────────────────────────────────────────────────────
function slugify(t) {
    return String(t).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

marked.setOptions({
    gfm: true,
    breaks: false,
    smartypants: false,
    headerIds: true,
    mangle: false,
    highlight(code, lang) {
        try {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
        } catch (_) {}
        return hljs.highlightAuto(code).value;
    },
});

const renderer = new marked.Renderer();
renderer.heading = function (text, level, raw) {
    const id = slugify(raw);
    const anchor = level >= 2 && level <= 4
        ? ` <a class="heading-anchor" href="#${id}" aria-label="link to this section">#</a>`
        : '';
    return `<h${level} id="${id}">${text}${anchor}</h${level}>\n`;
};

function pickSource() {
    if (sourceArg) return path.resolve(sourceArg);
    // Date-versioned filenames: Claudia_YYYY.MM.DD.md. Lexicographic sort
    // gives chronological order, so the newest is last.
    const candidates = fs.readdirSync(repoRoot)
        .filter(f => /^Claudia_\d{4}\.\d{2}\.\d{2}\.md$/.test(f))
        .sort();
    if (!candidates.length) throw new Error('No Claudia_<YYYY.MM.DD>.md found in ' + repoRoot);
    return path.join(repoRoot, candidates[candidates.length - 1]);
}

function buildToc(md) {
    const lines = md.split(/\r?\n/);
    const items = [];
    let inFence = false;
    for (const line of lines) {
        if (/^```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;
        const m = line.match(/^##\s+(.+?)\s*$/);
        if (m) items.push(m[1].trim());
    }
    if (!items.length) return '';
    const lis = items.map(t => `<li><a href="#${slugify(t)}">${escapeHtml(t)}</a></li>`).join('\n');
    return `<nav class="toc" aria-label="Table of contents"><div class="toc-title">Contents</div><ol>${lis}</ol></nav>`;
}

function extractTitle(md) {
    const m = md.match(/^\s*#\s+(.+?)\s*$/m);
    return m ? m[1].trim() : 'Claudia';
}

// ──────────────────────────────────────────────────────────────────────
// Image fetch + cache
// ──────────────────────────────────────────────────────────────────────
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function extensionFor(contentType, urlPath) {
    if (contentType) {
        const ct = contentType.split(';')[0].trim().toLowerCase();
        if (ct === 'image/jpeg') return '.jpg';
        if (ct === 'image/png')  return '.png';
        if (ct === 'image/webp') return '.webp';
        if (ct === 'image/gif')  return '.gif';
        if (ct === 'image/svg+xml') return '.svg';
    }
    const ext = path.extname(urlPath || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) {
        return ext === '.jpeg' ? '.jpg' : ext;
    }
    return '.jpg';
}

function mimeFor(ext) {
    return ({ '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream';
}

function fetchUrl(urlStr, redirects) {
    return new Promise((resolve, reject) => {
        if ((redirects || 0) > 5) return reject(new Error('too many redirects'));
        let u;
        try { u = new URL(urlStr); } catch (e) { return reject(e); }
        const client = u.protocol === 'http:' ? http : https;
        const req = client.get(urlStr, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Claudia build-html.js; +https://github.com/mindattic/Claudia)',
                'Accept': 'image/*,*/*;q=0.8',
            },
        }, (res) => {
            const status = res.statusCode || 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                return resolve(fetchUrl(new URL(res.headers.location, urlStr).href, (redirects || 0) + 1));
            }
            if (status !== 200) {
                res.resume();
                return reject(new Error('HTTP ' + status));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const ext = extensionFor(res.headers['content-type'], u.pathname);
                resolve({ buf, ext });
            });
            res.on('error', reject);
        });
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
    });
}

// Generated fallback when a URL is missing / fetch fails. Renders a tasteful
// 2-tone gradient + a wrapped version of the part name so the card is still
// readable even without the real photo.
function svgPlaceholder(partId, label) {
    const hue = (crypto.createHash('md5').update(partId).digest()[0] * 360 / 256) | 0;
    // Wrap the label into ~14-char lines so it fits the 4:3 card.
    const words = String(label || '').split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        if ((cur + ' ' + w).trim().length > 18) { if (cur) lines.push(cur); cur = w; }
        else { cur = (cur + ' ' + w).trim(); }
    }
    if (cur) lines.push(cur);
    const maxLines = 4;
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines) shown[maxLines - 1] = shown[maxLines - 1] + '...';
    const startY = 78 - ((shown.length - 1) * 11);
    const tspans = shown.map((line, i) =>
        `<tspan x="100" y="${startY + i * 22}">${escapeHtml(line)}</tspan>`
    ).join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},55%,55%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 35) % 360},55%,35%)"/>
    </linearGradient>
  </defs>
  <rect width="200" height="150" fill="url(#g)"/>
  <text fill="#fff" font-family="system-ui,sans-serif" font-size="14" font-weight="600" text-anchor="middle">${tspans}</text>
</svg>`;
    return { mime: 'image/svg+xml', b64: Buffer.from(svg, 'utf8').toString('base64') };
}

async function loadPartImage(partId, label) {
    // 1. Manual override - if config/images/<partId>.<ext> exists, use it as-is.
    //    Wins over remote URLs so the builder always has a way to lock in the
    //    exact image they want regardless of CDN flakiness.
    const localDir = path.join(configDir, 'images');
    if (fs.existsSync(localDir)) {
        const match = fs.readdirSync(localDir).find(f => path.parse(f).name === partId);
        if (match) {
            const ext = path.extname(match).toLowerCase();
            const buf = fs.readFileSync(path.join(localDir, match));
            return { mime: mimeFor(ext), b64: buf.toString('base64'), source: 'local' };
        }
    }

    const url = PART_IMAGE_URLS[partId];
    if (!url || flagNoImages) {
        return Object.assign({ source: 'placeholder' }, svgPlaceholder(partId, label));
    }

    ensureDir(imagesCache);
    const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
    const cachedGlob = fs.readdirSync(imagesCache).filter(f => f.startsWith(hash + '.'));

    if (!flagRefreshImages && cachedGlob.length) {
        const fname = cachedGlob[0];
        const ext = path.extname(fname);
        const buf = fs.readFileSync(path.join(imagesCache, fname));
        return { mime: mimeFor(ext), b64: buf.toString('base64'), source: 'cache' };
    }

    try {
        const { buf, ext } = await fetchUrl(url);
        const target = path.join(imagesCache, hash + ext);
        fs.writeFileSync(target, buf);
        return { mime: mimeFor(ext), b64: buf.toString('base64'), source: 'fetch' };
    } catch (e) {
        process.stderr.write('  ! image fetch failed for ' + partId + ' (' + e.message + ') — using placeholder\n');
        process.stderr.write('    tip: drop an image at config/images/' + partId + '.{jpg,png,webp,svg} to override.\n');
        return Object.assign({ source: 'placeholder' }, svgPlaceholder(partId, label));
    }
}

function readParts() {
    if (!fs.existsSync(partsJsonPath)) return null;
    try { return JSON.parse(fs.readFileSync(partsJsonPath, 'utf8')); }
    catch (e) { process.stderr.write('  ! parts.json invalid: ' + e.message + '\n'); return null; }
}

// ──────────────────────────────────────────────────────────────────────
// Main build
// ──────────────────────────────────────────────────────────────────────
async function build(srcPath) {
    if (!fs.existsSync(srcPath)) throw new Error('Source not found: ' + srcPath);
    const md   = fs.readFileSync(srcPath, 'utf8');
    const title = extractTitle(md);
    const body  = marked.parse(md, { renderer });
    const toc   = buildToc(md);

    // Build gallery + per-part CSS rules.
    const parts = readParts();
    let galleryHtml = '';
    let imageCss    = '';
    if (parts && parts.parts && parts.parts.length) {
        const loaded = await Promise.all(parts.parts.map(async (p) => {
            const img = await loadPartImage(p.id, p.name);
            return { p, img };
        }));
        const cssRules = loaded.map(({ p, img }) => {
            return `.part-card[data-pid="${p.id}"] .part-image { background-image: url("data:${img.mime};base64,${img.b64}"); }`;
        });
        imageCss = cssRules.join('\n');

        const grouped = {};
        for (const { p, img } of loaded) {
            (grouped[p.category] = grouped[p.category] || []).push({ p, img });
        }
        const categoryLabels = parts.categories || {};
        const sections = Object.keys(grouped).map(cat => {
            const cards = grouped[cat].map(({ p }) => {
                const chosen = parts.chosen && parts.chosen[p.id];
                const primary = chosen || (p.tiers && p.tiers[0] && p.tiers[0].url) || p.searchFor || '#';
                const note = p.note ? `<div class="part-note">${escapeHtml(p.note)}</div>` : '';
                return `<a class="part-card" data-pid="${p.id}" href="${escapeHtml(primary)}" target="_blank" rel="noopener noreferrer">
        <div class="part-image" aria-hidden="true"></div>
        <div class="part-body">
          <div class="part-name">${escapeHtml(p.name)}</div>
          ${note}
        </div>
      </a>`;
            }).join('\n');
            const heading = categoryLabels[cat] || cat;
            return `<h3 id="gallery-${cat}">${escapeHtml(cat)} <span class="part-cat-blurb">— ${escapeHtml(heading)}</span></h3>
<div class="parts-grid">
${cards}
</div>`;
        }).join('\n');
        galleryHtml = `<section id="parts-gallery" aria-labelledby="parts-gallery-h">
<h2 id="parts-gallery-h">Parts gallery</h2>
<p>Images are embedded as base64 data URIs — this section works offline. Click a card to jump to the best-known buy URL (chosen via <code>find-deals</code> if you've picked one, otherwise the Amazon tier).</p>
${sections}
</section>`;
    }

    const dstPath = srcPath.replace(/\.md$/i, '.htm');
    const html = renderTemplate({
        title, body, toc, galleryHtml, imageCss,
        sourceName: path.basename(srcPath),
    });
    fs.writeFileSync(dstPath, html, 'utf8');
    return dstPath;
}

function renderTemplate({ title, body, toc, galleryHtml, imageCss, sourceName }) {
    return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Claudia build-html.js — generated from ${escapeHtml(sourceName)}">
<title>${escapeHtml(title)}</title>
<style>
/* ──────────────────────────────────────────────────────────────────────
   §  THEME TOKENS
   ────────────────────────────────────────────────────────────────────── */
:root {
  --bg: #fff;
  --bg2: #f8f9fb;
  --bg3: #f0f2f5;
  --border: #e2e6ea;
  --accent: #1b4f8c;
  --accent2: #2563b0;
  --text: #1a1a2e;
  --text2: #4a5568;
  --text3: #718096;
  --rule: #2c5f8a;
  --code-bg: #f4f6f8;
  --code-fg: #1a1a2e;
  --pre-bg: #0f1419;
  --pre-fg: #e8eaf0;
  --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 8px rgba(15, 23, 42, 0.06);
}
[data-theme="dark"] {
  --bg: #0b0d12;
  --bg2: #13161b;
  --bg3: #1a1e25;
  --border: #2a2f3a;
  --accent: #6ba3e8;
  --accent2: #90bbf0;
  --text: #e8eaf0;
  --text2: #9aa0b0;
  --text3: #5c6275;
  --rule: #3d6fa3;
  --code-bg: #1a1e25;
  --code-fg: #e8eaf0;
  --pre-bg: #0f1419;
  --pre-fg: #e8eaf0;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.5);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0b0d12;
    --bg2: #13161b;
    --bg3: #1a1e25;
    --border: #2a2f3a;
    --accent: #6ba3e8;
    --accent2: #90bbf0;
    --text: #e8eaf0;
    --text2: #9aa0b0;
    --text3: #5c6275;
    --rule: #3d6fa3;
    --code-bg: #1a1e25;
    --code-fg: #e8eaf0;
    --pre-bg: #0f1419;
    --pre-fg: #e8eaf0;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.5);
  }
}

/* ──────────────────────────────────────────────────────────────────────
   §  RESET + TYPOGRAPHY
   ────────────────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 17px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  transition: background-color 0.3s ease, color 0.3s ease;
}
a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent2); text-decoration: underline; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }

.skip-link {
  position: absolute;
  left: -9999px; top: 0;
  background: var(--accent); color: #fff;
  padding: 8px 14px; z-index: 200;
}
.skip-link:focus { left: 16px; top: 16px; }

main.page {
  max-width: 880px;
  margin: 0 auto;
  padding: 56px 28px 96px;
}
/* TOC only appears when there's enough natural left margin to host it
   without overlapping the centered column — (viewport - 880) / 2 > 240
   → viewport > 1360. Below that, the page is just the centered article. */
@media (min-width: 1360px) {
  .toc { display: block; }
}

/* ──────────────────────────────────────────────────────────────────────
   §  HEADINGS / BODY / CODE / TABLES
   ────────────────────────────────────────────────────────────────────── */
h1, h2, h3, h4 { color: var(--text); font-weight: 700; line-height: 1.2; margin: 1.75em 0 0.55em; letter-spacing: -0.01em; }
h1 { font-size: 2.15em; margin-top: 0; border-bottom: 2px solid var(--rule); padding-bottom: 0.35em; }
h2 { font-size: 1.55em; border-bottom: 1px solid var(--border); padding-bottom: 0.25em; }
h3 { font-size: 1.22em; }
h4 { font-size: 1.05em; color: var(--text2); }
.heading-anchor { margin-left: 0.4em; color: var(--text3); font-weight: 400; opacity: 0; transition: opacity 0.15s; }
h2:hover .heading-anchor, h3:hover .heading-anchor, h4:hover .heading-anchor { opacity: 1; }

p { margin: 0 0 1em; }
strong { color: var(--text); }
em { color: var(--text2); }
hr { border: none; border-top: 1px solid var(--border); margin: 2.5em 0; }
ul, ol { padding-left: 1.5em; margin: 0 0 1.2em; }
li { margin: 0.25em 0; }
blockquote {
  margin: 1em 0; padding: 0.5em 1.1em;
  border-left: 4px solid var(--accent);
  background: var(--bg2); color: var(--text2);
  border-radius: 0 4px 4px 0;
}
blockquote p:last-child { margin-bottom: 0; }

code, kbd, pre, samp { font-family: ui-monospace, 'JetBrains Mono', 'Cascadia Code', Menlo, Consolas, 'Liberation Mono', monospace; font-size: 0.92em; }
:not(pre) > code {
  background: var(--code-bg); color: var(--code-fg);
  padding: 0.15em 0.4em; border-radius: 3px;
  border: 1px solid var(--border); white-space: nowrap;
}
pre {
  background: var(--pre-bg); color: var(--pre-fg);
  padding: 16px 18px; border-radius: 8px; overflow-x: auto;
  border: 1px solid var(--border); box-shadow: var(--shadow); line-height: 1.55;
}
pre code { background: transparent; padding: 0; border: 0; white-space: pre; color: inherit; }

.hljs { color: #e8eaf0; }
.hljs-comment, .hljs-quote { color: #7d8590; font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-name, .hljs-tag { color: #ff7b72; }
.hljs-string, .hljs-title, .hljs-section, .hljs-attribute, .hljs-literal, .hljs-template-tag, .hljs-template-variable, .hljs-type, .hljs-addition { color: #a5d6ff; }
.hljs-number, .hljs-symbol, .hljs-bullet, .hljs-meta, .hljs-link { color: #79c0ff; }
.hljs-variable, .hljs-class .hljs-title, .hljs-title.class_, .hljs-attr { color: #ffa657; }
.hljs-function .hljs-title, .hljs-title.function_ { color: #d2a8ff; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 700; }

table { width: 100%; border-collapse: collapse; margin: 1.2em 0; font-size: 0.95em; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
th { background: var(--bg2); font-weight: 600; color: var(--text); border-bottom: 2px solid var(--rule); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--bg2); }

img { max-width: 100%; height: auto; border-radius: 6px; }

/* ──────────────────────────────────────────────────────────────────────
   §  TOC
   ────────────────────────────────────────────────────────────────────── */
.toc {
  display: none;
  position: fixed; top: 56px;
  left: max(16px, calc((100vw - 880px) / 2 - 240px));
  width: 220px; max-height: calc(100vh - 96px); overflow-y: auto;
  font-size: 0.88em; color: var(--text2);
  padding: 12px 14px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--bg2);
  box-shadow: var(--shadow);
}
.toc-title { font-weight: 700; font-size: 0.85em; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); margin-bottom: 8px; }
.toc ol { list-style: none; padding: 0; margin: 0; counter-reset: toc; }
.toc li { margin: 4px 0; counter-increment: toc; }
.toc li::before { content: counter(toc) "."; color: var(--text3); margin-right: 6px; font-variant-numeric: tabular-nums; }
.toc a { color: var(--text2); }
.toc a:hover { color: var(--accent); }

/* ──────────────────────────────────────────────────────────────────────
   §  THEME TOGGLE
   ────────────────────────────────────────────────────────────────────── */
#theme-toggle {
  position: fixed; top: 16px; right: 16px; z-index: 100;
  background: var(--bg2); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text2); cursor: pointer;
  font-size: 18px; line-height: 1; padding: 9px 11px;
  transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.2s;
  box-shadow: var(--shadow);
}
#theme-toggle:hover { background: var(--bg3); border-color: var(--accent); color: var(--accent); }
#theme-toggle:active { transform: scale(0.96); }
#theme-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* ──────────────────────────────────────────────────────────────────────
   §  PARTS GALLERY (image embedding lives in the rules generated below)
   ────────────────────────────────────────────────────────────────────── */
#parts-gallery h3 { margin-top: 1.6em; }
.part-cat-blurb { color: var(--text3); font-weight: 400; font-size: 0.8em; }
.parts-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  margin: 0.8em 0 2em;
}
.part-card {
  display: flex; flex-direction: column;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s;
  box-shadow: var(--shadow);
}
.part-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  text-decoration: none;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10);
}
.part-image {
  width: 100%;
  aspect-ratio: 4 / 3;
  background-color: var(--bg3);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-bottom: 1px solid var(--border);
}
.part-body { padding: 10px 12px 14px; }
.part-name { font-weight: 600; color: var(--text); font-size: 0.95em; line-height: 1.3; }
.part-note { color: var(--text2); font-size: 0.82em; margin-top: 4px; line-height: 1.4; }

/* Per-part image data URIs (generated). */
${imageCss}

/* ──────────────────────────────────────────────────────────────────────
   §  FOOTER + PRINT
   ────────────────────────────────────────────────────────────────────── */
.page-footer {
  margin-top: 4em; padding-top: 1.5em;
  border-top: 1px solid var(--border);
  color: var(--text3); font-size: 0.88em; text-align: center;
}
@media print {
  #theme-toggle, .toc, .skip-link, .heading-anchor { display: none !important; }
  body { background: #fff; color: #111; font-size: 11pt; }
  main.page { padding: 0; max-width: none; }
  pre { background: #f5f5f5; color: #111; border: 1px solid #ddd; }
  :not(pre) > code { background: #f5f5f5; color: #111; }
  a { color: #111; text-decoration: underline; }
  table, tr, td, th { background: #fff !important; color: #111 !important; }
  .part-card { break-inside: avoid; }
}
</style>
</head>
<body>

<a class="skip-link" href="#main-content">Skip to main content</a>

<button id="theme-toggle" type="button" title="Toggle theme" aria-label="Toggle light/dark theme" aria-pressed="false"><span aria-hidden="true">&#x2600;</span></button>

${toc}

<main class="page" id="main-content">
${body}
${galleryHtml}
<footer class="page-footer">Generated by Claudia <code>build-html.js</code> from <code>${escapeHtml(sourceName)}</code></footer>
</main>

<script>
(function () {
  var btn  = document.getElementById('theme-toggle');
  var html = document.documentElement;
  function isDark() { return html.getAttribute('data-theme') === 'dark'; }
  function setBtnIcon(dark) {
    var icon = btn.querySelector('span') || btn;
    icon.textContent = dark ? '\\u263E' : '\\u2600';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  var saved = null;
  try { saved = localStorage.getItem('claudia-theme'); } catch (_) {}
  var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var startDark = saved ? (saved === 'dark') : !!systemDark;
  html.setAttribute('data-theme', startDark ? 'dark' : 'light');
  setBtnIcon(startDark);
  btn.addEventListener('click', function () {
    var dark = !isDark();
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    setBtnIcon(dark);
    try { localStorage.setItem('claudia-theme', dark ? 'dark' : 'light'); } catch (_) {}
  });
  if (window.matchMedia && !saved) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) {
      try { if (localStorage.getItem('claudia-theme')) return; } catch (_) {}
      html.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      setBtnIcon(e.matches);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}());
</script>

</body>
</html>
`;
}

(async () => {
    try {
        const src = pickSource();
        process.stderr.write('-> Source: ' + path.basename(src) + '\n');
        if (flagNoImages)      process.stderr.write('   (--no-images: skipping image embed)\n');
        if (flagRefreshImages) process.stderr.write('   (--refresh-images: re-downloading)\n');
        const out = await build(src);
        const size = fs.statSync(out).size;
        console.log('OK  Wrote ' + path.basename(out) + ' (' + size.toLocaleString() + ' bytes)');
    } catch (err) {
        console.error('build-html: ' + err.message);
        process.exit(1);
    }
})();
