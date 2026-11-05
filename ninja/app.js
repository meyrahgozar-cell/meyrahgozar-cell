/* ══════════════════════════════════════════════════════════════
   NINJA FILE MANAGER — application logic
   ══════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const $ = id => document.getElementById(id);

/* ── persisted preferences ─────────────────────────────────── */
const PREF_KEY = {
    accent: 'fm_accent', view: 'fm_view2', sort: 'fm_sort',
    formatted: 'fm_formatted', hideGitkeep: 'fm_hide_gitkeep',
};
const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
    raw(k) { try { return localStorage.getItem(k); } catch { return null; } },
    rawSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const prefs = {
    accent: store.get(PREF_KEY.accent, 'cyan'),
    view: store.get(PREF_KEY.view, 'list'),
    sort: store.get(PREF_KEY.sort, 'name-asc'),
    formatted: store.get(PREF_KEY.formatted, false),
    hideGitkeep: store.get(PREF_KEY.hideGitkeep, true),
};
function savePref(key, value) {
    prefs[key] = value;
    store.set(PREF_KEY[key], value);
}

const state = {
    owner: 'meyrahgozar-cell',
    repo: 'meyrahgozar-cell',
    token: '',
    path: '',
    branch: 'master',
    connected: false,
    items: [],
    query: '',
    deepSearch: false,
};

let editorFile = null;
let cm = null;
let ctx = null;
let loadSeq = 0;
let deepSeq = 0;
let selectionAnchor = null;
let selectMode = false;
let clipboard = null;
let displayed = [];
let viewIndex = new Map();
let lastDeletion = null;
let pathCache = null;
let pendingPath = null;

const selection = new Set();

/* ── DOM references ────────────────────────────────────────── */
const sidebar = $('sidebar'), scrim = $('scrim');
const repoInput = $('repo'), tokenInput = $('token'), statusEl = $('status');
const connectBtn = $('connectBtn'), disconnectBtn = $('disconnectBtn'), tokenToggle = $('tokenToggle');
const repoCard = $('repoCard'), repoIcon = $('repoIcon'), repoName = $('repoName'), repoMeta = $('repoMeta'), repoLink = $('repoLink');
const branchWrap = $('branchWrap'), branchSelect = $('branchSelect'), branchLabel = $('branchLabel');
const pathEl = $('path'), jumpInput = $('jumpInput');
const filesEl = $('files'), contentEl = $('content');
const searchInput = $('searchInput'), searchClear = $('searchClear'), deepSearchBtn = $('deepSearchBtn');
const sortSelect = $('sortSelect'), viewGrid = $('viewGrid'), viewList = $('viewList');
const selectBtn = $('selectBtn'), formattedBtn = $('formattedBtn');
const optHideGitkeep = $('optHideGitkeep');
const statFiles = $('statFiles'), statFolders = $('statFolders'), statSize = $('statSize'), statSel = $('statSel');
const sbItems = $('sbItems'), sbFilter = $('sbFilter'), sbClip = $('sbClip'), sbSel = $('sbSel');
const clipCard = $('clipCard'), clipMode = $('clipMode'), clipText = $('clipText');
const selectionBar = $('selectionBar'), selCount = $('selCount');
const contextMenu = $('contextMenu'), ctxTitle = $('ctxTitle');
const upPanel = $('uploadPanel'), upList = $('upList'), upTitle = $('upTitle'), upSummary = $('upSummary');
const upBar = $('upBar'), upOverall = $('upOverall'), upRetry = $('upRetry');
const edOverlay = $('editorOverlay'), edIcon = $('edIcon'), edFileName = $('edFileName'), edFilePath = $('edFilePath');
const edStatus = $('edStatus'), edBody = $('edBody'), edLines = $('edLines'), edSize = $('edSize'), edSave = $('edSave');
const toastsEl = $('toasts');
const fileInput = $('fileInput'), folderInput = $('folderInput'), zipInput = $('zipInput'), replaceInput = $('replaceInput');

/* ── tiny helpers ──────────────────────────────────────────── */
const escapeHtml = str => String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function extOf(name) {
    if (!name || !name.includes('.')) return '';
    return name.split('.').pop().toLowerCase();
}

function formatSize(bytes) {
    if (bytes == null || bytes === 0) return '0 B';
    if (bytes < 1024) return Math.round(bytes) + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const joinPath = (...parts) => parts.filter(Boolean).join('/');

function normalizeRel(value) {
    return String(value || '')
        .replace(/\\/g, '/')
        .split('/')
        .map(seg => seg.trim())
        .filter(seg => seg && seg !== '.' && seg !== '..')
        .join('/');
}

function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function decodeBase64UTF8(b64) {
    const binary = atob(String(b64 || '').replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
}

function encodeBase64UTF8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function copyToClipboard(text) {
    const done = () => toast('Copied to clipboard', 'ok', { ms: 1600 });
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, () => legacyCopy(text, done));
    } else {
        legacyCopy(text, done);
    }
}

function legacyCopy(text, done) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); }
    catch (_) { toast('Copy failed — the value was logged to the console', 'err'); console.log(text); }
    area.remove();
}

/* ── toasts & status ───────────────────────────────────────── */
function toast(message, type = 'ok', opts = {}) {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    const icon = type === 'ok' ? '✓' : type === 'err' ? '✕' : type === 'warn' ? '!' : 'i';
    node.innerHTML = `<span class="t-ico">${icon}</span><span class="t-msg"></span>`;
    node.querySelector('.t-msg').textContent = message;

    let timer = null;
    const dismiss = () => {
        clearTimeout(timer);
        node.classList.add('out');
        setTimeout(() => node.remove(), 220);
    };
    if (opts.action) {
        const btn = document.createElement('button');
        btn.className = 't-act';
        btn.textContent = opts.action.label;
        btn.onclick = () => { btn.disabled = true; dismiss(); opts.action.run(); };
        node.appendChild(btn);
    }
    toastsEl.appendChild(node);
    while (toastsEl.children.length > 4) toastsEl.firstElementChild.remove();
    timer = setTimeout(dismiss, opts.ms || (type === 'err' ? 7000 : 4000));
}

function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (type ? ' ' + type : '');
}

let flashTimer = null;
function flashStatus(text, type, ms = 2600) {
    setStatus(text, type);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
        if (state.connected && !pumping) {
            setStatus(`✓ Connected: ${state.owner}/${state.repo}`, 'ok');
        }
    }, ms);
}

/* ── overlays ──────────────────────────────────────────────── */
function openOverlay(node) {
    node.classList.add('open');
    document.body.classList.add('modal-open');
}
function closeOverlay(node) {
    node.classList.remove('open');
    if (!document.querySelector('.overlay.open, .editor-overlay.open')) {
        document.body.classList.remove('modal-open');
    }
}
function anyOverlayOpen() {
    return !!document.querySelector('.overlay.open, .editor-overlay.open');
}
function onEscape(node, handler) {
    const listener = e => {
        if (e.key !== 'Escape' || !node.classList.contains('open')) return;
        e.preventDefault();
        e.stopPropagation();
        handler();
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
}

/* ── GitHub API ────────────────────────────────────────────── */
const apiUrl = path => `https://api.github.com/repos/${state.owner}/${state.repo}${path}`;
const enc = path => String(path).split('/').map(encodeURIComponent).join('/');
const refQ = () => `?ref=${encodeURIComponent(state.branch)}`;

async function api(method, path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const opts = {
        method,
        headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `token ${state.token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'GitHub-File-Manager/3.0',
        },
        signal: controller.signal,
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    try {
        const res = await fetch(apiUrl(path), opts);
        clearTimeout(timeout);
        if (res.status === 204) return null;
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.message || `HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return data;
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') throw new Error('Request timed out — check your network or token');
        throw err;
    }
}

async function fetchRaw(path) {
    const res = await fetch(apiUrl(`/contents/${enc(path)}${refQ()}`), {
        headers: { Accept: 'application/vnd.github.v3.raw', Authorization: `token ${state.token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} while reading ${path}`);
    return res;
}

function invalidateTree() { pathCache = null; }

async function getRepoTree() {
    if (pathCache && pathCache.branch === state.branch) return pathCache.entries;
    const ref = await api('GET', `/git/ref/heads/${enc(state.branch)}`);
    const head = await api('GET', `/git/commits/${ref.object.sha}`);
    const tree = await api('GET', `/git/trees/${head.tree.sha}?recursive=1`);
    if (tree.truncated) throw new Error('This repository tree is too large for that operation');
    pathCache = { branch: state.branch, entries: tree.tree };
    return pathCache.entries;
}

async function commitTree(changes, message, head) {
    const headSha = head.object.sha;
    const headCommit = await api('GET', `/git/commits/${headSha}`);
    const newTree = await api('POST', '/git/trees', { base_tree: headCommit.tree.sha, tree: changes });
    const commit = await api('POST', '/git/commits', { message, tree: newTree.sha, parents: [headSha] });
    await api('PATCH', `/git/refs/heads/${enc(state.branch)}`, { sha: commit.sha });
    invalidateTree();
    return commit;
}

/* ── preferences → UI ──────────────────────────────────────── */
function applyPrefs() {
    document.body.dataset.accent = prefs.accent;
    document.querySelectorAll('#accentSwatches .sw').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.accent === prefs.accent);
    });
    sortSelect.value = prefs.sort;
    viewGrid.classList.toggle('active', prefs.view === 'grid');
    viewList.classList.toggle('active', prefs.view === 'list');
    formattedBtn.classList.toggle('active', prefs.formatted);
    formattedBtn.textContent = prefs.formatted ? '🔀 Formatted ON' : '🔀 Formatted';
    optHideGitkeep.checked = prefs.hideGitkeep;
}

/* ── connect / branches ────────────────────────────────────── */
function renderRepoCard() {
    if (!state.connected) {
        repoCard.dataset.empty = 'true';
        repoIcon.textContent = '🐙';
        repoName.textContent = 'No repository';
        repoMeta.textContent = 'Connect to get started';
        branchWrap.hidden = true;
        repoLink.href = '#';
        repoLink.setAttribute('aria-disabled', 'true');
        return;
    }
    repoCard.dataset.empty = 'false';
    repoIcon.textContent = '📚';
    repoName.textContent = `${state.owner}/${state.repo}`;
    repoMeta.textContent = state.path ? `/${state.path}` : 'Repository root';
    branchWrap.hidden = false;
    repoLink.href = `https://github.com/${state.owner}/${state.repo}`;
    repoLink.removeAttribute('aria-disabled');
    branchLabel.textContent = state.branch;
}

async function connect() {
    const repoVal = repoInput.value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
    const token = tokenInput.value.trim();

    if (!/^[^\s/]+\/[^\s/]+$/.test(repoVal) || !token) {
        setStatus('Repository and token are required', 'err');
        toast('Enter owner/repo and a GitHub token first', 'err');
        (repoVal.includes('/') ? tokenInput : repoInput).focus();
        return;
    }

    const [owner, repo] = repoVal.split('/');
    state.owner = owner;
    state.repo = repo;
    state.token = token;
    state.path = pendingPath || '';
    state.query = '';
    searchInput.value = '';
    searchClear.classList.remove('show');

    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting…';
    setStatus('Connecting…', 'loading');

    try {
        const info = await api('GET', '');
        state.branch = info.default_branch || 'master';
        state.connected = true;
        store.rawSet('fm_token', token);
        store.rawSet('fm_repo', repoVal);
        document.body.dataset.connected = 'true';
        disconnectBtn.hidden = false;
        tokenInput.value = token;

        setStatus(`✓ Connected: ${info.full_name}`, 'ok');
        renderRepoCard();
        await loadBranches();
        renderCrumbs();
        await load();
        pendingPath = null;
        syncUrl();
        toast(`Connected to ${info.full_name}`, 'ok', { ms: 2200 });
    } catch (err) {
        console.error('Connection error:', err);
        state.connected = false;
        document.body.dataset.connected = 'false';
        setStatus('✗ ' + err.message, 'err');
        toast('Connection failed: ' + err.message, 'err');
    } finally {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
    }
}

async function loadBranches() {
    try {
        const branches = await api('GET', '/branches?per_page=100');
        branchSelect.innerHTML = '';
        (Array.isArray(branches) ? branches : []).forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.name;
            opt.textContent = b.name + (b.protected ? ' 🔒' : '');
            branchSelect.appendChild(opt);
        });
        if (!branchSelect.options.length) {
            const opt = document.createElement('option');
            opt.value = state.branch;
            opt.textContent = state.branch;
            branchSelect.appendChild(opt);
        }
        branchSelect.value = state.branch;
        branchLabel.textContent = state.branch;
    } catch (err) {
        console.warn('Branch list unavailable:', err.message);
        branchSelect.innerHTML = `<option value="${escapeHtml(state.branch)}">${escapeHtml(state.branch)}</option>`;
    }
}

function disconnect() {
    state.connected = false;
    state.token = '';
    state.items = [];
    state.path = '';
    state.query = '';
    pathCache = null;
    selection.clear();
    clipboard = null;
    store.rawSet('fm_token', '');
    tokenInput.value = '';
    document.body.dataset.connected = 'false';
    disconnectBtn.hidden = true;
    setStatus('Not connected');
    renderRepoCard();
    renderCrumbs();
    renderFiles();
    renderClipboard();
    refreshSelection();
}

/* ── sidebar ───────────────────────────────────────────────── */
function openSidebar() { document.body.classList.add('side-open'); }
function closeSidebar() { document.body.classList.remove('side-open'); }

/* ── menus ─────────────────────────────────────────────────── */
function closeMenus() {
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.caret').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-expanded', 'false'); });
}
function bindMenu(button, menu, onPick) {
    button.addEventListener('click', e => {
        e.stopPropagation();
        const open = menu.classList.contains('open');
        closeMenus();
        if (!open) {
            menu.classList.add('open');
            button.classList.add('active');
            button.setAttribute('aria-expanded', 'true');
        }
    });
    menu.addEventListener('click', e => {
        const item = e.target.closest('[data-upload], [data-new]');
        if (!item) return;
        closeMenus();
        onPick(item.dataset.upload || item.dataset.new);
    });
}

/* ── navigation ────────────────────────────────────────────── */
function navigate(path) {
    const next = normalizeRel(path);
    state.path = next;
    pendingPath = null;
    syncUrl();
    state.query = '';
    searchInput.value = '';
    searchClear.classList.remove('show');
    state.deepSearch = false;
    deepSearchBtn.classList.remove('active');
    if (selection.size) clearSelection();
    if (selectMode) setSelectMode(false);
    renderCrumbs();
    renderRepoCard();
    load();
}

function goUp() {
    if (!state.path) return;
    navigate(state.path.split('/').slice(0, -1).join('/'));
}

function renderCrumbs() {
    pathEl.innerHTML = '';
    const mk = (label, target, isLast) => {
        const span = document.createElement('span');
        span.className = 'crumb' + (isLast ? ' current' : '');
        span.textContent = label;
        if (!isLast) {
            span.tabIndex = 0;
            span.onclick = () => navigate(target);
            span.onkeydown = e => { if (e.key === 'Enter') navigate(target); };
        }
        return span;
    };
    const parts = state.path.split('/').filter(Boolean);
    pathEl.appendChild(mk('📁 root', '', parts.length === 0));
    let current = '';
    parts.forEach((part, i) => {
        current += (current ? '/' : '') + part;
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '/';
        pathEl.appendChild(sep);
        pathEl.appendChild(mk(part, current, i === parts.length - 1));
    });
}

async function load(silent = false) {
    if (!state.connected) { renderFiles(); return; }
    const seq = ++loadSeq;
    if (!silent) setStatus('Loading…', 'loading');
    if (!state.items.length) renderSkeleton();

    try {
        const data = await api('GET', `/contents/${enc(state.path)}${refQ()}`);
        if (seq !== loadSeq) return;
        const list = Array.isArray(data) ? data : [data];
        state.items = list.map(item => ({
            name: item.name,
            path: item.path,
            type: item.type === 'dir' ? 'dir' : 'file',
            size: item.size || 0,
            sha: item.sha,
            download_url: item.download_url || null,
        }));
        state.items = state.items.filter(item => {
            if (item.name === '.DS_Store' || item.name === 'Thumbs.db') return false;
            if (prefs.hideGitkeep && item.name === '.gitkeep') return false;
            return true;
        });
        renderFiles();
        setStatus(`✓ ${state.owner}/${state.repo}`, 'ok');
    } catch (err) {
        if (seq !== loadSeq) return;
        if (err.status === 404 && state.path) {
            state.path = state.path.split('/').slice(0, -1).join('/');
            renderCrumbs();
            return load(silent);
        }
        console.error('Load error:', err);
        state.items = [];
        filesEl.innerHTML = '';
        filesEl.className = 'files ' + prefs.view;
        filesEl.appendChild(stateBlock('⚠️', 'Could not load this folder', err.message));
        updateStats(0);
        setStatus('✗ ' + err.message, 'err');
    }
}

/* ── rendering ─────────────────────────────────────────────── */
function stateBlock(emoji, title, text, extra) {
    const box = document.createElement('div');
    box.className = 'state';
    box.innerHTML = `<span class="big">${emoji}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>`;
    if (extra) box.appendChild(extra);
    return box;
}

function renderSkeleton() {
    filesEl.className = 'files ' + prefs.view;
    if (prefs.view === 'list') {
        filesEl.innerHTML = '<div class="sk" style="height:38px"></div><div class="sk" style="height:38px"></div><div class="sk" style="height:38px"></div><div class="sk" style="height:38px"></div>';
        return;
    }
    filesEl.innerHTML = '<div class="skeleton-grid">' + '<div class="sk"></div>'.repeat(9) + '</div>';
}

function renderWelcome() {
    filesEl.className = 'files grid';
    filesEl.innerHTML = '';
    const steps = document.createElement('div');
    steps.className = 'steps';
    steps.innerHTML = `
        <div class="step"><b><span class="n">1</span>Token</b>Create a fine-grained or classic token with <code>repo</code> (or Contents: read &amp; write) scope.</div>
        <div class="step"><b><span class="n">2</span>Repository</b>Type <code>owner/repo</code>, connect, then browse folders like a desktop file manager.</div>
        <div class="step"><b><span class="n">3</span>Upload</b>Files, whole folders, or a .zip — and choose exactly which entries to extract.</div>`;
    filesEl.appendChild(stateBlock('🔑', 'Connect a repository', 'Your token stays in this browser. Nothing is sent anywhere except api.github.com.', steps));
    updateStats(0);
}

function dateKey(item) {
    const key = `${state.branch}:${item.path}`;
    const iso = dateCache.get(key);
    return iso ? new Date(iso).getTime() : 0;
}

function sortItems(items) {
    const dirFirst = (a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1);
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    const comparators = {
        'name-asc': byName,
        'name-desc': (a, b) => byName(b, a),
        'size-asc': (a, b) => (a.size || 0) - (b.size || 0),
        'size-desc': (a, b) => (b.size || 0) - (a.size || 0),
        'date-asc': (a, b) => dateKey(a) - dateKey(b) || byName(a, b),
        'date-desc': (a, b) => dateKey(b) - dateKey(a) || byName(a, b),
        type: (a, b) => (extOf(a.name) || '').localeCompare(extOf(b.name) || '') || byName(a, b),
    };
    const cmp = comparators[prefs.sort] || byName;
    return items.slice().sort((a, b) => dirFirst(a, b) || cmp(a, b));
}

function renderFiles() {
    filesEl.className = 'files ' + (prefs.view === 'list' ? 'list' : 'grid');
    filesEl.innerHTML = '';
    viewIndex = new Map();

    dateSeq++;
    dateQueue.length = 0;

    if (!state.connected) { renderWelcome(); return; }
    if (state.deepSearch) { renderDeepSearch(); return; }

    const query = state.query.trim().toLowerCase();
    let items = state.items.slice();
    if (query) items = items.filter(item => item.name.toLowerCase().includes(query));
    items = sortItems(items);
    displayed = items;

    if (prefs.view === 'grid' && state.path && !query) filesEl.appendChild(backCard());
    if (!items.length) {
        const isFiltered = query && state.items.length > 0;
        filesEl.appendChild(stateBlock(
            isFiltered ? '🔎' : '📭',
            isFiltered ? 'No matches here' : 'This folder is empty',
            isFiltered ? `Nothing in “${state.path || 'root'}” matches “${state.query.trim()}”. Try the Repo search.` : 'Drop files anywhere on the page, or create something with the toolbar above.'
        ));
        updateStats(0);
        return;
    }

    if (prefs.view === 'list') filesEl.appendChild(listHead());
    items.forEach(item => {
        viewIndex.set(item.path, item);
        filesEl.appendChild(prefs.view === 'list' ? buildRow(item) : buildCard(item));
    });
    refreshSelection();
    updateStats(items.length);
}

function backCard() {
    const card = document.createElement('div');
    card.className = 'card folder back';
    card.dataset.nav = 'up';
    card.title = 'Go up one level';
    card.innerHTML = '<span class="icon-big">⬅️</span><span class="name">..</span><span class="meta">Parent folder</span>';
    return card;
}

function quickActions(item, context) {
    const isDir = item.type === 'dir';
    const wrap = document.createElement('div');
    wrap.className = context === 'card' ? 'card-actions' : 'r-actions';
    const button = (action, icon, title, extra = '') =>
        `<button class="qa${extra}" data-qa="${action}" title="${title}" aria-label="${title}">${icon}</button>`;
    let html = '';
    html += button('download', '⬇', isDir ? 'Download folder as .zip' : 'Download file');
    html += button('replace', '🔄', isDir ? 'Replace folder contents' : 'Replace file');
    html += button('newtab', '🌐', isDir ? 'Open live folder on the site' : 'Open live page on the site');
    if (!isDir && isTextFile(item.name)) html += button('copy', '📋', 'Copy file contents', ' copy');
    html += button('menu', '⋯', 'More actions', ' kebab');
    wrap.innerHTML = html;
    return wrap;
}

function buildCard(item) {
    const isDir = item.type === 'dir';
    const ext = extOf(item.name);
    const card = document.createElement('div');
    card.className = 'card' + (isDir ? ' folder' : '');
    card.dataset.path = item.path;
    card.dataset.type = item.type;
    card.tabIndex = 0;
    card.title = item.path;
    card.innerHTML = `
        <span class="icon-big">${getFileIcon(item.name, isDir)}</span>
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="meta">${isDir ? 'Folder' : formatSize(item.size)}</span>
        ${(!isDir && ext) ? `<span class="ext-badge">${escapeHtml(ext)}</span>` : ''}`;
    card.appendChild(quickActions(item, 'card'));
    if (clipboard && clipboard.mode === 'cut' && clipboard.items.some(i => i.path === item.path)) card.classList.add('cut');
    return card;
}

function listHead() {
    const head = document.createElement('div');
    head.className = 'list-head';
    const sort = prefs.sort || 'name-asc';
    const mark = (key, label) => {
        let arrow = '';
        if (key === 'name' && (sort === 'name-asc' || sort === 'name-desc')) arrow = sort === 'name-asc' ? ' ↑' : ' ↓';
        if (key === 'size' && (sort === 'size-asc' || sort === 'size-desc')) arrow = sort === 'size-asc' ? ' ↑' : ' ↓';
        if (key === 'date' && (sort === 'date-asc' || sort === 'date-desc')) arrow = sort === 'date-asc' ? ' ↑' : ' ↓';
        if (key === 'type' && sort === 'type') arrow = ' •';
        return `${label}${arrow}`;
    };
    head.innerHTML = `
        <span class="c-name c-sort" data-sort="name">${mark('name', 'Name')}</span>
        <span class="c-size c-sort" data-sort="size">${mark('size', 'Size')}</span>
        <span class="c-date c-sort" data-sort="date">${mark('date', 'Modified')}</span>
        <span class="c-type c-sort" data-sort="type">${mark('type', 'Type')}</span>
        <span class="c-actions">Actions</span>`;
    return head;
}

function buildRow(item) {
    const isDir = item.type === 'dir';
    const row = document.createElement('div');
    row.className = 'row' + (isDir ? ' folder' : '');
    row.dataset.path = item.path;
    row.dataset.type = item.type;
    row.tabIndex = 0;
    row.title = item.path;
    row.innerHTML = `
        <span class="r-check">✓</span>
        <span class="r-name"><span class="r-ico">${getFileIcon(item.name, isDir)}</span><span class="r-label">${escapeHtml(item.name)}</span></span>
        <span class="r-size">${isDir ? '—' : formatSize(item.size)}</span>
        <span class="r-date" title="Loading last commit…">—</span>
        <span class="r-type">${isDir ? 'folder' : (extOf(item.name) || 'file')}</span>`;
    row.appendChild(quickActions(item, 'row'));
    queueDate(item, row.querySelector('.r-date'));
    if (clipboard && clipboard.mode === 'cut' && clipboard.items.some(i => i.path === item.path)) row.classList.add('cut');
    return row;
}

async function renderDeepSearch() {
    const token = ++deepSeq;
    const query = state.query.trim();
    filesEl.className = 'files list';
    filesEl.innerHTML = `<div class="state"><span class="big">🌐</span><h2>Searching the repository…</h2><p>Looking for “${escapeHtml(query)}” in every folder.</p></div>`;

    if (query.length < 2) {
        filesEl.innerHTML = '';
        filesEl.appendChild(stateBlock('🔎', 'Repository search', 'Type at least two characters. Results include files and folders from the whole branch.'));
        return;
    }

    try {
        const entries = await getRepoTree();
        if (token !== deepSeq) return;
        const needle = query.toLowerCase();
        const hits = entries
            .filter(entry => entry.path.toLowerCase().includes(needle))
            .sort((a, b) => {
                const aName = a.path.split('/').pop().toLowerCase();
                const bName = b.path.split('/').pop().toLowerCase();
                const aStarts = aName.startsWith(needle) ? 0 : 1;
                const bStarts = bName.startsWith(needle) ? 0 : 1;
                return aStarts - bStarts || a.path.localeCompare(b.path);
            })
            .slice(0, 400);

        filesEl.innerHTML = '';
        viewIndex = new Map();
        if (!hits.length) {
            filesEl.appendChild(stateBlock('🫥', 'Nothing found', `No file or folder on “${state.branch}” contains “${query}”.`));
            updateStats(0);
            return;
        }
        const head = listHead();
        head.querySelector('.c-sort').textContent = 'Path';
        filesEl.appendChild(head);
        hits.forEach(entry => {
            const isDir = entry.type === 'tree';
            const name = entry.path.split('/').pop();
            const parent = entry.path.slice(0, Math.max(0, entry.path.lastIndexOf('/')));
            const item = {
                name, path: entry.path,
                type: isDir ? 'dir' : 'file',
                size: entry.size || 0, sha: entry.sha, download_url: null,
            };
            viewIndex.set(item.path, item);
            const row = document.createElement('div');
            row.className = 'row';
            row.dataset.path = item.path;
            row.dataset.type = item.type;
            row.tabIndex = 0;
            row.title = item.path;
            row.innerHTML = `
                <span class="r-check">✓</span>
                <span class="r-name"><span class="r-ico">${getFileIcon(name, isDir)}</span><span class="r-label">${escapeHtml(name)}</span><span class="r-sub">${escapeHtml(parent)}</span></span>
                <span class="r-size">${isDir ? '—' : formatSize(item.size)}</span>
                <span class="r-date" title="Dates are not loaded for repository-wide search">—</span>
                <span class="r-type">${isDir ? 'folder' : (extOf(name) || 'file')}</span>`;
            row.appendChild(quickActions(item, 'row'));
            filesEl.appendChild(row);
        });
        updateStats(hits.length);
    } catch (err) {
        if (token !== deepSeq) return;
        filesEl.innerHTML = '';
        filesEl.appendChild(stateBlock('⚠️', 'Search failed', err.message));
        updateStats(0);
    }
}

function updateStats(shown) {
    const files = state.items.filter(i => i.type === 'file');
    const dirs = state.items.filter(i => i.type === 'dir');
    statFiles.textContent = files.length;
    statFolders.textContent = dirs.length;
    statSize.textContent = formatSize(files.reduce((sum, f) => sum + (f.size || 0), 0));
    statSel.textContent = selection.size;

    if (!state.connected) {
        sbItems.textContent = 'Not connected';
        sbFilter.hidden = true;
        sbSel.hidden = true;
        return;
    }
    const total = state.items.length;
    const query = state.query.trim();
    if (state.deepSearch) {
        sbItems.textContent = `Repository search · ${shown} result${shown === 1 ? '' : 's'}`;
        sbFilter.hidden = !query;
        if (query) sbFilter.textContent = `“${query}”`;
    } else {
        sbItems.textContent = `${plural(total, 'item')} · ${files.length} files · ${dirs.length} folders`;
        sbFilter.hidden = !query;
        if (query) sbFilter.textContent = `showing ${shown} of ${total}`;
    }
    sbSel.hidden = selection.size === 0;
    if (selection.size) sbSel.textContent = `${plural(selection.size, 'item')} selected`;
}

/* ── selection ─────────────────────────────────────────────── */
function toggleSelect(item) {
    if (selection.has(item.path)) {
        selection.delete(item.path);
        if (selectionAnchor === item.path) selectionAnchor = null;
    } else {
        selection.add(item.path);
        selectionAnchor = item.path;
    }
    refreshSelection();
}

function rangeSelect(item) {
    const paths = displayed.map(i => i.path);
    const from = paths.indexOf(selectionAnchor);
    const to = paths.indexOf(item.path);
    if (from === -1 || to === -1) { toggleSelect(item); return; }
    const [lo, hi] = from < to ? [from, to] : [to, from];
    selection.clear();
    for (let i = lo; i <= hi; i++) selection.add(paths[i]);
    refreshSelection();
}

function clearSelection() {
    if (!selection.size && !selectionAnchor) return;
    selection.clear();
    selectionAnchor = null;
    refreshSelection();
}

function setSelectMode(on) {
    selectMode = !!on;
    document.body.classList.toggle('select-mode', selectMode);
    selectBtn.classList.toggle('active', selectMode);
    selectBtn.textContent = selectMode ? '✕ Select' : '☑ Select';
    selectBtn.title = selectMode ? 'Exit select mode' : 'Tap items to select them';
    if (!selectMode) clearSelection();
}

function selectAllDisplayed() {
    if (!selectMode) setSelectMode(true);
    displayed.forEach(item => selection.add(item.path));
    selectionAnchor = displayed.length ? displayed[0].path : null;
    refreshSelection();
}

function refreshSelection() {
    const present = new Set();
    filesEl.querySelectorAll('[data-path]').forEach(node => {
        present.add(node.dataset.path);
        const on = selection.has(node.dataset.path);
        node.classList.toggle('selected', on);
        const check = node.querySelector('.r-check');
        if (check) check.textContent = on ? '✓' : '';
    });
    [...selection].forEach(path => { if (!present.has(path)) selection.delete(path); });
    if (selectionAnchor && !selection.has(selectionAnchor)) selectionAnchor = null;

    const count = selection.size;
    if (count) {
        selCount.innerHTML = `<strong>${count}</strong> item${count === 1 ? '' : 's'} selected`;
        selectionBar.classList.add('show');
    } else {
        selectionBar.classList.remove('show');
    }
    statSel.textContent = count;
    sbSel.hidden = count === 0;
    if (count) sbSel.textContent = `${plural(count, 'item')} selected`;
}

function getActionItems(item) {
    if (selection.size && (!item || selection.has(item.path))) {
        return displayed.filter(i => selection.has(i.path));
    }
    return item ? [item] : [];
}

/* ── icons & file kinds ────────────────────────────────────── */
function getFileIcon(name, isDir) {
    if (isDir) return '📁';
    const map = {
        html: '🌐', htm: '🌐', css: '🎨', scss: '🎨', less: '🎨',
        js: '⚡', mjs: '⚡', cjs: '⚡', jsx: '⚡', ts: '🔷', tsx: '🔷',
        json: '📋', md: '📝', markdown: '📝', txt: '📄',
        xml: '📰', svg: '🖼️',
        png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', avif: '🖼️', ico: '🖼️', bmp: '🖼️',
        pdf: '📕', zip: '📦', tar: '📦', gz: '📦', rar: '📦', '7z': '📦',
        py: '🐍', rb: '💎', php: '🐘', go: '🐹', rs: '🦀',
        c: '⚙️', cpp: '⚙️', h: '⚙️', hpp: '⚙️',
        sh: '🐚', bash: '🐚', zsh: '🐚',
        yml: '📜', yaml: '📜', toml: '📜',
        lock: '🔒', gitignore: '🙈', env: '🔐',
        vue: '🟢', sql: '🗄️', log: '📜',
        mp3: '🎵', wav: '🎵', ogg: '🎵', m4a: '🎵', flac: '🎵',
        mp4: '🎬', webm: '🎬', mov: '🎬',
        woff: '🔤', woff2: '🔤', ttf: '🔤', otf: '🔤', eot: '🔤',
    };
    return map[extOf(name)] || '📄';
}

const TEXT_EXTS = new Set([
    'html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
    'json', 'xml', 'svg', 'txt', 'md', 'markdown', 'yml', 'yaml', 'toml',
    'sh', 'bash', 'zsh', 'py', 'rb', 'php', 'go', 'rs', 'c', 'cpp', 'h', 'hpp',
    'vue', 'sql', 'log', 'env', 'gitignore', 'lock', 'conf', 'config', 'ini', 'cfg',
    'dockerfile', 'makefile', 'editorconfig', 'prettierrc', 'eslintrc', 'csv',
]);

function isTextFile(name) {
    const lower = String(name).toLowerCase();
    if (TEXT_EXTS.has(lower)) return true;
    return TEXT_EXTS.has(extOf(lower));
}

const PREVIEW = {
    image: /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i,
    pdf: /\.pdf$/i,
    audio: /\.(mp3|wav|ogg|m4a|flac|aac)$/i,
    video: /\.(mp4|webm|ogv|mov|m4v)$/i,
};

function previewKind(name) {
    if (PREVIEW.image.test(name)) return 'image';
    if (PREVIEW.pdf.test(name)) return 'pdf';
    if (PREVIEW.audio.test(name)) return 'audio';
    if (PREVIEW.video.test(name)) return 'video';
    return null;
}

function getCodeMirrorMode(name) {
    const map = {
        js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
        ts: 'javascript', tsx: 'javascript',
        css: 'css', scss: 'css', less: 'css',
        html: 'htmlmixed', htm: 'htmlmixed', xml: 'xml', svg: 'xml',
        md: 'markdown', markdown: 'markdown', py: 'python',
        sh: 'shell', bash: 'shell', zsh: 'shell',
        yml: 'yaml', yaml: 'yaml', sql: 'sql',
        json: { name: 'javascript', json: true },
    };
    return map[extOf(name)] || 'text/plain';
}

/* ── context menu ──────────────────────────────────────────── */
function showContextMenu(x, y, item, node) {
    hideContextMenu();
    ctx = { item: item || null, node: node || null };
    if (node) node.classList.add('ctx-active');

    const hasItem = !!item;
    const isDir = hasItem && item.type === 'dir';
    const isMulti = hasItem && selection.size > 1 && selection.has(item.path);
    const count = isMulti ? selection.size : 0;
    const canPreview = hasItem && !isDir && !isMulti && !!previewKind(item.name);

    contextMenu.querySelectorAll('[data-needs-item]').forEach(el => { el.hidden = !hasItem; });
    contextMenu.querySelectorAll('[data-file-only]').forEach(el => { el.hidden = !hasItem || isDir || isMulti; });
    contextMenu.querySelectorAll('[data-single-only]').forEach(el => { el.hidden = !hasItem || isMulti; });
    contextMenu.querySelectorAll('[data-clipboard-only]').forEach(el => { el.hidden = !clipboard; });
    const previewEl = contextMenu.querySelector('[data-action="preview"]');
    if (previewEl) previewEl.hidden = !canPreview;

    if (hasItem) {
        $('ctxOpenLabel').textContent = isDir ? 'Open folder' : 'Open / edit';
        $('ctxDownloadLabel').textContent = isDir ? 'Download as .zip' : 'Download';
        $('ctxReplaceLabel').textContent = isDir ? 'Replace contents…' : 'Replace…';
        if (isMulti) {
            ctxTitle.textContent = `${count} items`;
            ctxTitle.title = `${count} items selected`;
            $('ctxCopyLabel').textContent = `Copy ${count} items`;
            $('ctxCutLabel').textContent = `Cut ${count} items`;
            $('ctxDeleteLabel').textContent = `Delete ${count} items`;
        } else {
            ctxTitle.textContent = item.name;
            ctxTitle.title = item.path;
            $('ctxCopyLabel').textContent = 'Copy';
            $('ctxCutLabel').textContent = 'Cut';
            $('ctxDeleteLabel').textContent = 'Delete';
        }
    } else {
        ctxTitle.textContent = clipboard
            ? `${clipboard.mode === 'cut' ? 'Cut' : 'Copied'} · ${clipboardSummary()}`
            : `Folder · /${state.path}`;
        ctxTitle.title = state.path || 'root';
    }

    const pasteLabel = $('ctxPasteLabel');
    if (clipboard) {
        const n = clipboard.items.length;
        const what = n === 1 ? `“${clipboard.items[0].name}”` : `${n} items`;
        pasteLabel.textContent = clipboard.mode === 'cut' ? `Paste ${what} (move)` : `Paste ${what}`;
    } else {
        pasteLabel.textContent = 'Paste';
    }

    contextMenu.style.left = '0px';
    contextMenu.style.top = '0px';
    contextMenu.classList.add('open');

    const margin = 8;
    const rect = contextMenu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width + margin > window.innerWidth) left = Math.max(margin, x - rect.width);
    if (top + rect.height + margin > window.innerHeight) top = Math.max(margin, y - rect.height);
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
    contextMenu.focus({ preventScroll: true });
}

function hideContextMenu() {
    if (!ctx) return;
    contextMenu.classList.remove('open');
    if (ctx.node) ctx.node.classList.remove('ctx-active');
    ctx = null;
}

async function runAction(action, item) {
    const isDir = item && item.type === 'dir';
    switch (action) {
        case 'open':
            if (!item) return;
            if (isDir) navigate(item.path); else openFile(item);
            break;
        case 'preview':
            if (item) previewItem(item);
            break;
        case 'openNewTab':
            if (item) openInNewTab(item);
            break;
        case 'copyContent':
            if (item) await copyFileContent(item);
            break;
        case 'download':
            if (item) await (isDir ? downloadFolder(item) : downloadItem(item));
            break;
        case 'replace':
            if (item) startReplace(item);
            break;
        case 'rename':
            if (item) await renameItem(item);
            break;
        case 'duplicate':
            if (item) await duplicateItem(item);
            break;
        case 'copy': {
            const items = getActionItems(item);
            if (items.length) setClipboard(items, 'copy');
            break;
        }
        case 'cut': {
            const items = getActionItems(item);
            if (items.length) setClipboard(items, 'cut');
            break;
        }
        case 'paste':
            await pasteClipboard();
            break;
        case 'cancelClipboard':
            setClipboard(null);
            break;
        case 'copyPath':
            if (item) copyToClipboard(item.path);
            break;
        case 'copyRaw':
            if (item) {
                copyToClipboard(item.download_url || `https://raw.githubusercontent.com/${state.owner}/${state.repo}/${enc(state.branch)}/${enc(item.path)}`);
            }
            break;
        case 'openGitHub':
            if (item) {
                const kind = isDir ? 'tree' : 'blob';
                window.open(`https://github.com/${state.owner}/${state.repo}/${kind}/${enc(state.branch)}/${enc(item.path)}`, '_blank', 'noopener');
            }
            break;
        case 'info':
            if (item) showInfo(item);
            break;
        case 'select':
            if (!selectMode) setSelectMode(true);
            if (item && !selection.has(item.path)) toggleSelect(item);
            break;
        case 'delete': {
            const items = getActionItems(item);
            if (items.length) await deleteMany(items);
            break;
        }
    }
}

/* ── clipboard ─────────────────────────────────────────────── */
function clipboardSummary() {
    if (!clipboard) return '';
    const n = clipboard.items.length;
    return n === 1 ? clipboard.items[0].name : `${n} items`;
}

function setClipboard(items, mode) {
    if (items && items.length) {
        clipboard = {
            mode,
            items: items.map(i => ({ name: i.name, path: i.path, type: i.type, sha: i.sha })),
        };
    } else {
        clipboard = null;
    }
    document.querySelectorAll('.cut').forEach(n => n.classList.remove('cut'));
    if (clipboard && clipboard.mode === 'cut') {
        const paths = new Set(clipboard.items.map(i => i.path));
        filesEl.querySelectorAll('[data-path]').forEach(node => {
            if (paths.has(node.dataset.path)) node.classList.add('cut');
        });
    }
    renderClipboard();
    if (clipboard) {
        toast(`${mode === 'cut' ? 'Cut' : 'Copied'} ${clipboardSummary()}`, 'ok', { ms: 1800 });
    }
}

function renderClipboard() {
    if (!clipboard) {
        clipCard.hidden = true;
        sbClip.hidden = true;
        return;
    }
    clipCard.hidden = false;
    clipMode.textContent = clipboard.mode === 'cut' ? 'move' : 'copy';
    clipText.textContent = clipboardSummary();
    clipText.title = clipboard.items.map(i => i.path).join('\n');
    sbClip.hidden = false;
    sbClip.textContent = `${clipboard.mode === 'cut' ? 'Cut' : 'Copied'}: ${clipboardSummary()}`;
}

async function pasteClipboard() {
    if (!clipboard) { toast('Clipboard is empty', 'warn'); return; }
    const { items: sources, mode } = clipboard;
    const destDir = state.path;

    const targets = sources.filter(src => {
        const dest = joinPath(destDir, src.name);
        if (dest === src.path) return false;
        if (src.type === 'dir' && (dest === src.path || dest.startsWith(src.path + '/'))) return false;
        return true;
    });
    if (!targets.length) {
        toast('Already in this folder', 'warn');
        if (mode === 'cut') setClipboard(null);
        return;
    }

    const conflicts = [];
    try {
        for (const src of targets) {
            const dest = joinPath(destDir, src.name);
            try {
                await api('GET', `/contents/${enc(dest)}${refQ()}`);
                conflicts.push(src);
            } catch (err) {
                if (err.status !== 404) throw err;
            }
        }
    } catch (err) {
        toast('Could not check for conflicts: ' + err.message, 'err');
        return;
    }

    if (conflicts.length) {
        const ok = await uiConfirm({
            title: 'Overwrite existing items?',
            text: `${conflicts.length === 1 ? `“${conflicts[0].name}”` : `${conflicts.length} of ${targets.length} items`} already exist${conflicts.length === 1 ? 's' : ''} in /${destDir || ''}. Overwrite?`,
            ok: 'Overwrite', danger: true, icon: '⚠️',
        });
        if (!ok) { flashStatus('Paste cancelled', 'warn', 1600); return; }
    }

    setStatus(mode === 'cut' ? 'Moving…' : 'Copying…', 'loading');
    let done = 0;
    try {
        for (const src of targets) {
            const dest = joinPath(destDir, src.name);
            setStatus(`${mode === 'cut' ? 'Moving' : 'Copying'} ${done + 1}/${targets.length}: ${src.name}…`, 'loading');
            if (src.type === 'dir') await pasteFolder(src, dest, mode);
            else await pasteFile(src, dest, mode);
            done++;
        }
        if (mode === 'cut') { clipboard = null; renderClipboard(); }
        toast(`${mode === 'cut' ? 'Moved' : 'Pasted'} ${plural(done, 'item')}`, 'ok');
    } catch (err) {
        console.error('Paste error:', err);
        toast('Paste failed: ' + err.message, 'err');
    }
    await load(true);
}

async function pasteFile(src, dest, mode) {
    const blob = await api('GET', `/git/blobs/${src.sha}`);
    const content = String(blob.content || '').replace(/\n/g, '');
    let sha;
    try {
        const existing = await api('GET', `/contents/${enc(dest)}${refQ()}`);
        if (existing && !Array.isArray(existing)) sha = existing.sha;
    } catch (err) {
        if (err.status !== 404) throw err;
    }
    await api('PUT', `/contents/${enc(dest)}`, {
        message: `${mode === 'cut' ? 'Move' : 'Copy'} ${src.name}`,
        content, sha, branch: state.branch,
    });
    if (mode === 'cut') {
        await api('DELETE', `/contents/${enc(src.path)}`, {
            message: `Remove ${src.name} after move`, sha: src.sha, branch: state.branch,
        });
    }
    invalidateTree();
}

async function pasteFolder(src, dest, mode) {
    const entries = await getRepoTree();
    const prefix = src.path + '/';
    const blobs = entries.filter(e => e.type === 'blob' && e.path.startsWith(prefix));
    const ref = await api('GET', `/git/ref/heads/${enc(state.branch)}`);

    if (!blobs.length) {
        await api('PUT', `/contents/${enc(joinPath(dest, '.gitkeep'))}`, {
            message: `${mode === 'cut' ? 'Move' : 'Copy'} folder ${src.name}`,
            content: encodeBase64UTF8(''), branch: state.branch,
        });
        return;
    }

    const changes = blobs.map(e => ({
        path: joinPath(dest, e.path.slice(prefix.length)),
        mode: e.mode || '100644', type: 'blob', sha: e.sha,
    }));
    if (mode === 'cut') {
        blobs.forEach(e => changes.push({ path: e.path, mode: e.mode || '100644', type: 'blob', sha: null }));
    }
    await commitTree(changes, `${mode === 'cut' ? 'Move' : 'Copy'} folder ${src.name} → ${dest}`, ref);
}

/* ── delete & undo ─────────────────────────────────────────── */
async function deleteMany(items) {
    if (!items.length) return;
    const dirs = items.filter(i => i.type === 'dir');
    const title = items.length === 1 ? `Delete “${items[0].name}”?` : `Delete ${items.length} items?`;
    const text = items.length === 1
        ? `${items[0].type === 'dir' ? 'The folder and everything inside it' : 'The file'} will be removed in a new commit. You can undo right after.`
        : `${items.length} items (${dirs.length} folder${dirs.length === 1 ? '' : 's'}) will be removed in one commit. You can undo right after.`;
    const ok = await uiConfirm({ title, text, ok: 'Delete', danger: true, icon: '🗑️' });
    if (!ok) return;

    setStatus('Deleting…', 'loading');
    try {
        const entries = await getRepoTree();
        const byPath = new Map(entries.filter(e => e.type === 'blob').map(e => [e.path, e]));
        const doomed = [];
        items.forEach(item => {
            if (item.type === 'dir') {
                entries.forEach(e => {
                    if (e.type === 'blob' && e.path.startsWith(item.path + '/')) doomed.push(e);
                });
            } else {
                const e = byPath.get(item.path);
                doomed.push(e || { path: item.path, sha: item.sha, mode: '100644' });
            }
        });
        const unique = [...new Map(doomed.map(e => [e.path, e])).values()].filter(e => e.sha);
        if (!unique.length) throw new Error('Nothing to delete — the items may already be gone');

        const ref = await api('GET', `/git/ref/heads/${enc(state.branch)}`);
        await commitTree(
            unique.map(e => ({ path: e.path, mode: e.mode || '100644', type: 'blob', sha: null })),
            items.length === 1 ? `Delete ${items[0].path}` : `Delete ${items.length} items`,
            ref
        );

        lastDeletion = { entries: unique, count: unique.length };
        toast(`Deleted ${items.length === 1 ? `“${items[0].name}”` : plural(items.length, 'item')} (${plural(unique.length, 'file')})`, 'ok', {
            action: { label: 'Undo', run: undoDelete },
            ms: 8000,
        });

        selection.clear();
        selectionAnchor = null;
        if (clipboard) {
            const keep = clipboard.items.filter(src =>
                !items.some(item => src.path === item.path || (item.type === 'dir' && src.path.startsWith(item.path + '/')))
            );
            if (!keep.length) { clipboard = null; renderClipboard(); }
        }
        await load(true);
    } catch (err) {
        console.error('Delete error:', err);
        toast('Delete failed: ' + err.message, 'err');
    }
}

async function undoDelete() {
    if (!lastDeletion) return;
    const snapshot = lastDeletion;
    lastDeletion = null;
    try {
        const ref = await api('GET', `/git/refs/heads/${enc(state.branch)}`);
        await commitTree(
            snapshot.entries.map(e => ({ path: e.path, mode: e.mode || '100644', type: 'blob', sha: e.sha })),
            `Restore ${plural(snapshot.count, 'file')} deleted by mistake`,
            ref
        );
        toast(`Restored ${plural(snapshot.count, 'file')}`, 'ok');
        await load(true);
    } catch (err) {
        console.error('Undo error:', err);
        toast('Undo failed: ' + err.message, 'err');
    }
}

/* ── rename & duplicate ────────────────────────────────────── */
async function renameItem(item) {
    const isDir = item.type === 'dir';
    const res = await uiPrompt({
        title: `Rename ${isDir ? 'folder' : 'file'}`,
        sub: item.path,
        label: 'New name',
        value: item.name,
        ok: 'Rename',
        icon: '✏️',
        validate: value => {
            const name = value.trim();
            if (!name) return 'A name is required';
            if (/[\\/]/.test(name)) return 'A name cannot contain “/” or “\\”';
            if (name === item.name) return 'That is already the current name';
            if (name === '.' || name === '..') return 'That name is not allowed';
            return '';
        },
    });
    if (!res) return;
    const newName = res.value.trim();
    const parent = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
    const newPath = joinPath(parent, newName);

    setStatus('Renaming…', 'loading');
    try {
        let taken = false;
        try { await api('GET', `/contents/${enc(newPath)}${refQ()}`); taken = true; }
        catch (err) { if (err.status !== 404) throw err; }
        if (taken) throw new Error(`“${newName}” already exists in this folder`);

        if (isDir) {
            const entries = await getRepoTree();
            const prefix = item.path + '/';
            const blobs = entries.filter(e => e.type === 'blob' && e.path.startsWith(prefix));
            if (!blobs.length) throw new Error('This folder is empty — create a file inside it first');
            const ref = await api('GET', `/git/ref/heads/${enc(state.branch)}`);
            const changes = blobs.map(e => ({
                path: joinPath(newPath, e.path.slice(prefix.length)),
                mode: e.mode || '100644', type: 'blob', sha: e.sha,
            }));
            blobs.forEach(e => changes.push({ path: e.path, mode: e.mode || '100644', type: 'blob', sha: null }));
            await commitTree(changes, `Rename folder ${item.path} → ${newPath}`, ref);
        } else {
            const blob = await api('GET', `/git/blobs/${item.sha}`);
            await api('PUT', `/contents/${enc(newPath)}`, {
                message: `Rename ${item.name} → ${newName}`,
                content: String(blob.content || '').replace(/\n/g, ''),
                branch: state.branch,
            });
            await api('DELETE', `/contents/${enc(item.path)}`, {
                message: `Remove ${item.name} after rename`, sha: item.sha, branch: state.branch,
            });
            invalidateTree();
        }
        toast(`Renamed to “${newName}”`, 'ok');
        await load(true);
    } catch (err) {
        console.error('Rename error:', err);
        toast('Rename failed: ' + err.message, 'err');
    }
}

function copyName(name, isDir) {
    if (isDir) return `${name}-copy`;
    const dot = name.lastIndexOf('.');
    if (dot <= 0) return `${name}-copy`;
    return `${name.slice(0, dot)}-copy${name.slice(dot)}`;
}

async function duplicateItem(item) {
    const isDir = item.type === 'dir';
    const res = await uiPrompt({
        title: `Duplicate ${isDir ? 'folder' : 'file'}`,
        sub: item.path,
        label: 'Name for the copy',
        value: copyName(item.name, isDir),
        ok: 'Duplicate',
        icon: '⧉',
        validate: value => {
            const name = value.trim();
            if (!name) return 'A name is required';
            if (/[\\/]/.test(name)) return 'A name cannot contain “/” or “\\”';
            return '';
        },
    });
    if (!res) return;
    const newName = res.value.trim();
    const parent = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
    const dest = joinPath(parent, newName);

    setStatus('Duplicating…', 'loading');
    try {
        if (isDir) {
            await pasteFolder({ name: item.name, path: item.path, type: 'dir', sha: item.sha }, dest, 'copy');
        } else {
            const data = await api('GET', `/contents/${enc(item.path)}${refQ()}`);
            let content = data.content || '';
            if (!content) {
                const blob = await api('GET', `/git/blobs/${data.sha}`);
                content = blob.content || '';
            }
            await api('PUT', `/contents/${enc(dest)}`, {
                message: `Duplicate ${item.name}`, content, branch: state.branch,
            });
            invalidateTree();
        }
        toast(`Duplicated as “${newName}”`, 'ok');
        await load(true);
    } catch (err) {
        console.error('Duplicate error:', err);
        toast('Duplicate failed: ' + err.message, 'err');
    }
}

/* ── open in a new tab / copy contents ────────────────────── */
/** Base URL of the published GitHub Pages site for the current repo. */
function getPagesBase() {
    // User / organization site: the repository itself is named owner.github.io
    if (state.repo === `${state.owner}.github.io` || state.repo.endsWith('.github.io')) {
        return `https://${state.repo.replace(/\/+$/, '')}`;
    }
    // Project site
    return `https://${state.owner}.github.io/${state.repo}`;
}

/** Live Pages URL for a file or folder (what visitors actually see). */
function pagesUrlFor(item) {
    const base = getPagesBase().replace(/\/+$/, '');
    if (!item || !item.path) return base + '/';
    const clean = String(item.path).replace(/^\/+/, '').replace(/\/+$/, '');
    // Folders get a trailing slash so Pages can serve index.html if present
    if (item.type === 'dir') return `${base}/${clean}/`;
    return `${base}/${clean}`;
}

/**
 * Open the live GitHub Pages URL of the file or folder in a new browser tab.
 * Examples (for meyrahgozar-cell/meyrahgozar-cell):
 *   file.html          → https://meyrahgozar-cell.github.io/file.html
 *   folder/image.png   → https://meyrahgozar-cell.github.io/folder/image.png
 *   folder/            → https://meyrahgozar-cell.github.io/folder/
 */
function openInNewTab(item) {
    if (!item) return;
    try {
        const url = pagesUrlFor(item);
        window.open(url, '_blank', 'noopener');
    } catch (err) {
        console.error('openInNewTab failed:', err);
        toast('Could not build the live page link', 'err');
    }
}

async function copyFileContent(item) {
    if (!item) return;
    setStatus(`Loading ${item.name}…`, 'loading');
    try {
        const res = await fetchRaw(item.path);
        copyToClipboard(await res.text());
        flashStatus('File contents copied', 'ok');
    } catch (err) {
        toast('Copy failed: ' + err.message, 'err');
    }
}

function syncUrl() {
    try {
        const url = new URL(window.location.href);
        if (state.path) url.searchParams.set('path', state.path);
        else url.searchParams.delete('path');
        window.history.replaceState(null, '', url.toString());
    } catch (_) { /* ignore */ }
}

/* ── last-commit dates ────────────────────────────────────── */
const dateCache = new Map();
const dateQueue = [];
let dateActive = 0;
let dateSeq = 0;
let dateStopped = false;

function formatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const day = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${day} · ${time}`;
}

function applyDate(node, iso) {
    if (!node) return;
    node.textContent = iso ? formatDateTime(iso) : '—';
    node.title = iso ? new Date(iso).toLocaleString() : 'No commit date available';
}

function queueDate(item, node) {
    if (!node) return;
    const key = `${state.branch}:${item.path}`;
    if (dateCache.has(key)) { applyDate(node, dateCache.get(key)); return; }
    if (dateStopped) return;
    dateQueue.push({ item, node, key, seq: dateSeq });
    pumpDates();
}

function pumpDates() {
    while (dateActive < 3 && dateQueue.length) {
        const job = dateQueue.shift();
        if (job.seq !== dateSeq) continue;
        dateActive++;
        fetchDate(job).finally(() => { dateActive--; pumpDates(); });
    }
}

async function fetchDate(job) {
    try {
        const list = await api('GET', `/commits?path=${encodeURIComponent(job.item.path)}&sha=${encodeURIComponent(state.branch)}&per_page=1`);
        const entry = Array.isArray(list) ? list[0] : null;
        const commit = entry && entry.commit;
        const iso = commit
            ? (commit.committer && commit.committer.date) || (commit.author && commit.author.date) || null
            : null;
        dateCache.set(job.key, iso);
        if (job.node.isConnected) applyDate(job.node, iso);
        // If the user is sorting by date, re-order once this batch of dates settles
        if ((prefs.sort === 'date-asc' || prefs.sort === 'date-desc') && dateQueue.length === 0 && dateActive <= 1) {
            scheduleDateResort();
        }
    } catch (err) {
        if (err.status === 403 || err.status === 429) {
            dateStopped = true;
            dateQueue.length = 0;
            // Mark remaining visible dates so the user knows why they stayed empty
            document.querySelectorAll('.r-date').forEach(node => {
                if (node.textContent === '—' || node.title.includes('Loading')) {
                    node.textContent = '—';
                    node.title = 'Date unavailable (API rate limit). Try again later.';
                }
            });
            return;
        }
        dateCache.set(job.key, null);
        if (job.node.isConnected) applyDate(job.node, null);
    }
}

let dateResortTimer = 0;
function scheduleDateResort() {
    clearTimeout(dateResortTimer);
    dateResortTimer = setTimeout(() => {
        if (prefs.sort === 'date-asc' || prefs.sort === 'date-desc') renderFiles();
    }, 180);
}

/* ── downloads ─────────────────────────────────────────────── */
async function downloadItem(item) {
    setStatus(`Downloading ${item.name}…`, 'loading');
    try {
        const res = await fetchRaw(item.path);
        const blob = await res.blob();
        saveBlob(blob, item.name);
        flashStatus(`Downloaded ${item.name}`, 'ok');
    } catch (err) {
        toast('Download failed: ' + err.message, 'err');
        throw err;
    }
}

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function fetchBlobBySha(sha) {
    const res = await fetch(apiUrl(`/git/blobs/${sha}`), {
        headers: { Accept: 'application/vnd.github.v3.raw', Authorization: `token ${state.token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} while reading a blob`);
    return res.blob();
}

async function downloadFolder(item) {
    if (typeof JSZip === 'undefined') { toast('Zip library failed to load — check your connection', 'err'); return; }
    setStatus(`Preparing “${item.name}”…`, 'loading');
    try {
        const entries = await getRepoTree();
        const prefix = item.path ? item.path + '/' : '';
        const blobs = entries.filter(e => e.type === 'blob' && e.path.startsWith(prefix));
        if (!blobs.length) throw new Error('This folder contains no files');

        const zip = new JSZip();
        let done = 0;
        for (const entry of blobs) {
            zip.file(entry.path.slice(prefix.length), await fetchBlobBySha(entry.sha));
            done++;
            setStatus(`Zipping ${done}/${blobs.length}…`, 'loading');
        }
        const out = await zip.generateAsync({ type: 'blob' }, meta => {
            setStatus(`Compressing ${Math.round(meta.percent)}%…`, 'loading');
        });
        saveBlob(out, `${item.name || state.repo}.zip`);
        flashStatus(`Downloaded ${item.name || state.repo}.zip (${plural(blobs.length, 'file')})`, 'ok');
    } catch (err) {
        toast('Folder download failed: ' + err.message, 'err');
    }
}

async function downloadSelection() {
    if (!selection.size) return;
    if (typeof JSZip === 'undefined') { toast('Zip library failed to load — check your connection', 'err'); return; }
    const items = displayed.filter(i => selection.has(i.path));
    if (!items.length) return;

    const button = $('selDownload');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '⏳ Zipping…';

    try {
        const entries = await getRepoTree();
        const zip = new JSZip();
        let added = 0;
        for (const item of items) {
            if (item.type === 'file') {
                zip.file(item.name, await fetchBlobBySha(item.sha));
                added++;
            } else {
                const prefix = item.path + '/';
                for (const entry of entries.filter(e => e.type === 'blob' && e.path.startsWith(prefix))) {
                    zip.file(`${item.name}/${entry.path.slice(prefix.length)}`, await fetchBlobBySha(entry.sha));
                    added++;
                }
            }
            setStatus(`Zipping ${added} file${added === 1 ? '' : 's'}…`, 'loading');
        }
        const out = await zip.generateAsync({ type: 'blob' }, meta => {
            setStatus(`Compressing ${Math.round(meta.percent)}%…`, 'loading');
        });
        const name = items.length === 1
            ? (items[0].type === 'dir' ? items[0].name + '.zip' : items[0].name.replace(/\.[^.]+$/, '') + '.zip')
            : `selection-${items.length}-items.zip`;
        saveBlob(out, name);
        flashStatus(`Downloaded ${name} (${plural(added, 'file')})`, 'ok');
    } catch (err) {
        console.error('Selection zip error:', err);
        toast('ZIP failed: ' + err.message, 'err');
    } finally {
        button.disabled = false;
        button.textContent = label;
    }
}

/* ── uploads ──────────────────────────────────────────────── */
const MAX_UPLOAD = 100 * 1024 * 1024;
const SETTLED = ['done', 'error', 'cancelled'];
const uploads = [];
let uploadId = 0;
let pumping = false;
let hideTimer = null;

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
    });
}

const isZipFile = file => /\.zip$/i.test(file.name);

function safeZipPath(path) {
    const parts = String(path).replace(/\\/g, '/').split('/').filter(seg => seg && seg !== '.');
    if (parts.some(seg => seg === '..')) return null;
    return parts.join('/');
}

function shouldSkipZipEntry(path) {
    if (!path) return true;
    if (path.startsWith('__MACOSX/')) return true;
    if (/(^|\/)\.DS_Store$/.test(path)) return true;
    if (/(^|\/)\._/.test(path)) return true;
    if (/(^|\/)Thumbs\.db$/i.test(path)) return true;
    return false;
}

async function uploadEntries(entries) {
    if (!entries.length) return;
    if (document.querySelector('.overlay.open')) return;

    if (!state.connected) { toast('Connect a repository first', 'err'); return; }

    const useFormatted = prefs.formatted;
    const batch = [];

    for (const entry of entries) {
        const { file, rel = '' } = entry;
        if (isZipFile(file) && !rel) {
            const plan = await openZipWizard(file);
            if (!plan) continue;
            batch.push({ file, rel, plan });
        } else {
            batch.push({ file, rel, plan: { mode: 'keep' } });
        }
    }
    if (!batch.length) return;

    clearTimeout(hideTimer);
    if (!pumping) {
        uploads.length = 0;
        upList.innerHTML = '';
    }

    batch.forEach(({ file, rel, plan }) => {
        const item = {
            id: ++uploadId, file, rel, plan,
            dir: state.path,
            status: 'queued', fraction: 0, speed: 0, error: '',
            cancelled: false, xhr: null, el: null, targetPath: null, custom: null,
        };
        if (plan.mode === 'keep') {
            if (rel) item.targetPath = joinPath(item.dir, rel);
            else if (useFormatted) {
                const parsed = parseFormattedName(file.name);
                if (parsed) item.targetPath = joinPath(item.dir, parsed.folder, parsed.fileName);
            }
        }
        item.el = buildUploadRow(item);
        uploads.push(item);
        upList.appendChild(item.el.row);
        renderUploadRow(item);
    });

    upPanel.classList.add('show');
    upPanel.classList.remove('collapsed');
    renderUploadSummary();
    if (!pumping) pump();
}

async function pump() {
    pumping = true;
    try {
        let next;
        while ((next = uploads.find(u => u.status === 'queued'))) {
            await uploadOne(next);
        }
    } finally {
        pumping = false;
    }
    finishBatch();
}

async function uploadOne(u) {
    if (u.plan && u.plan.mode === 'extract') return uploadZipExtract(u);

    const { file } = u;
    const cancelled = () => Object.assign(new Error('Cancelled'), { cancelled: true });
    try {
        if (file.size > MAX_UPLOAD) throw new Error('Larger than GitHub’s 100 MB file limit');
        setUpload(u, 'preparing');
        const base64 = await fileToBase64(file);
        if (u.cancelled) throw cancelled();

        const path = u.targetPath || joinPath(u.dir, file.name);
        let sha;
        try {
            const existing = await api('GET', `/contents/${enc(path)}${refQ()}`);
            if (existing && !Array.isArray(existing)) sha = existing.sha;
        } catch (err) {
            if (err.status !== 404) throw err;
        }
        if (u.cancelled) throw cancelled();

        setUpload(u, 'uploading');
        const started = performance.now();
        await xhrPut(`/contents/${enc(path)}`, {
            message: `Upload ${file.name}`, content: base64, sha, branch: state.branch,
        }, u, (fraction, loaded) => {
            if (u.status === 'committing') return;
            u.fraction = fraction;
            const seconds = (performance.now() - started) / 1000;
            if (seconds > 0.3) u.speed = loaded / seconds;
            if (fraction >= 1) setUpload(u, 'committing');
            else { renderUploadRow(u); renderUploadSummary(); }
        });

        u.fraction = 1;
        invalidateTree();
        setUpload(u, 'done');
    } catch (err) {
        if (err.cancelled || u.cancelled) setUpload(u, 'cancelled');
        else {
            console.error('Upload error:', err);
            u.error = err.message;
            setUpload(u, 'error');
        }
    } finally {
        u.xhr = null;
    }
}

function xhrPut(path, body, u, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        u.xhr = xhr;
        xhr.open('PUT', apiUrl(path));
        xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');
        xhr.setRequestHeader('Authorization', `token ${state.token}`);
        xhr.setRequestHeader('Content-Type', 'application/json');

        let lastLoaded = 0;
        xhr.upload.onprogress = e => {
            if (!e.lengthComputable) return;
            lastLoaded = e.loaded;
            onProgress(e.loaded / e.total, e.loaded);
        };
        xhr.upload.onload = () => onProgress(1, lastLoaded);
        xhr.onload = () => {
            let data = {};
            try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) { /* ignore */ }
            if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
            const err = new Error(data.message || `HTTP ${xhr.status}`);
            err.status = xhr.status;
            reject(err);
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.onabort = () => reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
        xhr.send(JSON.stringify(body));
    });
}

async function uploadZipExtract(u) {
    const plan = u.plan;
    const cancelled = () => Object.assign(new Error('Cancelled'), { cancelled: true });
    const total = plan.files.length + (plan.keepZip ? 1 : 0);
    const log = (msg, ...args) => {
        console.log(`[zip-extract] ${u.file.name}: ${msg}`, ...args);
    };

    try {
        if (typeof JSZip === 'undefined') throw new Error('Zip library failed to load');
        setUpload(u, 'preparing');
        u.custom = { msg: 'Reading archive…', pct: '', size: formatSize(u.file.size) };
        renderUploadRow(u);
        log('preparing — reading archive (%s)', formatSize(u.file.size));

        let zip;
        try { zip = await JSZip.loadAsync(u.file); }
        catch (_) { throw new Error('Not a valid zip file'); }
        if (u.cancelled) throw cancelled();

        const existing = plan.existing || new Set();
        const pairs = plan.files
            .map(rel => ({ rel, entry: zip.file(rel) }))
            .filter(pair => pair.entry)
            .map(pair => ({ ...pair, dest: zipDestination(plan, pair.rel) }))
            .filter(pair => !(plan.conflict === 'skip' && existing.has(pair.dest)));

        log('plan ready — %d of %d selected files will be uploaded (keepZip=%s, conflict=%s, baseDir=%s)',
            pairs.length, plan.files.length, !!plan.keepZip, plan.conflict || 'overwrite', plan.baseDir || '/');

        if (!pairs.length && !plan.keepZip) {
            u.custom = { msg: 'Everything was skipped', pct: '100%', size: formatSize(u.file.size) };
            renderUploadRow(u);
            u.fraction = 1;
            delete u.custom;
            setUpload(u, 'done');
            log('nothing to upload (all skipped)');
            return;
        }

        const ref = await api('GET', `/git/ref/heads/${enc(state.branch)}`);
        const headSha = ref.object.sha;
        const headCommit = await api('GET', `/git/commits/${headSha}`);
        const baseTree = headCommit.tree.sha;
        const treeEntries = [];
        let done = 0;
        let uploadedBytes = 0;

        setUpload(u, 'uploading');
        log('starting blob uploads against tree %s', baseTree);

        for (const pair of pairs) {
            if (u.cancelled) throw cancelled();
            const base64 = await pair.entry.async('base64');
            const entrySize = pair.entry._data ? pair.entry._data.uncompressedSize : 0;
            const blob = await api('POST', '/git/blobs', { content: base64, encoding: 'base64' });
            treeEntries.push({ path: pair.dest, mode: '100644', type: 'blob', sha: blob.sha });
            done++;
            uploadedBytes += entrySize || 0;
            u.fraction = done / total;
            u.custom = {
                msg: `Extracting ${done}/${pairs.length} · ${pair.rel} → ${pair.dest}`,
                pct: Math.floor((done / total) * 100) + '%',
                size: formatSize(u.file.size),
            };
            renderUploadRow(u);
            renderUploadSummary();
            log('blob %d/%d  %s → %s  (sha %s)', done, pairs.length, pair.rel, pair.dest, blob.sha.slice(0, 7));
        }

        if (plan.keepZip) {
            if (u.cancelled) throw cancelled();
            const base64 = await fileToBase64(u.file);
            const blob = await api('POST', '/git/blobs', { content: base64, encoding: 'base64' });
            const zipDest = joinPath(plan.baseDir, u.file.name);
            treeEntries.push({
                path: zipDest,
                mode: '100644', type: 'blob', sha: blob.sha,
            });
            done++;
            u.fraction = done / total;
            u.custom = {
                msg: `Keeping archive · ${u.file.name}`,
                pct: Math.floor((done / total) * 100) + '%',
                size: formatSize(u.file.size),
            };
            renderUploadRow(u);
            log('kept original zip as %s (sha %s)', zipDest, blob.sha.slice(0, 7));
        }

        u.custom = { msg: `Committing ${pairs.length} file${pairs.length === 1 ? '' : 's'}…`, pct: '100%', size: formatSize(u.file.size) };
        setUpload(u, 'committing');
        log('creating tree with %d entries and committing', treeEntries.length);

        const newTree = await api('POST', '/git/trees', { base_tree: baseTree, tree: treeEntries });
        const commit = await api('POST', '/git/commits', {
            message: `Extract ${u.file.name} (${pairs.length} file${pairs.length === 1 ? '' : 's'})`,
            tree: newTree.sha,
            parents: [headSha],
        });
        await api('PATCH', `/git/refs/heads/${enc(state.branch)}`, { sha: commit.sha });
        invalidateTree();

        u.fraction = 1;
        delete u.custom;
        setUpload(u, 'done');
        log('done — commit %s on %s', commit.sha.slice(0, 7), state.branch);
    } catch (err) {
        delete u.custom;
        if (err.cancelled || u.cancelled) {
            setUpload(u, 'cancelled');
            log('cancelled by user');
        } else {
            console.error('[zip-extract] error:', err);
            u.error = err.message;
            setUpload(u, 'error');
        }
    }
}

function zipDestination(plan, relPath) {
    let rel = relPath;
    if (plan.stripPrefix && rel.startsWith(plan.stripPrefix + '/')) rel = rel.slice(plan.stripPrefix.length + 1);
    if (plan.flatten) rel = rel.split('/').pop();
    return joinPath(plan.baseDir, rel);
}

function cancelUpload(u) {
    if (SETTLED.includes(u.status) || u.status === 'committing') return;
    u.cancelled = true;
    if (u.status === 'queued') setUpload(u, 'cancelled');
    else if (u.status === 'uploading' && u.xhr) u.xhr.abort();
}

function setUpload(u, status) {
    u.status = status;
    renderUploadRow(u);
    renderUploadSummary();
}

function buildUploadRow(u) {
    const row = document.createElement('div');
    row.className = 'up-item';
    row.innerHTML = `
        <div class="up-ico"></div>
        <div class="up-main">
            <div class="up-line"><span class="up-name"></span><span class="up-pct"></span></div>
            <div class="up-target-line"><span class="up-target"></span></div>
            <div class="up-track"><i></i></div>
            <div class="up-line up-meta"><span class="up-st"></span><span class="up-sz"></span></div>
        </div>
        <button type="button" class="up-x" title="Cancel this upload">✕</button>`;
    row.querySelector('.up-ico').textContent = u.plan && u.plan.mode === 'extract' ? '📦' : getFileIcon(u.file.name, false);
    const name = row.querySelector('.up-name');
    name.textContent = u.rel ? u.rel : u.file.name;
    name.title = u.rel || u.file.name;
    row.querySelector('.up-x').onclick = () => cancelUpload(u);
    return {
        row,
        bar: row.querySelector('.up-track i'),
        pct: row.querySelector('.up-pct'),
        st: row.querySelector('.up-st'),
        sz: row.querySelector('.up-sz'),
        targetLine: row.querySelector('.up-target-line'),
        target: row.querySelector('.up-target'),
    };
}

function renderUploadRow(u) {
    const r = u.el;
    if (!r) return;
    const progress = u.status === 'done' ? 1 : u.fraction;
    r.row.dataset.status = u.status;
    r.bar.style.width = (progress * 100).toFixed(1) + '%';

    const target = u.plan && u.plan.mode === 'extract' ? planSummary(u.plan) : u.targetPath;
    if (target) {
        r.targetLine.classList.add('show');
        r.target.textContent = target;
        r.target.title = target;
    } else {
        r.targetLine.classList.remove('show');
    }

    if (u.custom) {
        r.pct.textContent = u.custom.pct || '';
        r.st.textContent = u.custom.msg || '';
        r.st.title = r.st.textContent;
        r.sz.textContent = u.custom.size || formatSize(u.file.size);
        return;
    }

    r.sz.textContent = u.status === 'uploading'
        ? `${formatSize(u.file.size * progress)} / ${formatSize(u.file.size)}`
        : formatSize(u.file.size);

    let pct = '';
    let label = '';
    switch (u.status) {
        case 'queued': label = 'Waiting…'; break;
        case 'preparing': label = 'Preparing…'; break;
        case 'uploading':
            pct = Math.floor(progress * 100) + '%';
            label = u.speed ? `${formatSize(u.speed)}/s` : 'Uploading…';
            break;
        case 'committing': pct = '100%'; label = 'Committing to GitHub…'; break;
        case 'done':
            pct = '✓';
            label = u.plan && u.plan.mode === 'extract' ? 'Extracted & uploaded' : 'Uploaded';
            break;
        case 'error': pct = '✕'; label = u.error || 'Failed'; break;
        case 'cancelled': label = 'Cancelled'; break;
    }
    r.pct.textContent = pct;
    r.st.textContent = label;
    r.st.title = label;
}

function planSummary(plan) {
    const base = plan.baseDir ? '/' + plan.baseDir + '/' : '/';
    const opts = [];
    if (plan.stripPrefix) opts.push('strip root');
    if (plan.flatten) opts.push('flatten');
    if (plan.keepZip) opts.push('keep .zip');
    if (plan.conflict && plan.conflict !== 'overwrite') opts.push(plan.conflict);
    const extra = opts.length ? ' · ' + opts.join(', ') : '';
    return `→ ${base} · ${plural(plan.files.length, 'file')}${extra}`;
}

function renderUploadSummary() {
    const total = uploads.length;
    if (!total) return;
    const count = status => uploads.filter(u => u.status === status).length;
    const done = count('done'), failed = count('error'), cancelled = count('cancelled');
    const settled = done + failed + cancelled;
    const active = settled < total;

    const weight = u => Math.max(u.file.size, 1);
    const totalWeight = uploads.reduce((sum, u) => sum + weight(u), 0);
    const finishedWeight = uploads.reduce((sum, u) => sum + weight(u) * (SETTLED.includes(u.status) ? 1 : u.fraction), 0);
    const pct = Math.min(100, Math.round((finishedWeight / totalWeight) * 100));

    upBar.style.width = pct + '%';
    upOverall.setAttribute('aria-valuenow', pct);
    upPanel.dataset.state = active ? 'active' : failed ? 'error' : done ? 'done' : 'cancelled';
    upRetry.hidden = failed === 0;

    if (active) {
        upTitle.textContent = total === 1 ? 'Uploading 1 file' : `Uploading ${settled + 1} of ${total}`;
        const current = uploads.find(u => u.status === 'uploading');
        upSummary.textContent = pct + '%' + (current && current.speed ? ` · ${formatSize(current.speed)}/s` : '');
        setStatus(`Uploading… ${pct}%`, 'loading');
    } else {
        if (failed) upTitle.textContent = `${done} uploaded · ${failed} failed`;
        else if (!done) upTitle.textContent = 'Upload cancelled';
        else if (cancelled) upTitle.textContent = `${done} uploaded · ${cancelled} cancelled`;
        else upTitle.textContent = `Uploaded ${plural(done, 'file')}`;
        upSummary.textContent = `${plural(total, 'file')} · ${formatSize(uploads.reduce((sum, u) => sum + u.file.size, 0))}`;
    }
}

function finishBatch() {
    renderUploadSummary();
    const count = status => uploads.filter(u => u.status === status).length;
    const done = count('done'), failed = count('error'), cancelled = count('cancelled');

    if (state.connected) load(true);
    flashStatus(
        failed ? `Upload finished (${done} ok, ${failed} failed)`
            : cancelled ? `Upload stopped (${done} uploaded)`
                : 'Upload complete',
        failed ? 'err' : 'ok'
    );
    if (!failed) {
        hideTimer = setTimeout(() => { if (!pumping) upPanel.classList.remove('show'); }, cancelled ? 2500 : 4500);
    }
}

function retryFailed() {
    const failed = uploads.filter(u => u.status === 'error');
    if (!failed.length) return;
    failed.forEach(u => {
        u.error = '';
        u.fraction = 0;
        u.cancelled = false;
        setUpload(u, 'queued');
    });
    upPanel.classList.add('show');
    if (!pumping) pump();
}

/* ── ZIP wizard ───────────────────────────────────────────── */
let zipState = null;

function openZipWizard(file) {
    return new Promise(resolve => {
        const st = {
            file, resolve, entries: [], byPath: new Map(), root: null,
            selected: new Set(), expanded: new Set(), existing: new Set(),
            stripPrefix: '', busy: true,
        };
        zipState = st;

        $('zipTitle').textContent = file.name;
        $('zipSubtitle').textContent = formatSize(file.size);
        $('zipTarget').value = '';
        $('zipTargetPrefix').textContent = '/' + (state.path ? state.path + '/' : '');
        $('zipStrip').checked = false;
        $('zipFlatten').checked = false;
        $('zipKeepZip').checked = false;
        $('zipConflict').value = 'overwrite';
        $('zipSearch').value = '';
        $('zipTree').innerHTML = '<div class="zip-loading">Reading archive…</div>';
        $('zipSummary').textContent = 'Reading…';
        $('zipSizeSum').textContent = '';
        $('zipConflictNote').textContent = '';
        $('zipFootHint').textContent = 'Reading archive…';
        $('zipExtract').disabled = true;
        $('zipAsIs').disabled = true;
        $('zipExtract').textContent = 'Extract selected';

        openOverlay($('zipOverlay'));

        (async () => {
            let zip;
            try {
                zip = await JSZip.loadAsync(file);
            } catch (_) {
                toast('That file is not a valid .zip archive', 'err');
                zipFinish(null);
                return;
            }
            if (zipState !== st) return;

            const entries = [];
            zip.forEach((relPath, entry) => {
                if (entry.dir) return;
                const safe = safeZipPath(relPath);
                if (!safe || shouldSkipZipEntry(safe)) return;
                const size = (entry._data && entry._data.uncompressedSize) || 0;
                entries.push({ path: safe, size, entry });
            });

            if (!entries.length) {
                toast('This archive has no usable files', 'err');
                zipFinish(null);
                return;
            }

            st.entries = entries;
            st.root = buildZipTree(entries);
            st.byPath = st.root.byPath;
            st.stripPrefix = zipCommonRoot(entries);
            entries.forEach(e => st.selected.add(e.path));
            [...st.root.children.values()].forEach(child => st.expanded.add(child.path));

            $('zipStrip').checked = !!st.stripPrefix;
            $('zipStripWrap').hidden = !st.stripPrefix;
            $('zipStripLabel').textContent = st.stripPrefix ? `(${st.stripPrefix}/)` : '';

            try {
                const repoEntries = await getRepoTree();
                st.existing = new Set(repoEntries.filter(e => e.type === 'blob').map(e => e.path));
            } catch (err) {
                console.warn('Could not read existing paths:', err.message);
            }
            if (zipState !== st) return;

            st.busy = false;
            $('zipAsIs').disabled = false;
            renderZipTree();
            updateZipSummary();
        })();
    });
}

function zipFinish(result) {
    const st = zipState;
    zipState = null;
    closeOverlay($('zipOverlay'));
    $('zipTree').innerHTML = '';
    if (st && st.resolve) st.resolve(result);
}

function buildZipTree(entries) {
    const root = { name: '', path: '', dir: true, children: new Map(), files: [] };
    const byPath = new Map();
    byPath.set('', root);

    entries.forEach(entry => {
        const parts = entry.path.split('/');
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const name = parts[i];
            let child = node.children.get(name);
            if (!child) {
                child = {
                    name,
                    path: parts.slice(0, i + 1).join('/'),
                    dir: true, children: new Map(), files: [], size: 0,
                };
                node.children.set(name, child);
                byPath.set(child.path, child);
            }
            node = child;
        }
        const fileNode = {
            name: parts[parts.length - 1],
            path: entry.path,
            dir: false,
            size: entry.size,
            entry: entry.entry,
        };
        node.files.push(fileNode);
        byPath.set(fileNode.path, fileNode);
        entry.node = fileNode;
    });

    const sort = node => {
        node.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        [...node.children.values()].forEach(sort);
    };
    sort(root);

    return Object.assign(root, { byPath });
}

function collectZipFiles(node, out = []) {
    node.files.forEach(file => out.push(file));
    node.children.forEach(child => collectZipFiles(child, out));
    return out;
}

function zipCommonRoot(entries) {
    if (!entries.length) return '';
    const split = entries.map(e => e.path.split('/'));
    const first = split[0];
    const prefix = [];
    for (let i = 0; i < first.length - 1; i++) {
        const segment = first[i];
        if (split.every(parts => parts.length > i + 1 && parts[i] === segment)) prefix.push(segment);
        else break;
    }
    return prefix.join('/');
}

function zipCheckState(node) {
    const st = zipState;
    if (!st) return 'off';
    if (!node.dir) return st.selected.has(node.path) ? 'on' : 'off';
    const files = collectZipFiles(node);
    if (!files.length) return 'off';
    const selected = files.filter(file => st.selected.has(file.path)).length;
    return selected === 0 ? 'off' : selected === files.length ? 'on' : 'mixed';
}

function zipRow(node, depth, flat) {
    const st = zipState;
    const row = document.createElement('div');
    row.className = 'zt-row';
    row.dataset.path = node.path;
    row.dataset.dir = node.dir ? '1' : '0';
    row.style.setProperty('--d', Math.min(depth, 10));

    const caret = document.createElement('button');
    caret.type = 'button';
    caret.className = 'zt-caret' + (node.dir ? '' : ' leaf') + (st.expanded.has(node.path) ? ' open' : '');
    caret.textContent = '▶';
    caret.tabIndex = -1;

    const check = document.createElement('span');
    check.className = 'zt-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.tabIndex = -1;
    const checkState = zipCheckState(node);
    input.checked = checkState === 'on';
    input.indeterminate = checkState === 'mixed';
    check.appendChild(input);

    const icon = document.createElement('span');
    icon.className = 'zt-ico';
    icon.textContent = node.dir ? (st.expanded.has(node.path) ? '📂' : '📁') : getFileIcon(node.name, false);

    const name = document.createElement('span');
    name.className = 'zt-name';
    if (flat) {
        const slash = node.path.lastIndexOf('/');
        name.innerHTML = escapeHtml(node.name) + (slash > 0 ? ` <span class="dirpath">${escapeHtml(node.path.slice(0, slash))}/</span>` : '');
    } else {
        name.textContent = node.name;
        name.title = node.path;
    }

    const size = document.createElement('span');
    size.className = 'zt-size';
    if (node.dir) {
        const count = collectZipFiles(node).length;
        size.textContent = plural(count, 'file');
    } else {
        size.textContent = node.size ? formatSize(node.size) : '';
    }

    row.append(caret, check, icon, name, size);
    return row;
}

function renderZipTree() {
    const st = zipState;
    if (!st || !st.root) return;
    const tree = $('zipTree');
    const scroll = tree.scrollTop;
    const query = $('zipSearch').value.trim().toLowerCase();
    tree.innerHTML = '';

    if (query) {
        const hits = st.entries.filter(e => e.path.toLowerCase().includes(query)).slice(0, 600);
        if (!hits.length) {
            tree.innerHTML = '<div class="zt-empty">No files in this archive match that filter.</div>';
            return;
        }
        hits.forEach(entry => tree.appendChild(zipRow(entry.node, entry.path.split('/').length - 1, true)));
    } else {
        const walk = (node, depth) => {
            node.children.forEach(child => {
                tree.appendChild(zipRow(child, depth, false));
                if (st.expanded.has(child.path)) walk(child, depth + 1);
            });
            node.files.forEach(file => tree.appendChild(zipRow(file, depth, false)));
        };
        walk(st.root, 0);
    }
    tree.scrollTop = scroll;
}

function syncZipChecks() {
    const st = zipState;
    if (!st) return;
    $('zipTree').querySelectorAll('.zt-row').forEach(row => {
        const node = st.byPath.get(row.dataset.path);
        const input = row.querySelector('input');
        if (!node || !input) return;
        const checkState = zipCheckState(node);
        input.checked = checkState === 'on';
        input.indeterminate = checkState === 'mixed';
    });
}

function toggleZipNode(node) {
    const st = zipState;
    const files = node.dir ? collectZipFiles(node) : [node];
    const allSelected = files.every(file => st.selected.has(file.path));
    files.forEach(file => {
        if (allSelected) st.selected.delete(file.path);
        else st.selected.add(file.path);
    });
}

function zipBaseDir() {
    const target = normalizeRel($('zipTarget').value);
    return target ? joinPath(state.path, target) : state.path;
}

function zipDestPreview(relPath) {
    const st = zipState;
    let rel = relPath;
    if (st.stripPrefix && $('zipStrip').checked && rel.startsWith(st.stripPrefix + '/')) {
        rel = rel.slice(st.stripPrefix.length + 1);
    }
    if ($('zipFlatten').checked) rel = rel.split('/').pop();
    return joinPath(zipBaseDir(), rel);
}

function updateZipSummary() {
    const st = zipState;
    if (!st || st.busy) return;
    const selectedFiles = st.entries.filter(e => st.selected.has(e.path));
    const size = selectedFiles.reduce((sum, e) => sum + (e.size || 0), 0);
    const conflicts = selectedFiles.filter(e => st.existing.has(zipDestPreview(e.path))).length;

    $('zipSummary').textContent = `${selectedFiles.length} of ${plural(st.entries.length, 'file')} selected`;
    $('zipSizeSum').textContent = size ? formatSize(size) : '';
    $('zipConflictNote').textContent = conflicts
        ? `${plural(conflicts, 'file')} already exist${conflicts === 1 ? 's' : ''}`
        : '';
    $('zipConflictNote').style.color = conflicts ? 'var(--warn)' : '';

    const button = $('zipExtract');
    button.disabled = selectedFiles.length === 0;
    button.textContent = selectedFiles.length ? `Extract ${plural(selectedFiles.length, 'file')}` : 'Extract selected';

    const base = zipBaseDir();
    $('zipFootHint').textContent = selectedFiles.length
        ? `→ /${base ? base + '/' : ''}`
        : 'Nothing selected yet';
}

function initZipWizard() {
    $('zipClose').onclick = () => zipFinish(null);
    $('zipCancel').onclick = () => zipFinish(null);
    $('zipAsIs').onclick = () => zipFinish({ mode: 'keep' });
    $('zipExtract').onclick = () => {
        if (!zipState) return;
        const files = [...zipState.selected];
        if (!files.length) { toast('Select at least one file to extract', 'warn'); return; }
        zipFinish({
            mode: 'extract',
            files,
            baseDir: zipBaseDir(),
            stripPrefix: $('zipStrip').checked ? zipState.stripPrefix : '',
            flatten: $('zipFlatten').checked,
            keepZip: $('zipKeepZip').checked,
            conflict: $('zipConflict').value,
            existing: zipState.existing,
        });
    };

    $('zipSearch').addEventListener('input', renderZipTree);
    $('zipSelectAll').onclick = () => {
        if (!zipState) return;
        zipState.selected = new Set(zipState.entries.map(e => e.path));
        renderZipTree();
        updateZipSummary();
    };
    $('zipSelectNone').onclick = () => {
        if (!zipState) return;
        zipState.selected.clear();
        renderZipTree();
        updateZipSummary();
    };
    $('zipSelectInvert').onclick = () => {
        if (!zipState) return;
        const next = new Set();
        zipState.entries.forEach(e => { if (!zipState.selected.has(e.path)) next.add(e.path); });
        zipState.selected = next;
        renderZipTree();
        updateZipSummary();
    };
    $('zipExpandAll').onclick = () => {
        if (!zipState) return;
        zipState.entries.forEach(e => {
            const parts = e.path.split('/');
            for (let i = 1; i < parts.length; i++) zipState.expanded.add(parts.slice(0, i).join('/'));
        });
        renderZipTree();
    };
    $('zipCollapseAll').onclick = () => {
        if (!zipState) return;
        zipState.expanded.clear();
        renderZipTree();
    };

    $('zipTree').addEventListener('click', e => {
        if (!zipState || !zipState.root) return;
        const row = e.target.closest('.zt-row');
        if (!row) return;
        const node = zipState.byPath.get(row.dataset.path);
        if (!node) return;

        if (e.target.closest('.zt-caret')) {
            if (!node.dir) return;
            if (zipState.expanded.has(node.path)) zipState.expanded.delete(node.path);
            else zipState.expanded.add(node.path);
            renderZipTree();
            return;
        }
        if (e.target.tagName === 'INPUT') return;
        toggleZipNode(node);
        syncZipChecks();
        updateZipSummary();
    });

    $('zipTree').addEventListener('change', e => {
        if (!zipState) return;
        const input = e.target;
        if (input.tagName !== 'INPUT') return;
        const row = input.closest('.zt-row');
        const node = row && zipState.byPath.get(row.dataset.path);
        if (!node) return;
        const files = node.dir ? collectZipFiles(node) : [node];
        files.forEach(file => {
            if (input.checked) zipState.selected.add(file.path);
            else zipState.selected.delete(file.path);
        });
        syncZipChecks();
        updateZipSummary();
    });

    ['zipTarget', 'zipStrip', 'zipFlatten', 'zipConflict'].forEach(id => {
        const node = $(id);
        node.addEventListener('input', updateZipSummary);
        node.addEventListener('change', updateZipSummary);
    });

    onEscape($('zipOverlay'), () => zipFinish(null));
}

/* ── editor ───────────────────────────────────────────────── */
async function openFile(item) {
    if (!isTextFile(item.name)) {
        if (previewKind(item.name)) { previewItem(item); return; }
        if (item.download_url) window.open(item.download_url, '_blank', 'noopener');
        else toast('This file type cannot be edited here — use Download', 'warn');
        return;
    }

    setEditorStatus('Loading…', 'loading');
    try {
        const data = await api('GET', `/contents/${enc(item.path)}${refQ()}`);
        let base64 = data.content || '';
        if (!base64 && data.size > 0) {
            const blob = await api('GET', `/git/blobs/${data.sha}`);
            base64 = blob.content || '';
        }
        const content = decodeBase64UTF8(base64);
        editorFile = {
            path: item.path,
            sha: data.sha,
            name: item.name,
            savedContent: content,
        };
        openEditor(content);
        setEditorStatus('● saved', 'saved');
    } catch (err) {
        console.error('Open file error:', err);
        toast('Failed to load file: ' + err.message, 'err');
        setEditorStatus('✕ error', 'error');
    }
}

function openEditor(content) {
    edIcon.textContent = getFileIcon(editorFile.name, false);
    edFileName.textContent = editorFile.name;
    edFilePath.textContent = editorFile.path;

    if (cm) { cm.toTextArea(); cm = null; }
    edBody.innerHTML = '';

    const textarea = document.createElement('textarea');
    textarea.value = content;
    edBody.appendChild(textarea);

    cm = CodeMirror.fromTextArea(textarea, {
        mode: getCodeMirrorMode(editorFile.name),
        theme: 'material-darker',
        lineNumbers: true,
        lineWrapping: true,
        indentUnit: 2,
        tabSize: 2,
        indentWithTabs: false,
        matchBrackets: true,
        autoCloseBrackets: true,
        styleActiveLine: true,
        extraKeys: {
            'Ctrl-S': () => saveFile(),
            'Cmd-S': () => saveFile(),
            'Ctrl-F': 'findPersistent',
            'Cmd-F': 'findPersistent',
        },
    });

    setTimeout(() => cm && cm.refresh(), 40);
    setTimeout(() => cm && cm.refresh(), 220);

    cm.on('change', () => {
        const current = cm.getValue();
        const dirty = current !== editorFile.savedContent;
        setEditorStatus(dirty ? '● unsaved' : '● saved', dirty ? 'dirty' : 'saved');
        updateEditorInfo();
    });

    updateEditorInfo();
    edOverlay.classList.add('open');
    document.body.classList.add('modal-open');
    cm.focus();
}

function closeEditor() {
    if (editorFile && cm && cm.getValue() !== editorFile.savedContent) {
        uiConfirm({
            title: 'Discard unsaved changes?',
            text: `“${editorFile.name}” has edits that were never saved. Closing now loses them.`,
            ok: 'Discard', danger: true, icon: '⚠️',
        }).then(ok => { if (ok) forceCloseEditor(); });
        return;
    }
    forceCloseEditor();
}

function forceCloseEditor() {
    edOverlay.classList.remove('open');
    if (!document.querySelector('.overlay.open')) document.body.classList.remove('modal-open');
    if (cm) { cm.toTextArea(); cm = null; }
    editorFile = null;
    edBody.innerHTML = '';
}

function setEditorStatus(text, type) {
    edStatus.textContent = text;
    edStatus.className = 'editor-status' + (type ? ' ' + type : '');
}

function updateEditorInfo() {
    if (!cm) return;
    const content = cm.getValue();
    edLines.textContent = content.split('\n').length;
    edSize.textContent = formatSize(new Blob([content]).size);
}

async function saveFile() {
    if (!editorFile || !cm) return;
    const content = cm.getValue();
    if (content === editorFile.savedContent) {
        setEditorStatus('● no changes', 'saved');
        return;
    }
    edSave.disabled = true;
    setEditorStatus('Saving…', 'loading');
    try {
        const result = await api('PUT', `/contents/${enc(editorFile.path)}`, {
            message: `Update ${editorFile.name}`,
            content: encodeBase64UTF8(content),
            sha: editorFile.sha,
            branch: state.branch,
        });
        editorFile.savedContent = content;
        if (result && result.content && result.content.sha) editorFile.sha = result.content.sha;
        else {
            const data = await api('GET', `/contents/${enc(editorFile.path)}${refQ()}`);
            editorFile.sha = data.sha;
        }
        setEditorStatus('● saved ✓', 'saved');
        invalidateTree();
        toast(`Saved ${editorFile.name}`, 'ok', { ms: 1800 });
        load(true);
    } catch (err) {
        console.error('Save error:', err);
        setEditorStatus('✕ save failed', 'error');
        toast('Save failed: ' + err.message, 'err');
    } finally {
        edSave.disabled = false;
    }
}

/* ── formatted filenames ──────────────────────────────────── */
function parseFormattedName(name) {
    if (!name || !name.includes('_')) return null;
    const parts = name.split('_').map(part => part.trim()).filter(part => part && part !== '.' && part !== '..');
    if (parts.length < 2) return null;
    const fileName = parts.pop();
    if (!fileName) return null;
    const folder = parts.join('/');
    return folder ? { folder, fileName } : null;
}

/* ── replace ──────────────────────────────────────────────── */
let replaceTarget = null;

function startReplace(item) {
    if (!item) return;
    replaceTarget = item;
    replaceInput.value = '';
    replaceInput.click();
}

async function handleReplaceFiles(files) {
    const target = replaceTarget;
    replaceTarget = null;
    if (!files.length || !target) return;
    try {
        if (target.type === 'file') {
            await replaceFileWith(target, files[0]);
        } else if (files.length === 1 && isZipFile(files[0])) {
            await replaceFolderWithZip(target, files[0]);
        } else {
            await replaceFolderWithFiles(target, files);
        }
    } finally {
        load(true);
    }
}

async function replaceFileWith(item, file) {
    if (file.size > MAX_UPLOAD) { toast('Larger than GitHub’s 100 MB file limit', 'err'); return; }
    setStatus(`Replacing ${item.name}…`, 'loading');
    try {
        await api('PUT', `/contents/${enc(item.path)}`, {
            message: `Replace ${item.name}`,
            content: await fileToBase64(file),
            sha: item.sha,
            branch: state.branch,
        });
        invalidateTree();
        toast(`Replaced ${item.name} ← “${file.name}”`, 'ok');
    } catch (err) {
        toast('Replace failed: ' + err.message, 'err');
    }
}

async function mergeIntoFolder(folderItem, sources) {
    if (!sources.length) return 0;
    const ref = await api('GET', `/git/ref/heads/${enc(state.branch)}`);
    const headSha = ref.object.sha;
    const headCommit = await api('GET', `/git/commits/${headSha}`);
    const treeEntries = [];
    let done = 0;

    for (const src of sources) {
        const blob = await api('POST', '/git/blobs', { content: await src.getBase64(), encoding: 'base64' });
        treeEntries.push({ path: joinPath(folderItem.path, src.relPath), mode: '100644', type: 'blob', sha: blob.sha });
        done++;
        setStatus(`Replacing ${done}/${sources.length}: ${src.relPath}…`, 'loading');
    }

    const newTree = await api('POST', '/git/trees', { base_tree: headCommit.tree.sha, tree: treeEntries });
    const commit = await api('POST', '/git/commits', {
        message: `Replace contents of ${folderItem.name}`,
        tree: newTree.sha,
        parents: [headSha],
    });
    await api('PATCH', `/git/refs/heads/${enc(state.branch)}`, { sha: commit.sha });
    invalidateTree();
    return sources.length;
}

async function replaceFolderWithZip(folderItem, zipFile) {
    if (typeof JSZip === 'undefined') { toast('Zip library failed to load', 'err'); return; }
    setStatus(`Reading ${zipFile.name}…`, 'loading');
    try {
        let zip;
        try { zip = await JSZip.loadAsync(zipFile); }
        catch (_) { throw new Error('Not a valid zip file'); }
        const sources = [];
        zip.forEach((relPath, entry) => {
            if (entry.dir) return;
            const safe = safeZipPath(relPath);
            if (!safe || shouldSkipZipEntry(safe)) return;
            sources.push({ relPath: safe, getBase64: () => entry.async('base64') });
        });
        if (!sources.length) { toast('The archive contains no files', 'warn'); return; }
        const count = await mergeIntoFolder(folderItem, sources);
        toast(`Replaced “${folderItem.name}” with ${plural(count, 'file')}`, 'ok');
    } catch (err) {
        toast('Replace failed: ' + err.message, 'err');
    }
}

async function replaceFolderWithFiles(folderItem, files) {
    const sources = files.map(file => ({ relPath: file.name, getBase64: () => fileToBase64(file) }));
    setStatus(`Replacing contents of “${folderItem.name}”…`, 'loading');
    try {
        const count = await mergeIntoFolder(folderItem, sources);
        toast(`Replaced “${folderItem.name}” with ${plural(count, 'file')}`, 'ok');
    } catch (err) {
        toast('Replace failed: ' + err.message, 'err');
    }
}

/* ── create file / folder ─────────────────────────────────── */
const TEMPLATES = [
    { id: 'blank', label: 'Empty file', content: '' },
    { id: 'html', label: 'HTML page', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>Document</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <h1>Hello</h1>\n  <script src="app.js"></script>\n</body>\n</html>\n' },
    { id: 'css', label: 'Stylesheet', content: ':root {\n  --bg: #0b0b14;\n  --fg: #f2f2ff;\n}\n\nbody {\n  margin: 0;\n  background: var(--bg);\n  color: var(--fg);\n  font-family: system-ui, sans-serif;\n}\n' },
    { id: 'js', label: 'JavaScript', content: "'use strict';\n\ndocument.addEventListener('DOMContentLoaded', () => {\n  console.log('ready');\n});\n" },
    { id: 'md', label: 'README', content: '# Project\n\nShort description of what this is and how to use it.\n' },
    { id: 'gitignore', label: '.gitignore', content: 'node_modules/\n.DS_Store\n*.log\n.env\n' },
];

async function newFile() {
    if (!state.connected) { toast('Connect a repository first', 'err'); return; }
    const res = await uiPrompt({
        title: 'New file',
        sub: `/${state.path}`,
        label: 'File name',
        value: '',
        placeholder: 'index.html',
        ok: 'Create file',
        icon: '📄',
        options: TEMPLATES.map(t => ({ value: t.id, label: t.label })),
        optionLabel: 'Start from',
        hint: 'Nested paths work too: assets/css/style.css',
        validate: value => {
            const name = value.trim();
            if (!name) return 'A file name is required';
            if (name.endsWith('/')) return 'That looks like a folder name';
            return '';
        },
    });
    if (!res) return;

    const rel = normalizeRel(res.value);
    if (!rel) { toast('Enter a valid file name', 'err'); return; }
    const path = joinPath(state.path, rel);
    const template = TEMPLATES.find(t => t.id === res.option) || TEMPLATES[0];

    setStatus('Creating file…', 'loading');
    try {
        let existing = null;
        try { existing = await api('GET', `/contents/${enc(path)}${refQ()}`); }
        catch (err) { if (err.status !== 404) throw err; }

        if (existing) {
            const open = await uiConfirm({
                title: 'File already exists',
                text: `“${rel}” is already in this folder. Open it in the editor instead?`,
                ok: 'Open it', icon: '📄',
            });
            if (open) openFile({ path, name: rel.split('/').pop(), type: 'file', sha: existing.sha, download_url: existing.download_url || null });
            return;
        }

        await api('PUT', `/contents/${enc(path)}`, {
            message: `Create ${rel}`,
            content: encodeBase64UTF8(template.content),
            branch: state.branch,
        });
        invalidateTree();
        const data = await api('GET', `/contents/${enc(path)}${refQ()}`);
        toast(`Created ${rel}`, 'ok', { ms: 1800 });
        await load(true);
        openFile({ path: data.path, name: data.name, type: 'file', sha: data.sha, download_url: data.download_url || null });
    } catch (err) {
        console.error('New file error:', err);
        toast('Failed to create file: ' + err.message, 'err');
    }
}

async function newFolder() {
    if (!state.connected) { toast('Connect a repository first', 'err'); return; }
    const res = await uiPrompt({
        title: 'New folder',
        sub: `/${state.path}`,
        label: 'Folder name',
        value: '',
        placeholder: 'assets/images',
        ok: 'Create folder',
        icon: '📁',
        hint: 'Nested paths are created in one commit. A .gitkeep keeps the folder visible.',
        validate: value => (value.trim() ? '' : 'A folder name is required'),
    });
    if (!res) return;

    let rel = normalizeRel(res.value);
    if (!rel) { toast('Enter a valid folder name', 'err'); return; }
    if (/\.[a-z0-9]{1,8}$/i.test(rel.split('/').pop())) {
        const sure = await uiConfirm({
            title: 'That looks like a file name',
            text: `“${rel}” ends with an extension. Create it as a folder anyway?`,
            ok: 'Create folder', icon: '📁',
        });
        if (!sure) return;
    }

    const path = joinPath(state.path, rel, '.gitkeep');
    setStatus('Creating folder…', 'loading');
    try {
        await api('PUT', `/contents/${enc(path)}`, {
            message: `Create folder ${rel}`,
            content: encodeBase64UTF8(''),
            branch: state.branch,
        });
        invalidateTree();
        toast(`Created folder ${rel}`, 'ok', { ms: 1800 });
        await load(true);
    } catch (err) {
        console.error('New folder error:', err);
        toast('Failed to create folder: ' + err.message, 'err');
    }
}

/* ── prompt modal ─────────────────────────────────────────── */
function uiPrompt(opts) {
    return new Promise(resolve => {
        const overlay = $('promptOverlay');
        $('promptIcon').textContent = opts.icon || '✏️';
        $('promptTitle').textContent = opts.title || 'Input';
        $('promptSub').textContent = opts.sub || '';
        $('promptLabel').textContent = opts.label || 'Value';
        $('promptInput').value = opts.value || '';
        $('promptInput').placeholder = opts.placeholder || '';
        $('promptOk').textContent = opts.ok || 'OK';
        $('promptHint').textContent = opts.hint || '';
        $('promptHint').classList.remove('err');

        const hasOptions = Array.isArray(opts.options) && opts.options.length;
        $('promptExtraWrap').hidden = !hasOptions;
        $('promptExtraLabel').textContent = opts.optionLabel || 'Option';
        $('promptExtra').innerHTML = '';
        if (hasOptions) {
            opts.options.forEach(option => {
                const node = document.createElement('option');
                node.value = option.value;
                node.textContent = option.label;
                $('promptExtra').appendChild(node);
            });
        }

        let stopEsc = null;
        const finish = result => {
            if (stopEsc) stopEsc();
            closeOverlay(overlay);
            resolve(result);
        };
        const submit = () => {
            const value = $('promptInput').value;
            const message = opts.validate ? opts.validate(value) : '';
            if (message) {
                $('promptHint').textContent = message;
                $('promptHint').classList.add('err');
                $('promptInput').focus();
                return;
            }
            finish({ value, option: hasOptions ? $('promptExtra').value : null });
        };

        $('promptOk').onclick = submit;
        $('promptCancel').onclick = () => finish(null);
        $('promptClose').onclick = () => finish(null);
        $('promptInput').onkeydown = e => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
        };
        $('promptOverlay').onclick = e => { if (e.target === overlay) finish(null); };
        stopEsc = onEscape(overlay, () => finish(null));

        openOverlay(overlay);
        setTimeout(() => {
            const input = $('promptInput');
            input.focus();
            const dot = input.value.lastIndexOf('.');
            if (dot > 0) input.setSelectionRange(0, dot); else input.select();
        }, 60);
    });
}

/* ── confirm modal ────────────────────────────────────────── */
function uiConfirm(opts) {
    return new Promise(resolve => {
        const overlay = $('confirmOverlay');
        $('confirmIcon').textContent = opts.icon || '⚠️';
        $('confirmTitle').textContent = opts.title || 'Are you sure?';
        $('confirmSub').textContent = opts.sub || '';
        $('confirmText').textContent = opts.text || '';
        $('confirmOk').textContent = opts.ok || 'Confirm';
        $('confirmOk').className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');

        let stopEsc = null;
        const finish = value => {
            if (stopEsc) stopEsc();
            closeOverlay(overlay);
            resolve(value);
        };
        $('confirmOk').onclick = () => finish(true);
        $('confirmCancel').onclick = () => finish(false);
        $('confirmOverlay').onclick = e => { if (e.target === overlay) finish(false); };
        stopEsc = onEscape(overlay, () => finish(false));

        openOverlay(overlay);
        setTimeout(() => $('confirmOk').focus(), 60);
    });
}

/* ── info modal ───────────────────────────────────────────── */
function showInfo(item) {
    const isDir = item.type === 'dir';
    const rows = [
        ['Name', item.name],
        ['Path', '/' + item.path],
        ['Type', isDir ? 'folder' : (extOf(item.name) || 'file')],
        ['Size', isDir ? '—' : formatSize(item.size)],
        ['SHA', item.sha || '—'],
        ['Live site', pagesUrlFor(item)],
        ['Raw URL', isDir ? '—' : (item.download_url || `https://raw.githubusercontent.com/${state.owner}/${state.repo}/${state.branch}/${item.path}`)],
        ['GitHub', `https://github.com/${state.owner}/${state.repo}/${isDir ? 'tree' : 'blob'}/${state.branch}/${item.path}`],
    ];

    $('infoIcon').textContent = getFileIcon(item.name, isDir);
    $('infoTitle').textContent = item.name;
    $('infoSub').textContent = `on ${state.branch}`;
    const body = $('infoBody');
    body.innerHTML = '';
    rows.forEach(([key, value]) => {
        const row = document.createElement('div');
        row.className = 'info-row';
        row.innerHTML = `<span class="k">${escapeHtml(key)}</span><span class="v"></span>`;
        const valueNode = row.querySelector('.v');
        valueNode.textContent = value;
        valueNode.title = value;
        if (value && value !== '—') {
            const copy = document.createElement('button');
            copy.className = 'copy';
            copy.textContent = 'Copy';
            copy.onclick = () => copyToClipboard(value);
            row.appendChild(copy);
        }
        body.appendChild(row);
    });

    openOverlay($('infoOverlay'));
    onEscape($('infoOverlay'), () => closeOverlay($('infoOverlay')));
}

/* ── media preview ────────────────────────────────────────── */
let previewUrl = null;

async function previewItem(item) {
    const kind = previewKind(item.name);
    if (!kind) { toast('No inline preview for this file type — try Download', 'warn'); return; }

    const body = $('previewBody');
    const overlay = $('previewOverlay');
    $('previewTitle').textContent = item.path;
    body.innerHTML = '<div class="pv-note">Loading preview…</div>';
    openOverlay(overlay);

    try {
        const res = await fetchRaw(item.path);
        const blob = await res.blob();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        body.innerHTML = '';

        if (kind === 'image') {
            const img = document.createElement('img');
            img.src = previewUrl;
            img.alt = item.name;
            body.appendChild(img);
        } else if (kind === 'pdf') {
            const frame = document.createElement('iframe');
            frame.src = previewUrl;
            frame.title = item.name;
            body.appendChild(frame);
        } else if (kind === 'audio') {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = previewUrl;
            body.appendChild(audio);
        } else {
            const video = document.createElement('video');
            video.controls = true;
            video.src = previewUrl;
            body.appendChild(video);
        }

        $('previewOpen').onclick = () => window.open(item.download_url || previewUrl, '_blank', 'noopener');
        $('previewDownload').onclick = () => saveBlob(blob, item.name);
    } catch (err) {
        body.innerHTML = `<div class="pv-note">Preview failed: ${escapeHtml(err.message)}</div>`;
    }
}

function closePreview() {
    closeOverlay($('previewOverlay'));
    $('previewBody').innerHTML = '';
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
}

/* ── shortcuts sheet ──────────────────────────────────────── */
const SHORTCUTS = [
    ['General', [
        ['Command palette', 'Ctrl / ⌘ + K'],
        ['Search this folder', '/'],
        ['Toggle repository search', 'Ctrl / ⌘ + Shift + F'],
        ['Refresh', 'R'],
        ['Go up one level', 'Backspace'],
        ['Keyboard shortcuts', '?'],
    ]],
    ['Files', [
        ['Upload files', 'U'],
        ['New file', 'N'],
        ['New folder', 'Shift + N'],
        ['Select all (visible)', 'Ctrl / ⌘ + A'],
        ['Rename selected', 'F2'],
        ['Delete selected', 'Delete'],
        ['Toggle select mode', 'S'],
        ['Toggle grid / list', 'V'],
    ]],
    ['Editor', [
        ['Save', 'Ctrl / ⌘ + S'],
        ['Find', 'Ctrl / ⌘ + F'],
        ['Close', 'Esc'],
    ]],
];

function openHelp() {
    const body = $('helpBody');
    body.innerHTML = '';
    SHORTCUTS.forEach(([group, rows]) => {
        const heading = document.createElement('div');
        heading.className = 'help-group';
        heading.textContent = group;
        body.appendChild(heading);
        rows.forEach(([label, keys]) => {
            const row = document.createElement('div');
            row.className = 'help-row';
            row.innerHTML = `<span>${escapeHtml(label)}</span><kbd>${escapeHtml(keys)}</kbd>`;
            body.appendChild(row);
        });
    });
    openOverlay($('helpOverlay'));
    onEscape($('helpOverlay'), () => closeOverlay($('helpOverlay')));
}

/* ── command palette ──────────────────────────────────────── */
let paletteItems = [];
let paletteIndex = 0;

function paletteCommands() {
    return [
        { label: 'Upload files…', icon: '📤', run: () => fileInput.click() },
        { label: 'Upload folder…', icon: '🗂', run: () => folderInput.click() },
        { label: 'Upload ZIP and pick contents…', icon: '📦', run: () => zipInput.click() },
        { label: 'New file…', icon: '📄', run: newFile },
        { label: 'New folder…', icon: '📁', run: newFolder },
        { label: 'Refresh folder', icon: '⟳', run: () => load() },
        { label: 'Go up one level', icon: '⬆', run: goUp },
        { label: 'Toggle select mode', icon: '☑', run: () => setSelectMode(!selectMode) },
        { label: 'Switch grid / list view', icon: '▦', run: toggleView },
        { label: 'Toggle formatted upload', icon: '🔀', run: toggleFormatted },
        { label: 'Focus search', icon: '🔍', run: () => searchInput.focus() },
        { label: 'Paste clipboard here', icon: '📋', run: pasteClipboard },
        { label: 'Download this folder as ZIP', icon: '⬇️', run: () => downloadFolder({ name: state.path.split('/').pop() || state.repo, path: state.path }) },
        { label: 'Copy current path', icon: '🧭', run: () => copyToClipboard('/' + state.path) },
        { label: 'Keyboard shortcuts', icon: '⌨', run: openHelp },
        { label: 'Disconnect repository', icon: '🔌', run: disconnect },
    ];
}

function openPalette() {
    if (!state.connected) { toast('Connect a repository first', 'err'); return; }
    $('paletteInput').value = '';
    paletteIndex = 0;
    renderPalette('');
    openOverlay($('paletteOverlay'));
    onEscape($('paletteOverlay'), () => closeOverlay($('paletteOverlay')));
    setTimeout(() => $('paletteInput').focus(), 40);
}

function renderPalette(query) {
    const needle = query.trim().toLowerCase();
    const commands = paletteCommands();
    const files = state.items.map(item => ({
        label: item.name,
        icon: getFileIcon(item.name, item.type === 'dir'),
        sub: item.type === 'dir' ? 'folder' : formatSize(item.size),
        run: () => (item.type === 'dir' ? navigate(item.path) : openFile(item)),
    }));
    const source = [...commands, ...files];
    paletteItems = (needle
        ? source.filter(entry => entry.label.toLowerCase().includes(needle))
        : source).slice(0, 40);

    const list = $('paletteList');
    list.innerHTML = '';
    if (!paletteItems.length) {
        list.innerHTML = '<div class="palette-empty">No command or file matches that.</div>';
        return;
    }
    if (paletteIndex >= paletteItems.length) paletteIndex = 0;
    paletteItems.forEach((entry, index) => {
        const node = document.createElement('div');
        node.className = 'palette-item' + (index === paletteIndex ? ' active' : '');
        node.innerHTML = `<span class="pi-ico">${entry.icon}</span><span class="pi-label"></span>${entry.sub ? '<span class="pi-sub"></span>' : ''}`;
        node.querySelector('.pi-label').textContent = entry.label;
        if (entry.sub) node.querySelector('.pi-sub').textContent = entry.sub;
        node.onclick = () => { closeOverlay($('paletteOverlay')); entry.run(); };
        list.appendChild(node);
    });
}

function paletteMove(delta) {
    if (!paletteItems.length) return;
    paletteIndex = (paletteIndex + delta + paletteItems.length) % paletteItems.length;
    renderPalette($('paletteInput').value);
    const active = $('paletteList').querySelector('.palette-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

/* ── view helpers ─────────────────────────────────────────── */
function toggleView() {
    savePref('view', prefs.view === 'grid' ? 'list' : 'grid');
    viewGrid.classList.toggle('active', prefs.view === 'grid');
    viewList.classList.toggle('active', prefs.view === 'list');
    renderFiles();
}

function toggleFormatted() {
    savePref('formatted', !prefs.formatted);
    formattedBtn.classList.toggle('active', prefs.formatted);
    formattedBtn.textContent = prefs.formatted ? '🔀 Formatted ON' : '🔀 Formatted';
    toast(prefs.formatted ? 'Formatted upload ON — a_b_c.js → a/b/c.js' : 'Formatted upload off', 'ok', { ms: 2000 });
}

function applySortFromHeader(key) {
    let next;
    if (key === 'name') next = prefs.sort === 'name-asc' ? 'name-desc' : 'name-asc';
    else if (key === 'size') next = prefs.sort === 'size-desc' ? 'size-asc' : 'size-desc';
    else if (key === 'date') next = prefs.sort === 'date-desc' ? 'date-asc' : 'date-desc';
    else next = 'type';
    savePref('sort', next);
    sortSelect.value = next;
    renderFiles();
}

/* ── drag & drop (files + folders) ────────────────────────── */
function walkEntry(entry, prefix) {
    return new Promise(resolve => {
        if (entry.isFile) {
            entry.file(file => resolve([{ file, rel: joinPath(prefix, file.name) }]), () => resolve([]));
            return;
        }
        if (!entry.isDirectory) { resolve([]); return; }
        const reader = entry.createReader();
        const collected = [];
        const readBatch = () => {
            reader.readEntries(async batch => {
                if (!batch.length) {
                    let out = [];
                    for (const child of collected) out = out.concat(await walkEntry(child, joinPath(prefix, entry.name)));
                    resolve(out);
                    return;
                }
                collected.push(...batch);
                readBatch();
            }, () => resolve([]));
        };
        readBatch();
    });
}

async function collectDropEntries(dataTransfer) {
    const items = [...(dataTransfer.items || [])];
    const roots = [];
    if (items.length && items[0].webkitGetAsEntry) {
        items.forEach(item => {
            const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
            if (entry) roots.push(entry);
        });
    }
    if (!roots.length) return [...(dataTransfer.files || [])].map(file => ({ file, rel: '' }));

    const out = [];
    for (const root of roots) {
        if (root.isDirectory) {
            out.push(...await walkEntry(root, ''));
        } else {
            const file = await new Promise(resolve => root.file(resolve, () => resolve(null)));
            if (file) out.push({ file, rel: '' });
        }
    }
    return out;
}

/* ── event wiring ─────────────────────────────────────────── */
function wireEvents() {
    connectBtn.addEventListener('click', connect);
    repoInput.addEventListener('keydown', e => { if (e.key === 'Enter') connect(); });
    tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') connect(); });
    tokenToggle.addEventListener('click', () => {
        tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
        tokenToggle.textContent = tokenInput.type === 'password' ? '👁' : '🙈';
    });
    disconnectBtn.addEventListener('click', async () => {
        const ok = await uiConfirm({
            title: 'Disconnect repository?',
            text: 'The token is removed from this browser. Your files on GitHub are untouched.',
            ok: 'Disconnect', danger: true, icon: '🔌',
        });
        if (ok) disconnect();
    });

    $('sidebarToggle').onclick = openSidebar;
    $('sidebarClose').onclick = closeSidebar;
    scrim.onclick = closeSidebar;

    document.querySelectorAll('#accentSwatches .sw').forEach(sw => {
        sw.addEventListener('click', () => {
            savePref('accent', sw.dataset.accent);
            applyPrefs();
        });
    });
    optHideGitkeep.addEventListener('change', () => {
        savePref('hideGitkeep', optHideGitkeep.checked);
        load(true);
    });

    branchSelect.addEventListener('change', () => {
        state.branch = branchSelect.value;
        invalidateTree();
        branchLabel.textContent = state.branch;
        navigate('');
        toast(`Switched to ${state.branch}`, 'ok', { ms: 1800 });
    });

    bindMenu($('uploadMenuBtn'), $('uploadMenu'), kind => {
        if (kind === 'files') fileInput.click();
        else if (kind === 'folder') folderInput.click();
        else zipInput.click();
    });
    bindMenu($('newMenuBtn'), $('newMenu'), kind => (kind === 'file' ? newFile() : newFolder()));

    $('uploadBtn').onclick = () => fileInput.click();
    $('newBtn').onclick = () => newFile();
    $('navUpload').onclick = () => { closeSidebar(); fileInput.click(); };
    $('navUploadFolder').onclick = () => { closeSidebar(); folderInput.click(); };
    $('navUploadZip').onclick = () => { closeSidebar(); zipInput.click(); };
    $('navNewFile').onclick = () => { closeSidebar(); newFile(); };
    $('navNewFolder').onclick = () => { closeSidebar(); newFolder(); };
    $('navRefresh').onclick = () => { closeSidebar(); load(); };
    $('navUp').onclick = () => { closeSidebar(); goUp(); };
    $('navPalette').onclick = () => { closeSidebar(); openPalette(); };

    fileInput.onchange = e => {
        if (e.target.files.length) uploadEntries([...e.target.files].map(file => ({ file, rel: '' })));
        e.target.value = '';
    };
    folderInput.onchange = e => {
        if (e.target.files.length) {
            uploadEntries([...e.target.files].map(file => ({ file, rel: file.webkitRelativePath || '' })));
        }
        e.target.value = '';
    };
    zipInput.onchange = async e => {
        const files = [...e.target.files];
        e.target.value = '';
        if (!files.length) return;
        const archives = files.filter(isZipFile);
        if (archives.length !== files.length) toast('Only .zip archives are opened by that button', 'warn');
        if (archives.length) uploadEntries(archives.map(file => ({ file, rel: '' })));
    };
    replaceInput.onchange = e => {
        const files = [...e.target.files];
        e.target.value = '';
        handleReplaceFiles(files);
    };

    $('refreshBtn').onclick = () => load();
    $('upBtn').onclick = goUp;
    jumpInput.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        navigate(jumpInput.value);
        jumpInput.value = '';
        jumpInput.blur();
    });

    const runDeep = debounce(() => { if (state.deepSearch) renderDeepSearch(); }, 320);
    searchInput.addEventListener('input', () => {
        state.query = searchInput.value;
        searchClear.classList.toggle('show', !!state.query);
        if (state.deepSearch) runDeep();
        else renderFiles();
    });
    searchClear.onclick = () => {
        state.query = '';
        searchInput.value = '';
        searchClear.classList.remove('show');
        renderFiles();
        searchInput.focus();
    };
    deepSearchBtn.onclick = () => {
        state.deepSearch = !state.deepSearch;
        deepSearchBtn.classList.toggle('active', state.deepSearch);
        renderFiles();
    };

    sortSelect.addEventListener('change', () => {
        savePref('sort', sortSelect.value);
        renderFiles();
    });
    viewGrid.onclick = () => { if (prefs.view !== 'grid') toggleView(); };
    viewList.onclick = () => { if (prefs.view !== 'list') toggleView(); };
    selectBtn.onclick = () => setSelectMode(!selectMode);
    formattedBtn.onclick = toggleFormatted;

    filesEl.addEventListener('click', e => {
        const sortNode = e.target.closest('[data-sort]');
        if (sortNode) { applySortFromHeader(sortNode.dataset.sort); return; }
        if (e.target.closest('[data-nav="up"]')) { goUp(); return; }
        const node = e.target.closest('[data-path]');
        if (!node) { if (selection.size) clearSelection(); return; }
        const item = viewIndex.get(node.dataset.path);
        if (!item) return;

        const quick = e.target.closest('[data-qa]');
        if (quick) {
            e.stopPropagation();
            const action = quick.dataset.qa;
            if (action === 'download') (item.type === 'dir' ? downloadFolder(item) : downloadItem(item)).catch(() => {});
            else if (action === 'replace') startReplace(item);
            else if (action === 'newtab') openInNewTab(item);
            else if (action === 'copy') copyFileContent(item);
            else {
                const rect = quick.getBoundingClientRect();
                showContextMenu(rect.left, rect.bottom + 4, item, node);
            }
            return;
        }
        if (e.ctrlKey || e.metaKey) { toggleSelect(item); return; }
        if (e.shiftKey && selectionAnchor) { rangeSelect(item); return; }
        if (selectMode) { toggleSelect(item); return; }
        if (selection.size) clearSelection();
        if (item.type === 'dir') navigate(item.path);
        else openFile(item);
    });

    filesEl.addEventListener('keydown', e => {
        const node = e.target.closest('[data-path]');
        if (!node) return;
        const item = viewIndex.get(node.dataset.path);
        if (!item) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (item.type === 'dir') navigate(item.path); else openFile(item);
        } else if (e.key === 'F2') {
            e.preventDefault();
            renameItem(item);
        } else if (e.key === ' ') {
            e.preventDefault();
            toggleSelect(item);
        }
    });

    filesEl.addEventListener('contextmenu', e => {
        const node = e.target.closest('[data-path]');
        if (!node) return;
        const item = viewIndex.get(node.dataset.path);
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        if (selection.size > 0 && !selection.has(item.path)) clearSelection();
        showContextMenu(e.clientX, e.clientY, item, node);
    });

    document.addEventListener('contextmenu', e => {
        const target = e.target;
        if (!target || typeof target.closest !== 'function') return;
        if (target.closest('.context-menu, .card, .row, .overlay, .editor-overlay')) return;
        if (target.closest('input, textarea, [contenteditable="true"]')) return;
        if (!state.connected) return;
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, null, null);
    });

    $('selDownload').onclick = downloadSelection;
    $('selClear').onclick = clearSelection;
    $('selCopy').onclick = () => { const items = getActionItems(null); if (items.length) setClipboard(items, 'copy'); };
    $('selCut').onclick = () => { const items = getActionItems(null); if (items.length) setClipboard(items, 'cut'); };
    $('selDelete').onclick = () => { const items = getActionItems(null); if (items.length) deleteMany(items); };
    $('clipPaste').onclick = () => pasteClipboard();
    $('clipClear').onclick = () => setClipboard(null);

    contextMenu.addEventListener('click', e => {
        const el = e.target.closest('.item');
        if (!el || !ctx) return;
        const { item } = ctx;
        const action = el.dataset.action;
        hideContextMenu();
        runAction(action, item).catch(err => { console.error(action, err); toast(err.message, 'err'); });
    });
    contextMenu.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerdown', e => {
        if (ctx && !contextMenu.contains(e.target)) hideContextMenu();
        const target = e.target;
        if (!target || typeof target.closest !== 'function' || !target.closest('.btn-wrap')) closeMenus();
    }, true);
    document.addEventListener('keydown', e => {
        if (!ctx) return;
        const items = [...contextMenu.querySelectorAll('.item:not([hidden])')];
        const index = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(index + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[index <= 0 ? items.length - 1 : index - 1].focus(); }
        else if ((e.key === 'Enter' || e.key === ' ') && index >= 0) { e.preventDefault(); items[index].click(); }
        else if (e.key === 'Escape') { e.preventDefault(); hideContextMenu(); }
    }, true);
    window.addEventListener('scroll', hideContextMenu, true);
    window.addEventListener('blur', hideContextMenu);

    $('upToggle').onclick = () => upPanel.classList.toggle('collapsed');
    $('upClose').onclick = () => upPanel.classList.remove('show');
    $('upCancel').onclick = () => uploads.forEach(cancelUpload);
    upRetry.onclick = retryFailed;

    $('edClose').onclick = closeEditor;
    $('edCancel').onclick = closeEditor;
    edSave.onclick = saveFile;
    edOverlay.addEventListener('click', e => { if (e.target === edOverlay) closeEditor(); });

    $('helpBtn').onclick = openHelp;
    $('helpBtn2').onclick = openHelp;
    $('helpClose').onclick = () => closeOverlay($('helpOverlay'));
    $('helpOverlay').onclick = e => { if (e.target === $('helpOverlay')) closeOverlay($('helpOverlay')); };
    $('infoClose').onclick = () => closeOverlay($('infoOverlay'));
    $('infoOverlay').onclick = e => { if (e.target === $('infoOverlay')) closeOverlay($('infoOverlay')); };
    $('previewClose').onclick = closePreview;
    $('previewOverlay').onclick = e => { if (e.target === $('previewOverlay')) closePreview(); };

    $('paletteInput').addEventListener('input', e => { paletteIndex = 0; renderPalette(e.target.value); });
    $('paletteInput').addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); paletteMove(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); paletteMove(-1); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const entry = paletteItems[paletteIndex];
            if (entry) { closeOverlay($('paletteOverlay')); entry.run(); }
        }
    });
    $('paletteOverlay').onclick = e => { if (e.target === $('paletteOverlay')) closeOverlay($('paletteOverlay')); };
    onEscape($('paletteOverlay'), () => closeOverlay($('paletteOverlay')));

    const dropOverlay = $('dropOverlay');
    let dragDepth = 0;
    window.addEventListener('dragenter', e => {
        if (!state.connected) return;
        if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return;
        dragDepth++;
        dropOverlay.classList.add('show');
    });
    window.addEventListener('dragover', e => { e.preventDefault(); });
    window.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) dropOverlay.classList.remove('show');
    });
    window.addEventListener('drop', async e => {
        e.preventDefault();
        dragDepth = 0;
        dropOverlay.classList.remove('show');
        if (!state.connected) return;
        const entries = await collectDropEntries(e.dataTransfer);
        uploadEntries(entries);
    });

    window.addEventListener('beforeunload', e => {
        if (pumping) { e.preventDefault(); e.returnValue = ''; }
    });

    window.addEventListener('resize', () => {
        hideContextMenu();
        closeMenus();
        if (cm && edOverlay.classList.contains('open')) cm.refresh();
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            if (cm && edOverlay.classList.contains('open')) cm.refresh();
        });
    }
}

/* ── global keyboard ──────────────────────────────────────── */
document.addEventListener('keydown', e => {
    const target = e.target;
    const typing = !!(target && typeof target.closest === 'function'
        && (target.closest('input, textarea, select, [contenteditable="true"]') || target.closest('.CodeMirror')));
    const meta = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
        if (anyOverlayOpen()) return;
        if (ctx) { hideContextMenu(); return; }
        closeMenus();
        if (selection.size) { clearSelection(); return; }
        if (selectMode) { setSelectMode(false); return; }
        if (document.body.classList.contains('side-open')) closeSidebar();
        return;
    }
    if (typing || edOverlay.classList.contains('open')) return;
    if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (meta && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (deepSearchBtn) deepSearchBtn.click();
        return;
    }
    if (meta && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAllDisplayed(); return; }
    if (meta) return;

    switch (e.key) {
        case '/': e.preventDefault(); searchInput.focus(); searchInput.select(); break;
        case '?': e.preventDefault(); openHelp(); break;
        case 'Backspace': e.preventDefault(); goUp(); break;
        case 'Delete':
            if (selection.size) { e.preventDefault(); deleteMany(getActionItems(null)); }
            break;
        case 'F2': {
            const paths = [...selection];
            const item = paths.length === 1 ? viewIndex.get(paths[0]) : null;
            if (item) { e.preventDefault(); renameItem(item); }
            break;
        }
        default: {
            const key = e.key.toLowerCase();
            if (key === 'r') { e.preventDefault(); load(); }
            else if (key === 'u') { e.preventDefault(); fileInput.click(); }
            else if (key === 'n' && e.shiftKey) { e.preventDefault(); newFolder(); }
            else if (key === 'n') { e.preventDefault(); newFile(); }
            else if (key === 's') { e.preventDefault(); setSelectMode(!selectMode); }
            else if (key === 'v') { e.preventDefault(); toggleView(); }
        }
    }
});

onEscape(edOverlay, () => closeEditor());

/* ── boot ─────────────────────────────────────────────────── */
function init() {
    initZipWizard();
    wireEvents();
    applyPrefs();

    try {
        const fromUrl = normalizeRel(new URLSearchParams(window.location.search).get('path') || '');
        if (fromUrl) { pendingPath = fromUrl; state.path = fromUrl; }
    } catch (_) { /* ignore */ }

    setStatus('Not connected');
    branchLabel.textContent = state.branch;
    renderRepoCard();
    renderCrumbs();
    renderClipboard();
    renderFiles();

    const savedToken = store.raw('fm_token');
    const savedRepo = store.raw('fm_repo');
    if (savedRepo && /^[^\s/]+\/[^\s/]+$/.test(savedRepo)) repoInput.value = savedRepo;
    if (savedToken) {
        tokenInput.value = savedToken;
        setTimeout(() => {
            if (repoInput.value.includes('/') && tokenInput.value.trim()) connect();
        }, 300);
    }
}

init();
})();
