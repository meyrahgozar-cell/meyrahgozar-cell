/* Rich text: allow-list sanitising and small editing helpers. */

const ALLOWED = new Set(['P','BR','STRONG','B','EM','I','U','S','H2','H3','BLOCKQUOTE','UL','OL','LI','A','HR','CODE','PRE','DIV']);
const VOID = new Set(['BR','HR','IMG']);
const DROP = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','FORM','INPUT','BUTTON','SVG','MATH']);

/** Strip everything that is not in the allow-list. Returns safe HTML. */
export function sanitizeHtml(input) {
  const doc = new DOMParser().parseFromString(`<body>${String(input || '')}</body>`, 'text/html');
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 3) return; // text is fine
      if (child.nodeType !== 1) { child.remove?.(); return; }
      const tag = child.tagName;
      if (DROP.has(tag)) { child.remove(); return; }

      walk(child);

      if (!ALLOWED.has(tag)) {
        const parent = child.parentNode;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        child.remove();
        return;
      }

      Array.from(child.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (tag === 'A' && name === 'href') {
          const href = String(attr.value || '').trim();
          if (/^(https?:|mailto:)/i.test(href)) {
            child.setAttribute('href', href);
            child.setAttribute('rel', 'noopener noreferrer nofollow');
            child.setAttribute('target', '_blank');
          } else child.removeAttribute('href');
          return;
        }
        child.removeAttribute(attr.name);
      });

      if (tag === 'DIV') {
        const p = doc.createElement('p');
        while (child.firstChild) p.appendChild(child.firstChild);
        child.replaceWith(p);
      }
      if (VOID.has(tag) && tag !== 'BR' && tag !== 'HR') child.remove();
    });
  };
  walk(doc.body);
  return doc.body.innerHTML.replace(/\s+$/, '');
}

export function htmlToText(input) {
  const div = document.createElement('div');
  div.innerHTML = String(input || '')
    .replace(/<\/(p|div|h\d|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export function normalizePastedHtml(rawHtml, plainText) {
  // Prefer plain text on paste: keeps the record clean and predictable.
  if (plainText) {
    return plainText
      .split(/\n{2,}/)
      .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }
  return sanitizeHtml(rawHtml);
}

export function isEditorEmpty(html) {
  return !htmlToText(html).trim();
}

export function applyCommand(command, value = null) {
  try {
    document.execCommand(command, false, value);
    return true;
  } catch { return false; }
}

export function activeCommands() {
  const out = {};
  ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].forEach((c) => {
    try { out[c] = document.queryCommandState(c); } catch { out[c] = false; }
  });
  try {
    const block = document.queryCommandValue('formatBlock');
    out.block = String(block || '').toLowerCase();
  } catch { out.block = ''; }
  return out;
}

export function insertHtmlAtCursor(html) {
  document.execCommand('insertHTML', false, html);
}

export function selectionInside(editor) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  return editor.contains(sel.anchorNode);
}
