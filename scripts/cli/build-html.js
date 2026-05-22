#!/usr/bin/env node
/*
 * build-html.js — render Claudia.md to a self-contained Claudia.htm.
 *
 * Output is ONE file. No CDN. No <link>. No <script src>. Inlined CSS and
 * inlined JS, modeled on mindattic.com's single-file design convention with a
 * light/dark theme toggle.
 *
 * The filename is stable — the revision date lives inside the file (in the H1
 * and footer), not in the filename, so external links never rot.
 *
 * Usage:
 *   node scripts/cli/build-html.js [source.md]
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const { marked } = require('marked');
const hljs  = require('highlight.js');

const repoRoot         = path.resolve(__dirname, '..', '..');
const configDir        = path.join(repoRoot, 'config');
const partsJsonPath    = path.join(configDir, 'parts.json');
const versionsJsonPath = path.join(configDir, 'versions.json');

const argv = process.argv.slice(2);
const sourceArg = argv.find(a => !a.startsWith('--'));

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
    // Stable filename - the date lives inside the file, not in the name,
    // so links to /Claudia.htm always resolve to the latest revision.
    const p = path.join(repoRoot, 'Claudia.md');
    if (!fs.existsSync(p)) throw new Error('Claudia.md not found in ' + repoRoot);
    return p;
}

function buildToc(md) {
    const lines = md.split(/\r?\n/);
    const items = [];
    let inFence = false;
    for (const line of lines) {
        if (/^```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;
        // H1 first (only one expected), then every H2.
        let m = line.match(/^#\s+(.+?)\s*$/);
        if (m) { items.push({ title: m[1].trim(), id: null }); continue; }
        m = line.match(/^##\s+(.+?)\s*$/);
        if (m) items.push({ title: m[1].trim(), id: null });
    }
    if (!items.length) return '';
    const lis = items.map(it => {
        const href = it.id || slugify(it.title);
        return `<li><a href="#${href}">${escapeHtml(it.title)}</a></li>`;
    }).join('\n');
    return `<nav class="toc" aria-label="Table of contents"><div class="toc-title">Contents</div><ol>${lis}</ol></nav>`;
}

function extractTitle(md) {
    const m = md.match(/^\s*#\s+(.+?)\s*$/m);
    return m ? m[1].trim() : 'Claudia';
}

function readParts() {
    if (!fs.existsSync(partsJsonPath)) return null;
    try { return JSON.parse(fs.readFileSync(partsJsonPath, 'utf8')); }
    catch (e) { process.stderr.write('  ! parts.json invalid: ' + e.message + '\n'); return null; }
}

function readVersions() {
    if (!fs.existsSync(versionsJsonPath)) return {};
    try { return JSON.parse(fs.readFileSync(versionsJsonPath, 'utf8')); }
    catch (e) { process.stderr.write('  ! versions.json invalid: ' + e.message + '\n'); return {}; }
}

// Substitute compile-time placeholders of the form {{KEY}} using values from
// config/versions.json. Skips meta keys (those starting with "_" and the
// "versionsAsOf" tracker). Unknown placeholders are left as-is so the build
// log catches them visually.
function applyVersionSubstitutions(html, versions) {
    if (!versions) return html;
    return html.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (m, key) => {
        if (Object.prototype.hasOwnProperty.call(versions, key) && typeof versions[key] !== 'object') {
            return String(versions[key]);
        }
        return m;
    });
}

// Read a per-part image off the local filesystem, base64-encode it, and
// return a { mime, b64 } pair for inlining into CSS. Returns null if the
// part has no imageFile or the file is missing. We ONLY accept local paths
// (rooted at config/) — never remote URLs, since the CDN-rot lesson from
// the previous build code was that we can't trust them across years.
function loadPartImageLocal(part) {
    if (!part || !part.imageFile) return null;
    const rel = String(part.imageFile);
    // Reject anything that looks like a URL or path traversal.
    if (/^[a-z]+:\/\//i.test(rel) || rel.indexOf('..') !== -1) return null;
    const full = path.join(configDir, rel);
    if (!fs.existsSync(full)) {
        process.stderr.write('  ! image missing for ' + part.id + ': ' + rel + '\n');
        return null;
    }
    const ext = path.extname(full).toLowerCase();
    const mime = ({
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif':  'image/gif',
        '.svg':  'image/svg+xml',
    })[ext] || 'application/octet-stream';
    const buf = fs.readFileSync(full);
    return { mime, b64: buf.toString('base64') };
}

// ──────────────────────────────────────────────────────────────────────
// Interactive build configurator. Axes are kept in one place so the
// widget UI, the localStorage shape, and the conditional-block syntax
// all reference the same source of truth.
// ──────────────────────────────────────────────────────────────────────
const BUILD_CONFIG_AXES = [
    { key: 'battery', label: 'Battery / portability', default: 'no', options: [
        ['no',  'No - desktop, wall-powered'],
        ['yes', 'Yes - PiSugar 3 (portable)'],
    ]},
    { key: 'asr', label: 'Speech-to-text (ASR)', default: 'whisper-cpp', options: [
        ['whisper-cpp', 'Whisper (local, free)'],
        ['openai',      'OpenAI Whisper API (cloud, fast)'],
        ['google',      'Google STT (cloud)'],
    ]},
    { key: 'tts', label: 'Text-to-speech (TTS)', default: 'openai', options: [
        ['openai',     'OpenAI gpt-4o-mini-tts (recommended, native)'],
        ['elevenlabs', 'ElevenLabs (best quality, requires patch)'],
        ['piper',      'Piper (local, free, robotic)'],
    ]},
    { key: 'case', label: '3D-printed case', default: 'none', options: [
        ['none', 'No case'],
        ['fdm',  'FDM (filament) print'],
        ['sla',  'SLA (resin) print'],
    ]},
    { key: 'smarthome', label: 'Smart-home control', default: 'none', options: [
        ['none',   'None'],
        ['kasa',   'TP-Link Kasa (HS103/KP125M)'],
        ['shelly', 'Shelly Plug US'],
        ['sonoff', 'Sonoff S31 + Tasmota'],
    ]},
];

// Post-process the rendered HTML to convert
//   <!-- when: mic=sunfounder,xvf3800; battery=yes -->...<!-- end -->
// into
//   <div class="when" data-when-mic="sunfounder,xvf3800" data-when-battery="yes">...</div>
// The page-side JS hides any .when div whose attributes don't match the
// user's saved config. Comments survive marked unchanged (CommonMark
// passes HTML blocks through), so this runs on the rendered HTML.
function wrapConditionals(html) {
    return html.replace(
        /<!--\s*when:\s*([^>]+?)\s*-->([\s\S]*?)<!--\s*end\s*-->/g,
        (m, cond, body) => `<div class="when"${condToAttrs(cond)}>${body}</div>`
    );
}
function condToAttrs(cond) {
    return cond.split(';').map(c => c.trim()).filter(Boolean).map(c => {
        const m = c.match(/^([a-z][a-z0-9_-]*)\s*=\s*(.+)$/i);
        if (!m) return '';
        return ` data-when-${m[1].toLowerCase()}="${escapeHtml(m[2].trim())}"`;
    }).join('');
}
function partWhenAttrs(part) {
    if (!part || !part.when) return '';
    return Object.keys(part.when).map(k =>
        ` data-when-${k}="${escapeHtml(String(part.when[k]))}"`
    ).join('');
}

// Compute the union of when fields across every part in a category, so the
// category section (header + grid) hides itself when none of its members
// can possibly be visible. If any part is unrestricted (no `when`), the
// category is always shown.
function categoryWhenAttrs(parts) {
    if (!parts || !parts.length) return '';
    if (parts.some(p => !p.when || !Object.keys(p.when).length)) return '';
    const byKey = {};
    for (const p of parts) {
        for (const key of Object.keys(p.when)) {
            byKey[key] = byKey[key] || new Set();
            String(p.when[key]).split(',').map(s => s.trim()).filter(Boolean).forEach(v => byKey[key].add(v));
        }
    }
    return Object.keys(byKey).map(k =>
        ` data-when-${k}="${escapeHtml([...byKey[k]].join(','))}"`
    ).join('');
}
function buildConfigWidget() {
    // Emits inner content only - the parent <section> + H2 heading come from
    // the markdown ("## 02. Configure your build" + the marker line below).
    const rows = BUILD_CONFIG_AXES.map(a => {
        const opts = a.options.map(([v, lbl]) =>
            `<option value="${escapeHtml(v)}">${escapeHtml(lbl)}</option>`
        ).join('');
        return `<label class="config-row">
      <span class="config-label">${escapeHtml(a.label)}</span>
      <select data-config="${escapeHtml(a.key)}" aria-label="${escapeHtml(a.label)}">${opts}</select>
    </label>`;
    }).join('\n    ');
    return `<div class="config-widget" id="config-widget">
  <p>Pick what you have or plan to buy and the guide below adapts. Choices save automatically.</p>
  <div class="config-grid">
    ${rows}
  </div>
  <button type="button" class="config-reset" id="config-reset">Reset to defaults</button>
</div>`;
}

// ──────────────────────────────────────────────────────────────────────
// Main build
// ──────────────────────────────────────────────────────────────────────
function build(srcPath) {
    if (!fs.existsSync(srcPath)) throw new Error('Source not found: ' + srcPath);
    const md   = fs.readFileSync(srcPath, 'utf8');
    const title = extractTitle(md);
    let   body  = marked.parse(md, { renderer });
    body = wrapConditionals(body);
    body = applyVersionSubstitutions(body, readVersions());
    const toc   = buildToc(md);

    // Parts gallery — each card links to its Google Shopping search URL
    // (parts.json `searchFor`) and carries a numeric data-price so the
    // page JS can sum a live total over the visible cards. Per-part
    // data-when-* attrs let the page JS hide cards that don't apply to
    // the user's saved config.
    // Emits inner content only - the parent <section> + H2 ("## 03. Shopping
    // List") come from the markdown.
    const parts = readParts();
    let galleryHtml = '';
    const imageCssRules = [];
    if (parts && parts.parts && parts.parts.length) {
        const grouped = {};
        for (const p of parts.parts) {
            (grouped[p.category] = grouped[p.category] || []).push(p);
        }
        const categoryLabels = parts.categories || {};
        const sections = Object.keys(grouped).map(cat => {
            const cards = grouped[cat].map(p => {
                const note = p.note ? `<div class="part-note">${escapeHtml(p.note)}</div>` : '';
                const whenAttrs = partWhenAttrs(p);
                const priceAttr = (typeof p.price === 'number') ? ` data-price="${p.price}"` : '';
                const inTotalAttr = (p.inTotal === false) ? ' data-in-total="false"' : '';
                const priceHtml = (typeof p.price === 'number')
                    ? `<div class="part-price">~$${p.price}</div>`
                    : '';
                // Per-part spec table. We render into a single grid with four
                // columns (label · value · label · value) so labels in column 1
                // align by max-content across every row, and labels in column 3
                // align by max-content across every row. To get column-major
                // VISUAL flow (first half of specs reads top-to-bottom on the
                // left, second half top-to-bottom on the right) we interleave
                // the array here before emitting.
                let specsHtml = '';
                if (Array.isArray(p.specs) && p.specs.length) {
                    const half = Math.ceil(p.specs.length / 2);
                    const pairs = [];
                    for (let i = 0; i < half; i++) {
                        pairs.push(p.specs[i]);
                        if (p.specs[i + half]) pairs.push(p.specs[i + half]);
                    }
                    specsHtml = `<dl class="part-specs">${pairs.map(s => (
                        `<dt>${escapeHtml(s.label)}</dt><dd>${escapeHtml(s.value)}</dd>`
                    )).join('')}</dl>`;
                }
                const img = loadPartImageLocal(p);
                let imageDiv = '';
                let cls = whenAttrs ? 'part-card when' : 'part-card';
                if (img) {
                    cls += ' has-image';
                    imageCssRules.push(`.part-card[data-pid="${p.id}"] .part-image { background-image: url("data:${img.mime};base64,${img.b64}"); }`);
                    imageDiv = '<div class="part-image" aria-hidden="true"></div>';
                }
                // Vertical "Buy:" list on each card:
                //   Official       = first tier with tier == 'official'
                //   Google         = the searchFor URL (Google Shopping query)
                //   Reputable #N   = every tier with tier == 'reputable', numbered in order
                const officialTier   = (p.tiers || []).find(t => t.tier === 'official');
                const reputableTiers = (p.tiers || []).filter(t => t.tier === 'reputable');
                const linkRows = [];
                if (officialTier && officialTier.url) {
                    linkRows.push(`<a class="part-link" href="${escapeHtml(officialTier.url)}" target="_blank" rel="noopener noreferrer">Official</a>`);
                }
                if (p.searchFor) {
                    linkRows.push(`<a class="part-link" href="${escapeHtml(p.searchFor)}" target="_blank" rel="noopener noreferrer">Google</a>`);
                }
                reputableTiers.forEach((t, i) => {
                    if (t.url) {
                        linkRows.push(`<a class="part-link" href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer">Reputable #${i + 1}</a>`);
                    }
                });
                const linksHtml = linkRows.length
                    ? `<div class="part-links"><span class="part-links-label">Buy:</span>${linkRows.join('')}</div>`
                    : '';
                return `<div class="${cls}" data-pid="${p.id}"${whenAttrs}${priceAttr}${inTotalAttr}>
        ${imageDiv}
        <div class="part-body">
          <div class="part-name">${escapeHtml(p.name)}</div>
          ${priceHtml}
          ${specsHtml}
          ${linksHtml}
          ${note}
        </div>
      </div>`;
            }).join('\n');
            const heading = categoryLabels[cat] || cat;
            const catWhen = categoryWhenAttrs(grouped[cat]);
            const catCls = catWhen ? 'parts-category when' : 'parts-category';
            return `<div class="${catCls}"${catWhen}>
<h3 id="gallery-${cat}">${escapeHtml(cat)} <span class="part-cat-blurb">— ${escapeHtml(heading)}</span></h3>
<div class="parts-grid">
${cards}
</div>
</div>`;
        }).join('\n');
        const asOf = parts.pricesAsOf || '';
        const asOfHtml = asOf ? `<span class="parts-total-asof">prices estimated ${escapeHtml(asOf)}</span>` : '';
        galleryHtml = `<div class="parts-gallery-wrap" id="parts-gallery">
<p>Each card opens its Google Shopping search in a new tab so you can verify current prices. Cards that don't apply to your configuration are hidden, and the total below updates live.</p>
${sections}
<div class="parts-total" id="parts-total" aria-live="polite">
  <span class="parts-total-label">Your build estimate</span>
  <span class="parts-total-value" id="parts-total-value">~$0</span>
  ${asOfHtml}
</div>
</div>`;
    }

    // Substitute the gallery into the body where the author placed
    // <!-- PARTS-GALLERY --> (typically right after the intro). Fall back to
    // appending at the end if no marker is present.
    if (body.indexOf('<!-- PARTS-GALLERY -->') !== -1) {
        body = body.replace('<!-- PARTS-GALLERY -->', galleryHtml);
        galleryHtml = '';
    }
    // Same pattern for the Configure-your-build widget: lives in the body
    // wherever the author put the <!-- CONFIG-WIDGET --> marker.
    const widget = buildConfigWidget();
    let inlineWidget = '';
    if (body.indexOf('<!-- CONFIG-WIDGET -->') !== -1) {
        body = body.replace('<!-- CONFIG-WIDGET -->', widget);
    } else {
        inlineWidget = widget;  // legacy: fall back to top-of-main if no marker
    }

    const dstPath = srcPath.replace(/\.md$/i, '.htm');
    const html = renderTemplate({
        title, body, toc, galleryHtml,
        configWidget: inlineWidget,
        configAxesJson: JSON.stringify(BUILD_CONFIG_AXES.map(a => ({ key: a.key, default: a.default }))),
        imageCss: imageCssRules.join('\n'),
        sourceName: path.basename(srcPath),
    });
    fs.writeFileSync(dstPath, html, 'utf8');
    return dstPath;
}

function renderTemplate({ title, body, toc, galleryHtml, configWidget, configAxesJson, imageCss, sourceName }) {
    return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Claudia build-html.js — generated from ${escapeHtml(sourceName)}">
<title>${escapeHtml(title)}</title>
<style>
/* == BEGIN MINDATTIC.COMPONENTS:OUTFITFONT.CSS == */
/* Generated by MindAttic.Components/sync/sync-claudia.ps1. Do not edit by hand.
   Edit MindAttic.Components/subscribers.json and the matching component folder, then re-run the sync. */
@font-face {
  font-family: 'Outfit';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('data:font/woff2;base64,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') format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Outfit';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('data:font/woff2;base64,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') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

/* CSS custom property for ergonomic reuse. Subscribers can write
   "font-family: var(--font-outfit);" instead of repeating the full
   "'Outfit', system-ui, sans-serif" stack. Bare "font-family: Outfit;"
   (no quotes, no fallback) is a common gotcha that fails silently;
   the variable or the full stack are the reliable forms. */
:root { --font-outfit: 'Outfit', system-ui, sans-serif; }

/* applyToSelector for this subscriber */
html, body { font-family: 'Outfit', system-ui, sans-serif; }

/* == END MINDATTIC.COMPONENTS:OUTFITFONT.CSS == */

/* == BEGIN MINDATTIC.COMPONENTS:ATTICFONT.CSS == */
/* Generated by MindAttic.Components/sync/sync-claudia.ps1. Do not edit by hand.
   Edit MindAttic.Components/subscribers.json and the matching component folder, then re-run the sync. */
@font-face {
  font-family: 'Attic';
  src: url("data:font/woff2;base64,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") format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

/* CSS custom property for ergonomic reuse. Subscribers can write
   "font-family: var(--font-attic);" instead of repeating the full
   "'Attic', serif" stack. Bare "font-family: Attic;" is a common
   gotcha that fails silently; the variable or the full stack are
   the reliable forms. */
:root { --font-attic: 'Attic', serif; }

/* applyToSelector for this subscriber */
#claudia { font-family: 'Attic', serif; }

/* == END MINDATTIC.COMPONENTS:ATTICFONT.CSS == */

/* == BEGIN MINDATTIC.COMPONENTS:BACKHOMEM.CSS == */
/* Generated by MindAttic.Components/sync/sync-claudia.ps1. Do not edit by hand.
   Edit MindAttic.Components/subscribers.json and the matching component folder, then re-run the sync. */
/* ====================================================================
 * MindAttic.Components - BackHomeM/back-home-m.css
 * A capital "M" in AtticFont pinned to the upper-left of the viewport,
 * linking back to mindattic.com. Hosts opt in by adding an anchor of the
 * form <a class="back-home-m" href="https://mindattic.com">M</a> anywhere
 * inside the body. Requires AtticFont/ (the Attic @font-face) to also be
 * present in the subscriber.
 * Avoid backticks and dollar-brace sequences in this file -- it gets
 * spliced into the JS template literals of build-html-js subscribers
 * (Claudia, ChiMesh) where either would terminate or interpolate the literal.
 * Canonical source. DO NOT EDIT downstream copies - edit here and re-sync.
 * ==================================================================== */

.back-home-m {
    position: fixed;
    top: 5px;
    left: 5px;
    z-index: 9999;
    font-family: 'Attic', serif;
    font-size: 1.25rem;
    line-height: 1;
    color: inherit;
    text-decoration: none;
    opacity: 0.7;
    cursor: pointer;
    user-select: none;
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.back-home-m::before {
    content: '\\276E\\00a0M';
}

.back-home-m:hover,
.back-home-m:focus-visible {
    opacity: 1;
    transform: scale(1.1);
    text-decoration: none;
}

.back-home-m:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}

/* == END MINDATTIC.COMPONENTS:BACKHOMEM.CSS == */

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

/* Two-pane layout: sidebar + main each scroll independently, so the
   browser-level scrollbar is gone. The only visible scrollbar is on the
   side menu (styled to match the dark theme). On tablet/mobile we fall
   back to single-column with normal page scrolling. */
html, body { height: 100%; overflow: hidden; }

.layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 0;
  height: 100vh;
  padding: 0;
}
.layout > .sidebar {
  height: 100vh;
  overflow-y: auto;
  padding: 28px 14px 28px 28px;
  border-right: 1px solid var(--border);
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.layout > .sidebar::-webkit-scrollbar { width: 10px; }
.layout > .sidebar::-webkit-scrollbar-track { background: transparent; }
.layout > .sidebar::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.layout > .sidebar::-webkit-scrollbar-thumb:hover { background: var(--text3); background-clip: padding-box; border: 2px solid transparent; }

main.page {
  height: 100vh;
  overflow-y: auto;
  max-width: none;
  margin: 0;
  padding: 48px 64px 24px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
/* Prevent flex shrinking from squashing intrinsic-height children (<pre>,
   tables, images, code blocks). With main.page being a flex column AND
   height:100vh, flex would otherwise compress everything to fit; we want
   children to keep their natural size and the container to scroll instead. */
main.page > * { flex-shrink: 0; }
main.page::-webkit-scrollbar { width: 10px; }
main.page::-webkit-scrollbar-track { background: transparent; }
main.page::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
main.page::-webkit-scrollbar-thumb:hover { background: var(--text3); background-clip: padding-box; border: 2px solid transparent; }

@media (max-width: 1099px) {
  html, body { overflow: visible; height: auto; }
  .layout {
    grid-template-columns: 1fr;
    height: auto;
    padding: 56px 20px 96px;
  }
  .layout > .sidebar { display: none; }
  main.page { height: auto; overflow: visible; padding: 0; }
}
@media (max-width: 640px) {
  .layout { padding: 70px 16px 64px; }
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
hr { display: none; }
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
  padding: 16px 18px; border-radius: 8px;
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
   §  TOC (sticky sidebar on desktop, hidden on mobile)
   ────────────────────────────────────────────────────────────────────── */
.toc {
  position: absolute;
  top: 60px;
  font-size: 0.9em;
  color: var(--text2);
  padding: 14px 16px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg2);
  box-shadow: var(--shadow);
}
.toc-title {
  font-weight: 700;
  font-size: 0.78em;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text3);
  margin-bottom: 10px;
}
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { margin: 5px 0; }
.toc a {
  color: var(--text2);
  display: inline-block;
  padding: 2px 0;
  border-left: 2px solid transparent;
  padding-left: 0;
  transition: color 0.15s, padding-left 0.15s, border-color 0.15s;
}
.toc a:hover { color: var(--accent); text-decoration: none; }
.toc a.active {
  color: var(--accent);
  font-weight: 600;
}

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
   §  CONFIG WIDGET (interactive build picker)
   ────────────────────────────────────────────────────────────────────── */
.config-widget {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 22px 22px;
  margin: 0 0 2em;
  box-shadow: var(--shadow);
}
.config-widget h2 {
  margin: 0 0 4px;
  padding: 0;
  border: none;
  font-size: 1.18em;
  color: var(--accent);
}
.config-widget p {
  margin: 0 0 16px;
  color: var(--text2);
  font-size: 0.92em;
}
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px 16px;
  margin-bottom: 14px;
}
.config-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85em;
  color: var(--text2);
}
.config-label {
  font-weight: 600;
  font-size: 0.82em;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text3);
}
.config-row select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 0.95em;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.config-row select:hover { border-color: var(--accent); }
.config-row select:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(107, 163, 232, 0.25);
}
.config-reset {
  background: transparent;
  color: var(--text3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 0.82em;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.config-reset:hover { color: var(--accent); border-color: var(--accent); }

/* Conditional content blocks (auto-hidden when config doesn't match). */
.when[hidden] { display: none !important; }

/* ──────────────────────────────────────────────────────────────────────
   §  PARTS GALLERY (text-only cards — no image embedding)
   ────────────────────────────────────────────────────────────────────── */
#parts-gallery h3 { margin-top: 1.6em; }
.part-cat-blurb { color: var(--text3); font-weight: 400; font-size: 0.8em; }
.parts-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0.8em 0 2em;
}
.part-card {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.18s;
  box-shadow: var(--shadow);
}
.part-card:hover {
  text-decoration: none;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10);
}
.part-body {
  flex: 1 1 auto;
  min-width: 0;
  padding: 14px 18px 16px;
  display: flex;
  flex-direction: column;
}
.part-name { font-weight: 600; color: var(--text); font-size: 1em; line-height: 1.3; }
.part-price { color: var(--accent); font-weight: 600; font-size: 0.95em; margin-top: 4px; font-variant-numeric: tabular-nums; }
.part-note { color: var(--text2); font-size: 0.82em; margin-top: 10px; line-height: 1.45; font-style: italic; }

.part-specs {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content minmax(0, 1fr);
  gap: 6px 32px;
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 0.8em;
  line-height: 1.4;
}
.part-specs > dt {
  color: var(--text3);
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  margin: 0;
}
.part-specs > dd { color: var(--text2); margin: 0; }

.part-links {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
  margin-top: 12px;
}
.part-links-label {
  font-size: 0.74em;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text3);
}
.part-link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.88em;
  line-height: 1.45;
}
.part-link:hover { text-decoration: underline; }

.part-image {
  flex: 0 0 200px;
  align-self: stretch;
  min-height: 150px;
  background-color: white;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  border-right: 1px solid var(--border);
}

@media (max-width: 720px) {
  .part-card { flex-direction: column; }
  .part-image {
    flex: 0 0 auto;
    width: 100%;
    aspect-ratio: 4 / 3;
    min-height: 0;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .part-specs { grid-template-columns: max-content minmax(0, 1fr); }
}
${imageCss}

.parts-gallery-wrap { margin: 0.5em 0 0; }
.parts-total {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px 18px;
  margin: 1.4em 0 0.6em;
  padding: 18px 22px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.parts-total-label {
  font-size: 0.78em;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text3);
  font-weight: 700;
}
.parts-total-value {
  font-size: 1.6em;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.parts-total-asof {
  margin-left: auto;
  color: var(--text3);
  font-size: 0.82em;
  font-style: italic;
}

/* ──────────────────────────────────────────────────────────────────────
   §  FOOTER + PRINT
   ────────────────────────────────────────────────────────────────────── */
#site-footer.pin-when-short {
  margin-top: auto;
  padding: 28px 0 12px;
  border-top: 1px solid var(--border);
  color: var(--text3);
  font-size: 0.85em;
  text-align: center;
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

<a class="back-home-m" href="https://mindattic.com" aria-label="Back to mindattic.com" title="Back to mindattic.com">M</a>

<button id="theme-toggle" type="button" title="Toggle theme" aria-label="Toggle light/dark theme" aria-pressed="false"><span aria-hidden="true">&#x2600;</span></button>

<div class="layout">
  <aside class="sidebar" aria-label="Section navigation">
    ${toc}
  </aside>
  <main class="page" id="main-content">
${configWidget}
${body}
${galleryHtml}
<footer id="site-footer" class="pin-when-short" role="contentinfo">
  <span>&copy; <script>document.write(new Date().getFullYear())</script><noscript>2026</noscript> MindAttic LLC</span>
</footer>
  </main>
</div>

<script>
// ───────── Theme toggle ─────────
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
  if (saved !== 'dark' && saved !== 'light') {
    saved = 'dark';
    try { localStorage.setItem('claudia-theme', 'dark'); } catch (_) {}
  }
  var startDark = (saved === 'dark');
  html.setAttribute('data-theme', startDark ? 'dark' : 'light');
  setBtnIcon(startDark);
  btn.addEventListener('click', function () {
    var dark = !isDark();
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    setBtnIcon(dark);
    try { localStorage.setItem('claudia-theme', dark ? 'dark' : 'light'); } catch (_) {}
  });
}());

// ───────── Build configurator ─────────
// Each <select data-config="KEY"> drives a localStorage entry under
// "claudia-build-config". Any element with class "when" and one or more
// data-when-KEY="val1,val2,..." attributes is shown only when the saved
// config[KEY] is in that list (or, with a leading "!", NOT in it).
(function () {
  var AXES = ${configAxesJson};
  var SAVED_KEY = 'claudia-build-config';

  function loadConfig() {
    var cfg = {};
    AXES.forEach(function (a) { cfg[a.key] = a.default; });
    try {
      var raw = localStorage.getItem(SAVED_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        AXES.forEach(function (a) {
          if (parsed && Object.prototype.hasOwnProperty.call(parsed, a.key)) {
            cfg[a.key] = parsed[a.key];
          }
        });
      }
    } catch (_) {}
    return cfg;
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(cfg)); } catch (_) {}
  }
  function matches(attrValue, current) {
    var values = String(attrValue).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var positives = [], negatives = [];
    values.forEach(function (v) {
      if (v.charAt(0) === '!') negatives.push(v.slice(1));
      else positives.push(v);
    });
    if (positives.length && positives.indexOf(current) === -1) return false;
    if (negatives.length && negatives.indexOf(current) !== -1) return false;
    return true;
  }
  function applyVisibility(cfg) {
    var nodes = document.querySelectorAll('.when');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var visible = true;
      var attrs = el.attributes;
      for (var j = 0; j < attrs.length; j++) {
        var a = attrs[j];
        if (a.name.indexOf('data-when-') !== 0) continue;
        var key = a.name.slice('data-when-'.length);
        if (!Object.prototype.hasOwnProperty.call(cfg, key)) continue;
        if (!matches(a.value, cfg[key])) { visible = false; break; }
      }
      if (visible) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    }
    // Also hide TOC entries whose target heading is inside a hidden .when.
    var tocLinks = document.querySelectorAll('.toc a[href^="#"]');
    for (var k = 0; k < tocLinks.length; k++) {
      var link = tocLinks[k];
      var li = link.closest('li');
      if (!li) continue;
      var targetId = decodeURIComponent(link.getAttribute('href').slice(1));
      var target = document.getElementById(targetId);
      if (!target) continue;
      li.style.display = target.closest('.when[hidden]') ? 'none' : '';
    }
    // Recompute the visible-parts total. Sum data-price on every part-card
    // that is not hidden and is not marked data-in-total="false".
    var totalEl = document.getElementById('parts-total-value');
    if (totalEl) {
      var cards = document.querySelectorAll('.part-card[data-price]');
      var sum = 0;
      for (var m = 0; m < cards.length; m++) {
        var c = cards[m];
        if (c.hasAttribute('hidden')) continue;
        if (c.getAttribute('data-in-total') === 'false') continue;
        var v = parseFloat(c.getAttribute('data-price'));
        if (!isNaN(v)) sum += v;
      }
      totalEl.textContent = '~$' + sum;
    }
  }
  function hydrate(cfg) {
    AXES.forEach(function (a) {
      var sel = document.querySelector('select[data-config="' + a.key + '"]');
      if (!sel) return;
      sel.value = cfg[a.key];
      sel.addEventListener('change', function () {
        cfg[a.key] = sel.value;
        saveConfig(cfg);
        applyVisibility(cfg);
      });
    });
    var reset = document.getElementById('config-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        AXES.forEach(function (a) { cfg[a.key] = a.default; });
        saveConfig(cfg);
        AXES.forEach(function (a) {
          var sel = document.querySelector('select[data-config="' + a.key + '"]');
          if (sel) sel.value = cfg[a.key];
        });
        applyVisibility(cfg);
      });
    }
  }

  var cfg = loadConfig();
  // Persist defaults on first visit so the next load reads the same shape.
  try { if (!localStorage.getItem(SAVED_KEY)) saveConfig(cfg); } catch (_) {}
  hydrate(cfg);
  applyVisibility(cfg);
}());

// ───────── Scroll-spy: highlight the current TOC entry ─────────
(function () {
  var links = document.querySelectorAll('.toc a[href^="#"]');
  if (!links.length || !('IntersectionObserver' in window)) return;
  var byId = {};
  var targets = [];
  links.forEach(function (l) {
    var id = decodeURIComponent(l.getAttribute('href').slice(1));
    var el = document.getElementById(id);
    if (!el) return;
    byId[id] = l;
    targets.push(el);
  });
  if (!targets.length) return;
  var currentId = null;
  function setActive(id) {
    if (id === currentId) return;
    if (currentId && byId[currentId]) byId[currentId].classList.remove('active');
    currentId = id;
    if (currentId && byId[currentId]) byId[currentId].classList.add('active');
  }
  var visible = new Set();
  // Scrolling happens inside main.page on desktop (two-pane layout). Use
  // it as the IO root so rootMargin is calculated relative to the pane.
  // Fallback to the viewport on mobile (single-column, normal scrolling).
  var pageRoot = document.querySelector('main.page');
  var useRoot = pageRoot && window.matchMedia('(min-width: 1100px)').matches ? pageRoot : null;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) visible.add(e.target.id);
      else visible.delete(e.target.id);
    });
    if (!visible.size) return;
    var topId = null, topY = Infinity;
    visible.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var y = el.getBoundingClientRect().top;
      if (y < topY) { topY = y; topId = id; }
    });
    if (topId) setActive(topId);
  }, { root: useRoot, rootMargin: '-15% 0px -75% 0px' });
  targets.forEach(function (t) { io.observe(t); });
}());
</script>

</body>
</html>
`;
}

(function () {
    try {
        const src = pickSource();
        process.stderr.write('-> Source: ' + path.basename(src) + '\n');
        const out = build(src);
        const size = fs.statSync(out).size;
        console.log('OK  Wrote ' + path.basename(out) + ' (' + size.toLocaleString() + ' bytes)');
    } catch (err) {
        console.error('build-html: ' + err.message);
        process.exit(1);
    }
})();
