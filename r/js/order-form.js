// =========================================================
// فرم سفارش جدید — انتخاب برنج، وزن، تعداد اقساط، پیش‌نمایش قیمت زنده
// =========================================================
import { supabase } from "./supabase-client.js";
import { fetchActiveProducts } from "./products.js";
import { loadFeeSettings, calcOrderPricing } from "./pricing.js";
import { formatToman, formatGramsAsKg, toast, showError } from "./ui.js";
import { addDays } from "./jalali.js";

const DAYS_BETWEEN_INSTALLMENTS = 30;

export async function initOrderForm(root, { onOrderCreated, preselectedProductId } = {}) {
  const [products, feeSettings] = await Promise.all([
    fetchActiveProducts(),
    loadFeeSettings(supabase),
  ]);

  if (!products.length) {
    root.innerHTML = `<div class="empty-state">فعلاً محصولی برای سفارش موجود نیست.</div>`;
    return;
  }

  const initialProductId =
    preselectedProductId && products.some((p) => p.id === preselectedProductId)
      ? preselectedProductId
      : products[0].id;

  const state = {
    productId: initialProductId,
    weightGrams: 1000,
    installmentCount: feeSettings.minInstallments,
  };

  root.innerHTML = `
    <div class="field">
      <label>نوع برنج</label>
      <select class="input" id="of-product">
        ${products
          .map(
            (p) =>
              `<option value="${p.id}" ${p.id === initialProductId ? "selected" : ""}>${p.name} — ${formatToman(p.price_per_kg)} / کیلو</option>`
          )
          .join("")}
      </select>
    </div>

    <div class="field">
      <label>وزن (گرم) — معادل <span id="of-kg"></span></label>
      <input class="input" type="number" id="of-weight" min="100" step="100" value="${state.weightGrams}" />
    </div>

    <div class="field">
      <label>تعداد اقساط</label>
      <div class="chip-select" id="of-installments"></div>
    </div>

    <div class="glass glass-strong glass-card" id="of-preview" style="margin-top:1rem;"></div>

    <button class="btn btn-primary btn-block mt-lg" id="of-submit">ثبت سفارش</button>
  `;

  const productSelect = root.querySelector("#of-product");
  const weightInput = root.querySelector("#of-weight");
  const kgLabel = root.querySelector("#of-kg");
  const installmentsWrap = root.querySelector("#of-installments");
  const preview = root.querySelector("#of-preview");
  const submitBtn = root.querySelector("#of-submit");

  const installmentOptions = [];
  for (let n = feeSettings.minInstallments; n <= feeSettings.maxInstallments; n += 1) {
    installmentOptions.push(n);
  }
  installmentsWrap.innerHTML = installmentOptions
    .map(
      (n) =>
        `<button type="button" class="chip${n === state.installmentCount ? " is-selected" : ""}" data-n="${n}">${n} قسط</button>`
    )
    .join("");

  function currentProduct() {
    return products.find((p) => p.id === productSelect.value);
  }

  function renderPreview() {
    const product = currentProduct();
    kgLabel.textContent = formatGramsAsKg(state.weightGrams);

    const pricing = calcOrderPricing({
      weightGrams: state.weightGrams,
      pricePerKg: product.price_per_kg,
      installmentCount: state.installmentCount,
      settings: feeSettings,
    });

    preview.innerHTML = `
      <div class="calc-row"><span>قیمت پایه</span><span class="val">${formatToman(pricing.basePrice)}</span></div>
      <div class="calc-row"><span>کارمزد اقساط</span><span class="val">٪${pricing.feePercent.toFixed(1)}</span></div>
      <div class="calc-row"><span>مبلغ هر قسط (${state.installmentCount} قسط)</span><span class="val">${formatToman(pricing.installmentAmount)}</span></div>
      <div class="calc-row calc-total"><span>مبلغ نهایی</span><span class="val">${formatToman(pricing.totalPrice)}</span></div>
    `;
    return pricing;
  }

  productSelect.addEventListener("change", renderPreview);
  weightInput.addEventListener("input", () => {
    state.weightGrams = Math.max(100, Number(weightInput.value) || 0);
    renderPreview();
  });
  installmentsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.installmentCount = Number(btn.dataset.n);
    installmentsWrap
      .querySelectorAll(".chip")
      .forEach((c) => c.classList.toggle("is-selected", c === btn));
    renderPreview();
  });

  renderPreview();

  submitBtn.addEventListener("click", async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = "در حال ثبت...";
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const product = currentProduct();
      const pricing = renderPreview();

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: session.user.id,
          product_id: product.id,
          weight_grams: state.weightGrams,
          base_price: Math.round(pricing.basePrice),
          installment_count: state.installmentCount,
          fee_percent: pricing.feePercent,
          total_price: pricing.totalPrice,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      const today = new Date();
      const installmentRows = pricing.amounts.map((amount, index) => ({
        order_id: order.id,
        installment_number: index + 1,
        amount,
        due_date: addDays(today, (index + 1) * DAYS_BETWEEN_INSTALLMENTS)
          .toISOString()
          .slice(0, 10),
      }));

      const { error: instError } = await supabase.from("installments").insert(installmentRows);
      if (instError) throw instError;

      toast("سفارش با موفقیت ثبت شد.");
      onOrderCreated?.(order);
    } catch (err) {
      console.error(err);
      showError(err.message || "ثبت سفارش با خطا مواجه شد.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "ثبت سفارش";
    }
  });
}
