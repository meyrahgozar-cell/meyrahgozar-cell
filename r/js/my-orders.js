// =========================================================
// سفارش‌های من — نمایش اقساط و آپلود رسید پرداخت کارت‌به‌کارت
// =========================================================
import { supabase, RECEIPTS_BUCKET } from "./supabase-client.js";
import { formatToman, statusBadge, toast, showError, el } from "./ui.js";
import { formatJalali } from "./jalali.js";

export async function fetchMyOrders(userId) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, weight_grams, total_price, installment_count, status, created_at,
       rice_products ( name ),
       installments ( id, installment_number, amount, due_date, status,
         payments ( id, status, created_at ) )`
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

function orderCardHTML(order) {
  const installments = [...order.installments].sort(
    (a, b) => a.installment_number - b.installment_number
  );

  const rows = installments
    .map((inst) => {
      const latestPayment = [...(inst.payments || [])].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )[0];
      const canUpload = inst.status === "pending" || inst.status === "rejected";
      return `
        <div class="installment-row" data-installment-id="${inst.id}">
          <div>
            <strong>قسط ${inst.installment_number}</strong>
            <div class="text-muted">سررسید: ${formatJalali(inst.due_date)}</div>
          </div>
          <div>${formatToman(inst.amount)}</div>
          <div>${statusBadge(inst.status)}</div>
          <div>
            ${
              canUpload
                ? `<label class="btn btn-ghost btn-sm">
                     آپلود رسید
                     <input type="file" accept="image/*" class="hidden receipt-input" data-installment-id="${inst.id}" data-amount="${inst.amount}" />
                   </label>`
                : latestPayment
                ? `<span class="text-muted">ارسال شده</span>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="glass glass-card" data-order-id="${order.id}">
      <div class="row justify-between wrap gap-sm">
        <h3>${order.rice_products?.name || "برنج"}</h3>
        ${statusBadge(order.status)}
      </div>
      <p class="text-muted">
        وزن: ${(order.weight_grams / 1000).toLocaleString("fa-IR")} کیلوگرم ·
        مبلغ کل: ${formatToman(order.total_price)} · ${order.installment_count} قسط
      </p>
      <div class="installment-list">${rows}</div>
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
    root.innerHTML = orders.map(orderCardHTML).join("");
    root.addEventListener("change", (e) => handleReceiptUpload(e, userId, () => renderMyOrders(root, userId)));
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty-state">خطا در بارگذاری سفارش‌ها.</div>`;
  }
}

async function handleReceiptUpload(e, userId, onDone) {
  const input = e.target.closest(".receipt-input");
  if (!input || !input.files?.length) return;

  const file = input.files[0];
  const installmentId = input.dataset.installmentId;
  const amount = Number(input.dataset.amount);

  try {
    const path = `${userId}/${installmentId}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;

    const { error: paymentError } = await supabase.from("payments").insert({
      installment_id: installmentId,
      receipt_image_path: path,
      amount_claimed: amount,
      status: "pending",
    });
    if (paymentError) throw paymentError;

    await supabase.from("installments").update({ status: "submitted" }).eq("id", installmentId);

    toast("رسید با موفقیت ارسال شد و در انتظار بررسی است.");
    onDone?.();
  } catch (err) {
    console.error(err);
    showError(err.message || "آپلود رسید با خطا مواجه شد.");
  }
}
