'use strict';

// Minimal Markdown -> HTML renderer, tuned for this repo's READMEs:
// headings, tables, fenced code, lists, blockquotes, hr, inline code/links/bold/italic/strikethrough.
// No dependencies. Exposes renderMarkdown and renderInline.

function escHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]
  ));
}

function renderInline(s) {
  s = escHtml(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<img src="$1" alt="$2">');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => `<a href="${url}">${txt}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s;
}

function splitRow(line) {
  const cells = line.split('|');
  while (cells.length > 1 && cells[0].trim() === '') cells.shift();
  while (cells.length > 1 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells;
}

function looksLikeSeparator(line) {
  if (!line || !line.includes('-')) return false;
  return splitRow(line).every((c) => /^:?-{1,}:?$/.test(c.trim()));
}

function renderTable(headerLine, sepLine, dataLines) {
  const headers = splitRow(headerLine);
  const aligns = splitRow(sepLine || '').map((c) => {
    const t = c.trim();
    if (t.startsWith(':') && t.endsWith(':')) return 'center';
    if (t.endsWith(':')) return 'right';
    return '';
  });
  const align = (i) => (aligns[i] ? ` style="text-align:${aligns[i]}"` : '');
  let out = '<table>\n<thead><tr>';
  headers.forEach((h, i) => { out += `<th${align(i)}>${renderInline(h.trim())}</th>`; });
  out += '</tr></thead>\n<tbody>\n';
  for (const l of dataLines) {
    let cells = splitRow(l);
    while (cells.length < headers.length) cells.push('');
    out += '<tr>';
    for (let i = 0; i < headers.length; i++) out += `<td${align(i)}>${renderInline(cells[i].trim())}</td>`;
    out += '</tr>\n';
  }
  out += '</tbody></table>\n';
  return out;
}

function isBlockStart(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/^([-*_])(\s*\1){2,}\s*$/.test(t)) return true;
  if (/^>\s?/.test(t)) return true;
  if (/^[-*+]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) return true;
  if (/^(```|~~~)/.test(t)) return true;
  return false;
}

function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // Fenced code block
    const fence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (fence) {
      i++;
      const buf = [];
      while (i < lines.length && !lines[i].trim().startsWith(fence[2])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      html += `<pre class="code">${escHtml(buf.join('\n'))}</pre>\n`;
      continue;
    }

    // Table
    if (trimmed.includes('|') && looksLikeSeparator(lines[i + 1])) {
      const header = trimmed;
      const sep = lines[i + 1];
      i = i + 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        rows.push(lines[i]);
        i++;
      }
      html += renderTable(header, sep, rows);
      continue;
    }

    // Heading
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      html += `<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>\n`;
      i++;
      continue;
    }

    // Horizontal rule
    if (/^([-*_])(\s*\1){2,}\s*$/.test(trimmed)) { html += '<hr>\n'; i++; continue; }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      html += `<blockquote>${renderInline(buf.join('<br>'))}</blockquote>\n`;
      continue;
    }

    // List (flat items only)
    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^[-*+]\s+(.*)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      html += `<ul>\n${items.map((x) => `<li>${renderInline(x)}</li>`).join('\n')}\n</ul>\n`;
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^\d+[.)]\s+(.*)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      html += `<ol>\n${items.map((x) => `<li>${renderInline(x)}</li>`).join('\n')}\n</ol>\n`;
      continue;
    }

    // Paragraph
    const buf = [trimmed];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      if (lines[i].includes('|') && looksLikeSeparator(lines[i + 1])) break;
      buf.push(lines[i].trim());
      i++;
    }
    html += `<p>${renderInline(buf.join(' '))}</p>\n`;
  }

  return html;
}

if (typeof window !== 'undefined') window.renderMarkdown = renderMarkdown;
if (typeof module !== 'undefined' && module.exports) module.exports = { renderMarkdown, renderInline };