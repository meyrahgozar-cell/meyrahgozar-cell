import { esc, icon, qs, on } from '../lib/dom.js';
import { fa, fmtDate, plural } from '../lib/format.js';
import { navigate, current } from '../lib/router.js';
import { toast, openModal, confirmDialog, field } from '../lib/ui.js';
import { db, coverOf } from '../services/db.js';
import { emptyState, entryCard, entryMenu } from '../ui/parts.js';
import { bus } from '../state.js';

const COLORS = ['#4fcf9f', '#e7bb76', '#f08ba1', '#a895f7', '#74b9f0', '#d9906f'];

function threadForm(thread = {}) {
  return `
    ${field('عنوان', `<input class="input" name="title" value="${esc(thread.title || '')}" placeholder="مثلاً: سال‌های تهران" />`)}
    <div style="height:10px"></div>
    ${field('این رشته دربارهٔ چیست؟', `<textarea class="textarea" name="description" rows="3" placeholder="یک یا دو جمله برای زمینه…">${esc(thread.description || '')}</textarea>`)}
    <div style="height:10px"></div>
    <span class="field__label">رنگ</span>
    <div class="accent-row" style="margin-top:6px">
      ${COLORS.map((c) => `<button type="button" class="accent-dot" data-color="${c}" style="background:${c};color:${c};${thread.color === c ? 'box-shadow:inset 0 0 0 2px var(--surface),0 0 0 2px currentColor' : ''}"></button>`).join('')}
    </div>`;
}

function wireColorPicker(modal) {
  let color = modal.querySelector('.accent-dot[style*="0 0 0 2px"]')?.dataset.color || COLORS[0];
  modal.querySelectorAll('[data-color]').forEach((dot) => {
    dot.addEventListener('click', () => {
      color = dot.dataset.color;
      modal.querySelectorAll('[data-color]').forEach((d) => {
        d.style.boxShadow = d === dot
          ? 'inset 0 0 0 2px var(--surface), 0 0 0 2px currentColor'
          : 'inset 0 0 0 2px var(--surface)';
      });
    });
  });
  return () => color;
}

function openThreadModal(existing = null, onSaved = () => {}) {
  const getColor = { fn: null };
  openModal({
    title: existing ? 'ویرایش رشته' : 'رشتهٔ تازه',
    subtitle: 'رشته‌ها قاب‌ها را به هم می‌بندند تا داستانی بلندتر ساخته شود.',
    body: threadForm(existing || {}),
    actions: [
      { label: 'بی‌خیال', onClick: (close) => close() },
      {
        label: existing ? 'ذخیره' : 'بساز',
        variant: 'primary',
        onClick: async (close, modal) => {
          const title = qs('input[name=title]', modal).value.trim();
          if (!title) { qs('input[name=title]', modal).focus(); return true; }
          const description = qs('textarea[name=description]', modal).value.trim();
          try {
            const saved = await db.threads.save({
              ...(existing || {}), title, description, color: getColor.fn ? getColor.fn() : COLORS[0],
            });
            toast(existing ? 'رشته به‌روز شد' : 'رشته ساخته شد', { type: 'success' });
            close();
            onSaved(saved);
            bus.emit('entries:changed');
          } catch (err) { toast(err.message, { type: 'error' }); return true; }
          return true;
        },
      },
    ],
    onMount: (modal) => { getColor.fn = wireColorPicker(modal); },
  });
}

export const threadsView = {
  title: 'رشته‌ها',
  sub: () => 'داستان‌های بلندتری که از چند قاب ساخته می‌شوند',
  async mount(root) {
    root.innerHTML = `<div class="threads-grid">${Array.from({ length: 3 }).map(() => '<div class="skeleton" style="height:220px"></div>').join('')}</div>`;
    try {
      const [threads, entries] = await Promise.all([db.threads.list(), db.entries.all()]);
      const byThread = new Map();
      entries.forEach((e) => {
        if (!e.thread_id) return;
        if (!byThread.has(e.thread_id)) byThread.set(e.thread_id, []);
        byThread.get(e.thread_id).push(e);
      });

      root.innerHTML = `
        <div class="spread" style="margin-bottom:var(--sp-5)">
          <p class="muted" style="font-size:var(--fs-sm);max-width:56ch">یک رشته، قاب‌هایی را نگه می‌دارد که به یک قوس زندگی تعلق دارند — یک کار، یک شهر، یک آدم، یک بهبود. قاب‌ها را از ویرایشگر به رشته وصل می‌کنی.</p>
          <button class="btn btn--primary" id="newThread">${icon('plus')}رشتهٔ تازه</button>
        </div>
        ${threads.length ? `<div class="threads-grid stagger">${threads.map((t) => {
          const list = byThread.get(t.id) || [];
          const cover = list.map(coverOf).find(Boolean) || '';
          return `<button class="thread-card" data-thread="${esc(t.id)}" type="button">
            <span class="thread-card__cover ${cover ? '' : 'thread-card__cover--empty'}">
              ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" />` : icon('threads', 'ico--lg')}
              <span class="thread-card__count">${plural(list.length, 'قاب')}</span>
            </span>
            <span class="thread-card__body">
              <span class="thread-card__line" style="background:${esc(t.color || 'var(--accent)')}"></span>
              <h3>${esc(t.title)}</h3>
              <p>${esc(t.description || 'هنوز توضیحی ندارد')}</p>
            </span>
          </button>`;
        }).join('')}</div>` : emptyState({
          iconName: 'threads',
          title: 'هنوز رشته‌ای نیست',
          text: 'رشته‌ها اجازه می‌دهند فصلی از زندگی‌ات را یک داستان پیوسته بخوانی.',
          action: '<button class="btn btn--primary" id="newThread2">' + icon('plus') + 'اولین رشته را بساز</button>',
        })}`;

      const open = () => openThreadModal(null, () => this.mount(root));
      qs('#newThread', root)?.addEventListener('click', open);
      qs('#newThread2', root)?.addEventListener('click', open);
      if (current().query.new === '1') open();

      on(root, 'click', '[data-thread]', (e, t) => navigate(`/thread/${t.dataset.thread}`));
    } catch (err) {
      root.innerHTML = emptyState({ iconName: 'alert', title: 'رشته‌ها بارگذاری نشد', text: err.message });
    }
  },
};

export const threadDetailView = {
  title: 'رشته',
  sub: () => '',
  async mount(root, ctx) {
    const id = ctx.params.id;
    root.innerHTML = `<div class="skeleton" style="height:140px;margin-bottom:20px"></div>${Array.from({ length: 3 }).map(() => '<div class="skeleton" style="height:70px;margin-bottom:12px"></div>').join('')}`;
    try {
      const [threads, entries] = await Promise.all([db.threads.list(), db.entries.all()]);
      const thread = threads.find((t) => t.id === id);
      if (!thread) {
        root.innerHTML = emptyState({ iconName: 'threads', title: 'این رشته پیدا نشد', text: 'شاید پاک شده باشد.', action: '<a class="btn btn--outline" href="#/threads">همهٔ رشته‌ها</a>' });
        return;
      }
      const list = entries.filter((e) => e.thread_id === id)
        .sort((a, b) => String(a.happened_on).localeCompare(String(b.happened_on)));
      const covers = list.map(coverOf).filter(Boolean).slice(0, 3);
      this.title = thread.title;
      this.sub = () => `${plural(list.length, 'قاب')}${list.length ? ` · ${fmtDate(list[0].happened_on, 'month')} تا ${fmtDate(list[list.length - 1].happened_on, 'month')}` : ''}`;
      bus.emit('shell:title');

      root.innerHTML = `
        <div class="ed-head">
          <a class="ed-head__back" href="#/threads">${icon('arrow-right')}همهٔ رشته‌ها</a>
          <div style="margin-inline-start:auto" class="row">
            <button class="btn btn--sm btn--outline" id="editThread">${icon('pencil')}ویرایش</button>
            <button class="icon-btn" id="delThread" title="پاک کردن رشته">${icon('trash')}</button>
          </div>
        </div>

        <header class="card" style="margin-bottom:var(--sp-6);overflow:hidden">
          <div style="display:grid;grid-template-columns:${covers.length ? '220px 1fr' : '1fr'}">
            ${covers.length ? `<div style="background:var(--surface-3)"><img src="${esc(covers[0])}" alt="" style="width:100%;height:100%;object-fit:cover;min-height:180px" /></div>` : ''}
            <div style="padding:var(--sp-5)">
              <span style="display:inline-block;height:3px;width:34px;border-radius:2px;background:${esc(thread.color || 'var(--accent)')};margin-bottom:12px"></span>
              <h1 class="serif" style="font-size:var(--fs-3xl);line-height:1.35">${esc(thread.title)}</h1>
              <p class="muted" style="margin-top:8px;max-width:60ch;font-size:var(--fs-sm)">${esc(thread.description || 'هنوز توضیحی ندارد.')}</p>
              <div class="row" style="margin-top:var(--sp-4);gap:var(--sp-4)">
                <span class="faint" style="font-size:var(--fs-2xs)">${plural(list.length, 'قاب')}</span>
                <span class="faint" style="font-size:var(--fs-2xs)">${plural(list.reduce((n, e) => n + (e.photos?.length || 0), 0), 'عکس')}</span>
                <span class="faint" style="font-size:var(--fs-2xs)">${fa(list.reduce((n, e) => n + (e.word_count || 0), 0))} کلمه</span>
              </div>
            </div>
          </div>
        </header>

        ${list.length ? `<div class="storyline">${list.map((e) => `
          <div class="storyline__item storyline__item--has">
            <div class="storyline__date">${esc(fmtDate(e.happened_on, 'medium'))}</div>
            <div class="storyline__rail"><span class="storyline__dot" style="background:${e.mood ? 'var(--accent)' : ''}"></span></div>
            <div>${entryCard(e)}</div>
          </div>`).join('')}</div>` : emptyState({
          iconName: 'reel',
          title: 'این رشته هنوز قابی ندارد',
          text: 'هر قابی را باز کن، در نوار کنار همین رشته را انتخاب کن تا به داستان بپیوندد.',
          action: `<a class="btn btn--primary" href="#/timeline">${icon('reel')}پیدا کردن قاب</a>`,
        })}`;

      qs('#editThread', root).addEventListener('click', () => openThreadModal(thread, () => this.mount(root, ctx)));
      qs('#delThread', root).addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'این رشته پاک شود؟',
          message: 'قاب‌های داخلش می‌مانند — فقط دیگر گروه‌بندی نمی‌شوند. این کار بازگشت‌پذیر نیست.',
          confirmLabel: 'پاک کن',
          danger: true,
        });
        if (!ok) return;
        await db.threads.remove(thread.id);
        toast('رشته پاک شد', { type: 'success' });
        navigate('/threads');
      });

      on(root, 'click', '[data-open]', (e, t) => {
        if (e.target.closest('button.icon-btn')) return;
        navigate(`/frame/${t.dataset.open}`);
      });
      on(root, 'click', '[data-menu]', (e, t) => {
        const entry = list.find((x) => x.id === t.dataset.menu);
        if (entry) entryMenu(t, entry);
      });
    } catch (err) {
      root.innerHTML = emptyState({ iconName: 'alert', title: 'رشته بارگذاری نشد', text: err.message });
    }
  },
};
