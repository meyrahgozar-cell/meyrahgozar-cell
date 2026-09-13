// =========================================================
// سفارش‌های من — هر سفارش یک کارت، با یک گزینه‌ی جداگانه برای لیست اقساط
// (به‌جای نمایش فله‌ای همه‌ی اقساط همه‌ی سفارش‌ها پشت سر هم)
// =========================================================
import { supabase } from "./supabase-client.js";
import { formatToman, statusBadge, effectiveInstallmentStatus, toast, showError } from "./ui.js";
import { formatJalali } from "./jalali.js";
import { telegramReceiptLink } from "./config.js";

export async function fetchMyOrders(userId) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, weight_grams, total_price, installment_count, status, fulfillment_status, created_at,
       rice_products ( name ),
       installments ( id, installment_number, amount, due_date, status,
         payments ( id, status, created_at ) )`
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

function installmentRowHTML(inst, orderLabel, { plainLabel = false } = {}) {
  const latestPayment = [...(inst.payments || [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )[0];
  const canSend = inst.status === "pending" || inst.status === "rejected";
  const titleText = plainLabel ? "پرداخت" : `قسط ${inst.installment_number}`;

  return `
    <div class="installment-row" data-installment-id="${inst.id}">
      <div>
        <strong>${titleText}</strong>
        <div class="text-muted">سررسید: ${formatJalali(inst.due_date)}</div>
      </div>
      <div>${formatToman(inst.amount)}</div>
      <div>${statusBadge(effectiveInstallmentStatus(inst.status, inst.due_date))}</div>
      <div>
        ${
          canSend
            ? `<label class="btn btn-ghost btn-sm">
                 ارسال رسید در تلگرام
                 <input type="file" accept="image/*" class="hidden receipt-input"
                   data-installment-id="${inst.id}"
                   data-amount="${inst.amount}"
                   data-installment-number="${inst.installment_number}"
                   data-order-label="${orderLabel}" />
               </label>`
            : latestPayment
            ? `<span class="text-muted">ارسال شده</span>`
            : ""
        }
      </div>
    </div>
  `;
}

function orderCardHTML(order) {
  const installments = [...order.installments].sort(
    (a, b) => a.installment_number - b.installment_number
  );
  const productName = order.rice_products?.name || "برنج";
  const orderLabel = `${productName} (${order.id.slice(0, 8)})`;
  const isSinglePayment = order.installment_count <= 1;

  const summaryLine = isSinglePayment
    ? `وزن: ${(order.weight_grams / 1000).toLocaleString("fa-IR")} کیلوگرم · مبلغ: ${formatToman(order.total_price)}`
    : `وزن: ${(order.weight_grams / 1000).toLocaleString("fa-IR")} کیلوگرم · مبلغ کل: ${formatToman(order.total_price)} · ${order.installment_count} قسط`;

  const installmentsSection = isSinglePayment
    ? `<div class="installment-list">${installmentRowHTML(installments[0], orderLabel, { plainLabel: true })}</div>`
    : `
      <button class="btn btn-ghost btn-sm toggle-installments-btn" data-order-id="${order.id}">نمایش لیست اقساط</button>
      <div class="installment-list hidden" data-order-id="${order.id}">
        ${installments.map((inst) => installmentRowHTML(inst, orderLabel)).join("")}
      </div>
    `;

  return `
    <div class="glass glass-card" data-order-id="${order.id}">
      <div class="row justify-between wrap gap-sm">
        <h3>${productName}</h3>
        <div class="row gap-sm">
          ${statusBadge(order.status)}
          ${statusBadge(order.fulfillment_status)}
        </div>
      </div>
      <p class="text-muted">${summaryLine}</p>
      ${installmentsSection}
    </div>
  `;
}

export async function renderMyOrders(root, userId) {
  root.innerHTML = `<div class="skeleton" style="height:160px;"></div>`;
  try {
    const orders = await fetchMyOrders(userId);
    if (!orders.length) {
      root.innerHTML = `<div class="empty-state">هنوز سفارشی ثبت نکرده‌اید.</div>`;
      return;
    }
    root.innerHTML = `<div class="stack gap-md">${orders.map(orderCardHTML).join("")}</div>`;
    root.addEventListener("change", (e) => handleSendReceipt(e, () => renderMyOrders(root, userId)));
    root.addEventListener("click", (e) => {
      const btn = e.target.closest(".toggle-installments-btn");
      if (!btn) return;
      const list = root.querySelector(`.installment-list[data-order-id="${btn.dataset.orderId}"]`);
      const isHidden = list.classList.toggle("hidden");
      btn.textContent = isHidden ? "نمایش لیست اقساط" : "بستن لیست اقساط";
    });
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty-state">خطا در بارگذاری سفارش‌ها.</div>`;
  }
}

async function handleSendReceipt(e, onDone) {
  const input = e.target.closest(".receipt-input");
  if (!input || !input.files?.length) return;

  const installmentId = input.dataset.installmentId;
  const amount = Number(input.dataset.amount);
  const installmentNumber = input.dataset.installmentNumber;
  const orderLabel = input.dataset.orderLabel;

  try {
    // یک ادعای پرداخت ثبت میشه تا ادمین توی پنل ببینتش (بدون تصویر —
    // تصویر مستقیم توی تلگرام برای فروشنده ارسال میشه)
    const { error: paymentError } = await supabase.from("payments").insert({
      installment_id: installmentId,
      amount_claimed: amount,
      status: "pending",
    });
    if (paymentError) throw paymentError;

    await supabase.from("installments").update({ status: "submitted" }).eq("id", installmentId);

    const link = telegramReceiptLink({
      orderLabel,
      installmentNumber,
      amount: formatToman(amount),
    });
    window.open(link, "_blank");

    toast("حالا توی تلگرامی که باز شد، همون عکس رسید رو ضمیمه و ارسال کن.");
    onDone?.();
  } catch (err) {
    console.error(err);
    showError(err.message || "ثبت درخواست با خطا مواجه شد.");
  } finally {
    input.value = "";
  }
}
