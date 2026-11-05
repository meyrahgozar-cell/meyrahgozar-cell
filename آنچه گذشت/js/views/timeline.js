import { CONFIG, MOODS } from '../config.js';
import { esc, icon, qs, qsa, on, debounce } from '../lib/dom.js';
import { MONTHS, fa, jMonthKey, jParts, jYear, plural } from '../lib/format.js';
import { navigate, current } from '../lib/router.js';
import { toast } from '../lib/ui.js';
import { db } from '../services/db.js';
import { prefs, savePrefs, bus, state } from '../state.js';
import { emptyState, entryCard, entryMenu, skeletonCards } from '../ui/parts.js';

export const title = 'خط زمان';
export const sub = () => 'هر قاب، به ترتیبی که رخ داده';

function queryToFilters(q = {}) {
  return {
    search: q.q || '',
    mood: q.mood || '',
    year: q.year || '',
    tag: q.tag || '',
    threadId: q.thread || '',
    favorite: q.fav === '1',
    pinned: q.pin === '1',
    sort: q.sort === 'asc' ? 'asc' : 'desc',
    view: q.view || prefs.listView || 'list',
  };
}

function pushUrl(filters) {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.mood) params.set('mood', filters.mood);
  if (filters.year) params.set('year', filters.year);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.threadId) params.set('thread', filters.threadId);
  if (filters.favorite) params.set('fav', '1');
  if (filters.pinned) params.set('pin', '1');
  if (filters.sort === 'asc') params.set('sort', 'asc');
  if (filters.view !== 'list') params.set('view', filters.view);
  const qsStr = params.toString();
  history.replaceState(null, '', `#/timeline${qsStr ? '?' + qsStr : ''}`);
}

export default {
  title,
  sub,
  async mount(root) {
    const filters = queryToFilters(current().query);
    let offset = 0;
    let loading = false;
    let exhausted = false;
    let all = [];

    root.innerHTML = `
      <div class="tl-toolbar">
        <div class="inputgroup tl-search">
          ${icon('search')}
          <input class="input" type="search" id="tlSearch" placeholder="جست‌وجو در عنوان، متن، مکان…" value="${esc(filters.search)}" aria-label="جست‌وجو در قاب‌ها" />
        </div>
        <div class="seg" id="tlView">
          <button data-view="list" class="${filters.view === 'list' ? 'is-on' : ''}" title="فهرست راحت">${icon('listview')}</button>
          <button data-view="grid" class="${filters.view === 'grid' ? 'is-on' : ''}" title="شبکه">${icon('gridview')}</button>
          <button data-view="compact" class="${filters.view === 'compact' ? 'is-on' : ''}" title="فشرده">${icon('list')}</button>
        </div>
        <button class="icon-btn" id="tlRandom" title="یک قاب تصادفی">${icon('refresh')}</button>
        <button class="btn btn--primary btn--sm" data-action="new-frame">${icon('plus')}قاب</button>
      </div>

      <div class="tl-filters" id="tlFilters">
        <div class="chips">
          <button class="chip ${!filters.mood ? 'is-on' : ''}" data-mood="">همهٔ حال‌وهواها</button>
          ${MOODS.map((m) => `<button class="chip chip--mood ${filters.mood === m.slug ? 'is-on' : ''}" data-mood="${m.slug}"><span class="chip__dot" style="background:${m.color}"></span>${esc(m.label)}</button>`).join('')}
        </div>
        <select class="input tl-select" id="tlYear" aria-label="سال">
          <option value="">همهٔ سال‌ها</option>
        </select>
        <select class="input tl-select" id="tlTag" aria-label="برچسب">
          <option value="">همهٔ برچسب‌ها</option>
        </select>
        <select class="input tl-select" id="tlSort" aria-label="ترتیب">
          <option value="desc" ${filters.sort === 'desc' ? 'selected' : ''}>تازه‌ترین اول</option>
          <option value="asc" ${filters.sort === 'asc' ? 'selected' : ''}>قدیمی‌ترین اول</option>
        </select>
        <button class="chip ${filters.favorite ? 'is-on' : ''}" id="tlFav">${icon('star')}محبوب‌ها</button>
        <button class="chip ${filters.pinned ? 'is-on' : ''}" id="tlPin">${icon('pinmark')}سنجاق‌شده</button>
        <a class="btn btn--sm btn--ghost" href="#/timeline" id="tlClear" ${filters.search || filters.mood || filters.year || filters.tag || filters.favorite || filters.pinned ? '' : 'hidden'}>${icon('close')}پاک کردن</a>
      </div>

      <div id="tlSummary" class="filter-summary" style="margin-bottom:var(--sp-4)"></div>
      <div id="tlList"></div>
      <div class="loadmore" id="tlMore"></div>
      <div id="tlSentinel" style="height:1px"></div>`;

    const listEl = qs('#tlList', root);
    const moreEl = qs('#tlMore', root);
    const summaryEl = qs('#tlSummary', root);

    const applyClass = () => {
      listEl.className = filters.view === 'grid' ? 'frames--grid' : filters.view === 'compact' ? 'frames--compact' : '';
    };

    async function load(reset = false) {
      if (loading) return;
      loading = true;
      if (reset) {
        offset = 0; all = []; exhausted = false;
        listEl.innerHTML = skeletonCards(4);
        moreEl.innerHTML = '';
      }
      try {
        const { rows, count } = await db.entries.list({
          ...filters,
          limit: CONFIG.pageSize,
          offset,
          withCount: true,
        });
        offset += rows.length;
        all = reset ? rows : [...all, ...rows];
        exhausted = rows.length < CONFIG.pageSize || (count != null && all.length >= count);
        render(count);
      } catch (err) {
        listEl.innerHTML = emptyState({ iconName: 'alert', title: 'قاب‌ها بارگذاری نشد', text: err.message });
      } finally { loading = false; }
    }

    function render(count = null) {
      applyClass();
      if (!all.length) {
        const filtered = filters.search || filters.mood || filters.year || filters.tag || filters.favorite || filters.pinned || filters.threadId;
        listEl.innerHTML = emptyState({
          iconName: filtered ? 'search' : 'reel',
          title: filtered ? 'قابی با این فیلتر نیست' : 'هنوز قابی نیست',
          text: filtered ? 'حال‌وهوا، سال یا کلمهٔ دیگری را امتحان کن — یا فیلترها را بردار.' : 'خط زمان با یک بعدازظهر ساده شروع می‌شود.',
          action: filtered
            ? '<a class="btn btn--outline" href="#/timeline">' + icon('close') + 'برداشتن فیلترها</a>'
            : '<button class="btn btn--primary" data-action="new-frame">' + icon('plus') + 'اولین قاب را بنویس</button>',
        });
        summaryEl.innerHTML = '';
        moreEl.innerHTML = '';
        return;
      }

      const groups = new Map();
      all.forEach((e) => {
        const key = jMonthKey(e.happened_on);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
      });

      const html = [...groups.entries()].map(([key, items]) => {
        const [y, m] = key.split('-');
        return `<section class="tl-group">
          <div class="tl-group__head">
            <h3>${esc(MONTHS[Number(m) - 1])} <span style="color:var(--faint);font-weight:400">${fa(y)}</span></h3>
            <div class="line"></div>
            <span class="count">${plural(items.length, 'قاب')}</span>
          </div>
          <div class="frames stagger">${items.map((e) => entryCard(e, { view: filters.view })).join('')}</div>
        </section>`;
      }).join('');

      listEl.innerHTML = html;
      const total = count ?? all.length;
      summaryEl.innerHTML = `<strong>${fa(total)}</strong> قاب${filters.search ? ` مطابق «${esc(filters.search)}»` : ''} · ${fa(all.length)} نمایش داده شده`;

      moreEl.innerHTML = exhausted
        ? (all.length > 6 ? `<p>این تمام روایت است — ${plural(all.length, 'قاب')} در ${plural(groups.size, 'ماه')}.</p>` : '')
        : `<button class="btn btn--outline" id="tlLoadMore">${icon('chevron-down')}قاب‌های قدیمی‌تر</button>
           <p>${fa(all.length)} از ${fa(total)}</p>`;
      qs('#tlLoadMore', moreEl)?.addEventListener('click', () => load(false));
    }

    /* فیلترها */
    const search = debounce((value) => {
      filters.search = value.trim();
      pushUrl(filters);
      load(true);
    }, 260);

    qs('#tlSearch', root).addEventListener('input', (e) => search(e.target.value));

    on(root, 'click', '#tlFilters [data-mood]', (e, t) => {
      filters.mood = t.dataset.mood;
      qsa('#tlFilters [data-mood]', root).forEach((b) => b.classList.toggle('is-on', b.dataset.mood === filters.mood));
      pushUrl(filters);
      load(true);
    });

    qs('#tlYear', root).addEventListener('change', (e) => {
      filters.year = e.target.value; pushUrl(filters); load(true);
    });
    qs('#tlTag', root).addEventListener('change', (e) => {
      filters.tag = e.target.value; pushUrl(filters); load(true);
    });
    qs('#tlSort', root).addEventListener('change', (e) => {
      filters.sort = e.target.value; pushUrl(filters); load(true);
    });
    qs('#tlFav', root).addEventListener('click', (e) => {
      filters.favorite = !filters.favorite;
      e.currentTarget.classList.toggle('is-on', filters.favorite);
      pushUrl(filters); load(true);
    });
    qs('#tlPin', root).addEventListener('click', (e) => {
      filters.pinned = !filters.pinned;
      e.currentTarget.classList.toggle('is-on', filters.pinned);
      pushUrl(filters); load(true);
    });

    qsa('#tlView button', root).forEach((b) => b.addEventListener('click', () => {
      filters.view = b.dataset.view;
      savePrefs({ listView: filters.view });
      qsa('#tlView button', root).forEach((x) => x.classList.toggle('is-on', x === b));
      pushUrl(filters);
      render();
    }));

    qs('#tlRandom', root).addEventListener('click', async () => {
      const pool = await db.entries.all();
      if (!pool.length) { toast('هنوز چیزی برای باز کردن نیست', { type: 'info' }); return; }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      navigate(`/frame/${pick.id}`);
    });

    on(listEl, 'click', '[data-open]', (e, t) => {
      if (e.target.closest('button.icon-btn, a')) return;
      navigate(`/frame/${t.dataset.open}`);
    });
    on(listEl, 'keydown', '[data-open]', (e, t) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/frame/${t.dataset.open}`); }
    });
    on(listEl, 'click', '[data-menu]', (e, t) => {
      const entry = all.find((x) => x.id === t.dataset.menu);
      if (entry) entryMenu(t, entry);
    });

    /* بارگذاری پیوسته */
    const sentinel = qs('#tlSentinel', root);
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !exhausted && !loading && all.length) load(false);
    }, { rootMargin: '400px' });
    io.observe(sentinel);
    const stopOnChange = bus.on('entries:changed', () => { load(true); });
    const cleanup = () => { io.disconnect(); stopOnChange(); };
    window.addEventListener('hashchange', cleanup, { once: true });

    /* پر کردن انتخابگر سال و برچسب */
    await load(true);
    try {
      const allRows = await db.entries.all();
      const years = [...new Set(allRows.map((e) => String(jYear(e.happened_on))))].sort((a, b) => Number(b) - Number(a));
      const tags = new Map();
      allRows.forEach((e) => (e.tags || []).forEach((t) => tags.set(t, (tags.get(t) || 0) + 1)));
      qs('#tlYear', root).innerHTML = '<option value="">همهٔ سال‌ها</option>' +
        years.map((y) => `<option value="${y}" ${filters.year === y ? 'selected' : ''}>${fa(y)}</option>`).join('');
      qs('#tlTag', root).innerHTML = '<option value="">همهٔ برچسب‌ها</option>' +
        [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)
          .map(([t, n]) => `<option value="${esc(t)}" ${filters.tag === t ? 'selected' : ''}>#${esc(t)} (${fa(n)})</option>`).join('');
      state.entryCount = allRows.length;
      void jParts;
    } catch { /* غیرحیاتی */ }

    qs('#tlSearch', root).focus({ preventScroll: true });
  },
};
