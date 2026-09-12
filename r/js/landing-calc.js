// =========================================================
// ماشین‌حساب زنده‌ی صفحه‌ی اصلی — بدون نیاز به ورود
// =========================================================
import { supabase } from "./supabase-client.js";
import { fetchActiveProducts } from "./products.js";
import { loadFeeSettings, calcOrderPricing } from "./pricing.js";
import { formatToman, formatGramsAsKg } from "./ui.js";

export async function initLandingCalculator(root) {
  try {
    const [products, feeSettings] = await Promise.all([
      fetchActiveProducts(),
      loadFeeSettings(supabase),
    ]);

    if (!products.length) {
      root.innerHTML = `<p class="text-muted">به‌زودی محصولات و ماشین‌حساب قیمت اینجا نمایش داده می‌شود.</p>`;
      return;
    }

    const state = { weightGrams: 1000, installmentCount: feeSettings.minInstallments };
    const midInstallments = Math.round((feeSettings.minInstallments + feeSettings.maxInstallments) / 2);
    state.installmentCount = midInstallments;
    const product = products[0];

    root.innerHTML = `
      <div class="field">
        <label>وزن برنج: <span id="lc-kg"></span></label>
        <input type="range" class="slider" id="lc-weight" min="500" max="10000" step="500" value="${state.weightGrams}" />
      </div>
      <div class="field">
        <label>تعداد اقساط: <span id="lc-count"></span></label>
        <input type="range" class="slider" id="lc-count-range" min="${feeSettings.minInstallments}" max="${feeSettings.maxInstallments}" step="1" value="${state.installmentCount}" />
      </div>
      <div id="lc-result"></div>
    `;

    const weightSlider = root.querySelector("#lc-weight");
    const countSlider = root.querySelector("#lc-count-range");
    const kgLabel = root.querySelector("#lc-kg");
    const countLabel = root.querySelector("#lc-count");
    const result = root.querySelector("#lc-result");

    function render() {
      kgLabel.textContent = formatGramsAsKg(state.weightGrams);
      countLabel.textContent = `${state.installmentCount} قسط`;

      const pricing = calcOrderPricing({
        weightGrams: state.weightGrams,
        pricePerKg: product.price_per_kg,
        installmentCount: state.installmentCount,
        settings: feeSettings,
      });

      result.innerHTML = `
        <div class="calc-row"><span>برنج ${product.name}</span><span class="val">${formatToman(product.price_per_kg)} / کیلو</span></div>
        <div class="calc-row calc-total"><span>هر قسط</span><span class="val">${formatToman(pricing.installmentAmount)}</span></div>
      `;
    }

    weightSlider.addEventListener("input", () => {
      state.weightGrams = Number(weightSlider.value);
      render();
    });
    countSlider.addEventListener("input", () => {
      state.installmentCount = Number(countSlider.value);
      render();
    });

    render();
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p class="text-muted">ماشین‌حساب موقتاً در دسترس نیست.</p>`;
  }
}
