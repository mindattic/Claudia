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
                // Per-part spec table. Keys/values are author-controlled in
                // parts.json so each part can list whatever's load-bearing for
                // identification (SKU, chipset, interface, max load, etc.).
                const specsHtml = (Array.isArray(p.specs) && p.specs.length)
                    ? `<dl class="part-specs">${p.specs.map(s => (
                        `<dt>${escapeHtml(s.label)}</dt><dd>${escapeHtml(s.value)}</dd>`
                    )).join('')}</dl>`
                    : '';
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
.part-body { padding: 14px 14px 16px; }
.part-name { font-weight: 600; color: var(--text); font-size: 0.95em; line-height: 1.3; }
.part-price { color: var(--accent); font-weight: 600; font-size: 0.95em; margin-top: 6px; font-variant-numeric: tabular-nums; }
.part-note { color: var(--text2); font-size: 0.82em; margin-top: 8px; line-height: 1.4; }

.part-specs {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 3px 10px;
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 0.78em;
  line-height: 1.4;
}
.part-specs > dt {
  color: var(--text3);
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.part-specs > dd { color: var(--text2); margin: 0; }

.part-links {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 10px;
}
.part-links-label {
  font-size: 0.74em;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text3);
  margin-bottom: 2px;
}
.part-link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.88em;
  line-height: 1.45;
}
.part-link:hover { text-decoration: underline; }

.part-image {
  width: 100%;
  aspect-ratio: 4 / 3;
  background-color: var(--bg3);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-bottom: 1px solid var(--border);
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
