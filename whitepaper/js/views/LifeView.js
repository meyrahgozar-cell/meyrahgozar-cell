/* ============================================================
   کاغذ سفید — نمای عمر
   ============================================================ */

import { State } from '../core/state.js';
import { toFa, faDate } from '../core/utils.js';
import { Toast } from '../components/Toast.js';

export async function LifeView({ container }) {
  const settings = State.data.settings;
  const birth = new Date(settings.birthDate || '1995-01-01');
  const expectancy = Number(settings.lifeExpectancy) || 85;

  const now = new Date();
  const msLived = now - birth;
  const yearsLived = msLived / (365.25 * 24 * 60 * 60 * 1000);
  const totalWeeks = expectancy * 52;
  const weeksLived = Math.floor(yearsLived * 52);
  const percentLived = Math.min(100, (weeksLived / totalWeeks) * 100);
  const remainingYears = expectancy - yearsLived;

  container.innerHTML = `
    <div class="life-wrapper anim-in">
      <div class="life-hero">
        <h1>♾️ زندگی من</h1>
        <p>هر نقطه، یک هفته از زندگی شماست. باقی‌اش را چگونه می‌خواهید بسازید؟</p>
        <div class="life-big">${toFa(Math.floor(yearsLived))} سال</div>
        <p style="margin-top:8px;color:var(--text-muted);">از ${toFa(expectancy)} سالی که برای خودت در نظر گرفته‌ای</p>
      </div>

      <div class="life-timeline">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:var(--fs-sm);">
          <span>تولد: ${faDate(birth)}</span>
          <span style="color:var(--text-muted);">${toFa(percentLived.toFixed(1))}٪ گذشته</span>
          <span>امید: ${toFa(expectancy)} سال</span>
        </div>
        <div class="life-progress-bar">
          <div class="life-progress-fill" style="width:${percentLived}%"></div>
        </div>
        <div class="life-markers">
          <span>${toFa(0)}</span>
          <span>اکنون (${toFa(Math.floor(yearsLived))})</span>
          <span>${toFa(expectancy)}</span>
        </div>
      </div>

      <div class="life-legend">
        <span><i style="background:var(--iris-600);"></i> گذشته</span>
        <span><i style="background:var(--amber-500);"></i> اکنون</span>
        <span><i style="background:var(--bg-raised);"></i> آینده</span>
      </div>

      <div class="life-weeks" id="weeks"></div>

      <div class="card" style="text-align:center;padding:24px;">
        <div style="font-size:var(--fs-sm);color:var(--text-muted);">باقی‌مانده</div>
        <div style="font-size:var(--fs-3xl);font-weight:800;margin-top:8px;">
          ${toFa(Math.floor(remainingYears))} سال
        </div>
        <div style="color:var(--text-muted);margin-top:4px;">
          ≈ ${toFa(Math.max(0, Math.floor(remainingYears * 365)))} روز • ${toFa(Math.max(0, totalWeeks - weeksLived))} هفته
        </div>
      </div>
    </div>
  `;

  // رندر گرید هفته‌ها
  const weeksEl = container.querySelector('#weeks');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < totalWeeks; i++) {
    const dot = document.createElement('div');
    dot.className = 'life-week';
    if (i < weeksLived) dot.classList.add('lived');
    if (i === weeksLived) dot.classList.add('current');
    const age = (i / 52).toFixed(1);
    dot.title = `هفته ${toFa(i + 1)} — ${toFa(age)} سالگی`;
    frag.appendChild(dot);
  }
  weeksEl.appendChild(frag);

  return { destroy() {} };
}