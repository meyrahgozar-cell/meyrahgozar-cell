// =========================================================
// پنل ادمین — تنظیم فرمول کارمزد اقساط
// =========================================================
import { supabase } from "./supabase-client.js";
import { loadFeeSettings, calcOrderPricing } from "./pricing.js";
import { formatToman, toast, showError } from "./ui.js";

export async function renderAdminSettings(root) {
  const settings = await loadFeeSettings(supabase);

  root.innerHTML = `
    <div class="glass glass-card">
      <h3>فرمول کارمزد اقساط</h3>
      <p class="text-muted">
        کارمزد = پایه + (تعداد اقساط − ۱) × افزایش به‌ازای هر قسط. این فرمول روی قیمت نهایی سفارش‌های جدید اعمال می‌شود.
      </p>
      <div class="field"><label>کارمزد پایه (٪)</label>
        <input class="input" type="number" step="0.1" id="st-base" value="${settings.feeBasePercent}" /></div>
      <div class="field"><label>افزایش کارمزد به‌ازای هر قسط اضافه (٪)</label>
        <input class="input" type="number" step="0.1" id="st-per" value="${settings.feePerInstallmentPercent}" /></div>
      <div class="field"><label>حداقل تعداد اقساط</label>
        <input class="input" type="number" min="1" id="st-min" value="${settings.minInstallments}" /></div>
      <div class="field"><label>حداکثر تعداد اقساط</label>
        <input class="input" type="number" min="1" id="st-max" value="${settings.maxInstallments}" /></div>
      <button class="btn btn-primary" id="st-save">ذخیره‌ی تنظیمات</button>
    </div>

    <div class="glass glass-card mt-lg">
      <h3>پیش‌نمایش</h3>
      <p class="text-muted">برای یک سفارش ۱ کیلوگرمی با قیمت ۱٬۰۰۰٬۰۰۰ تومان:</p>
      <div id="st-preview" class="stack gap-sm"></div>
    </div>
  `;

  const inputs = {
    base: root.querySelector("#st-base"),
    per: root.querySelector("#st-per"),
    min: root.querySelector("#st-min"),
    max: root.querySelector("#st-max"),
  };
  const preview = root.querySelector("#st-preview");

  function currentSettings() {
    return {
      feeBasePercent: Number(inputs.base.value),
      feePerInstallmentPercent: Number(inputs.per.value),
      minInstallments: Number(inputs.min.value),
      maxInstallments: Number(inputs.max.value),
    };
  }

  function renderPreview() {
    const s = currentSettings();
    const sampleCounts = [s.minInstallments, Math.round((s.minInstallments + s.maxInstallments) / 2), s.maxInstallments];
    preview.innerHTML = sampleCounts
      .map((n) => {
        const pricing = calcOrderPricing({
          weightGrams: 1000,
          pricePerKg: 1000000,
          installmentCount: n,
          settings: s,
        });
        return `<div class="calc-row"><span>${n} قسط</span><span class="val">${formatToman(pricing.installmentAmount)} × ${n} = ${formatToman(pricing.totalPrice)}</span></div>`;
      })
      .join("");
  }

  Object.values(inputs).forEach((input) => input.addEventListener("input", renderPreview));
  renderPreview();

  root.querySelector("#st-save").addEventListener("click", async () => {
    const s = currentSettings();
    const rows = [
      { key: "fee_base_percent", value: String(s.feeBasePercent) },
      { key: "fee_per_installment_percent", value: String(s.feePerInstallmentPercent) },
      { key: "min_installments", value: String(s.minInstallments) },
      { key: "max_installments", value: String(s.maxInstallments) },
    ];
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    if (error) return showError(error.message);
    toast("تنظیمات ذخیره شد.");
  });
}
