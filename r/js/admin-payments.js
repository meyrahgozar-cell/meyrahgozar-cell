// =========================================================
// پنل ادمین — بررسی و تایید/رد رسیدهای پرداخت
// =========================================================
import { supabase, RECEIPTS_BUCKET } from "./supabase-client.js";
import { formatToman, toast, showError, confirmAction } from "./ui.js";
import { formatJalali } from "./jalali.js";

async function fetchPendingPayments() {
  const { data, error } = await supabase
    .from("payments")
    .select(
      `id, amount_claimed, receipt_image_path, created_at,
       installments ( id, installment_number, due_date,
         orders ( id, weight_grams,
           profiles ( full_name, phone ),
           rice_products ( name ) ) )`
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

async function signedReceiptUrl(path) {
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, 300);
  if (error) {
    console.error(error);
    return null;
  }
  return data.signedUrl;
}

async function paymentRowHTML(payment) {
  const order = payment.installments.orders;
  const url = await signedReceiptUrl(payment.receipt_image_path);
  return `
    <div class="glass glass-card" data-payment-id="${payment.id}">
      <div class="row justify-between wrap gap-sm">
        <div>
          <strong>${order.profiles?.full_name || "مشتری"}</strong>
          <div class="text-muted">${order.profiles?.phone || ""}</div>
        </div>
        <span class="badge badge-pending">قسط ${payment.installments.installment_number}</span>
      </div>
      <p class="text-muted">
        سفارش: ${order.rice_products?.name} · ${(order.weight_grams / 1000).toLocaleString("fa-IR")} کیلوگرم ·
        سررسید: ${formatJalali(payment.installments.due_date)}
      </p>
      <p><strong>مبلغ ادعا شده:</strong> ${formatToman(payment.amount_claimed)}</p>
      ${
        url
          ? `<a href="${url}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">مشاهده‌ی رسید</a>`
          : `<span class="text-muted">تصویر رسید در دسترس نیست</span>`
      }
      <div class="row gap-sm mt-lg">
        <button class="btn btn-primary btn-sm approve-btn" data-id="${payment.id}" data-installment="${payment.installments.id}">تایید</button>
        <button class="btn btn-danger btn-sm reject-btn" data-id="${payment.id}" data-installment="${payment.installments.id}">رد</button>
      </div>
    </div>
  `;
}

export async function renderAdminPayments(root) {
  root.innerHTML = `<div class="skeleton" style="height:160px;"></div>`;

  async function refresh() {
    try {
      const payments = await fetchPendingPayments();
      if (!payments.length) {
        root.innerHTML = `<div class="empty-state">پرداختی در انتظار بررسی نیست.</div>`;
        return;
      }
      const rows = await Promise.all(payments.map(paymentRowHTML));
      root.innerHTML = `<div class="stack gap-md">${rows.join("")}</div>`;
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="empty-state">خطا در بارگذاری پرداخت‌ها.</div>`;
    }
  }

  root.addEventListener("click", async (e) => {
    const approveBtn = e.target.closest(".approve-btn");
    const rejectBtn = e.target.closest(".reject-btn");
    const btn = approveBtn || rejectBtn;
    if (!btn) return;

    const isApprove = Boolean(approveBtn);
    const ok = await confirmAction(
      isApprove ? "این پرداخت تایید شود؟" : "این پرداخت رد شود؟",
      isApprove ? "قسط مربوطه به‌عنوان تایید‌شده ثبت می‌شود." : "مشتری باید رسید جدید ارسال کند."
    );
    if (!ok) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { error: paymentError } = await supabase
      .from("payments")
      .update({
        status: isApprove ? "approved" : "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: session.user.id,
      })
      .eq("id", btn.dataset.id);
    if (paymentError) return showError(paymentError.message);

    const { error: instError } = await supabase
      .from("installments")
      .update({ status: isApprove ? "approved" : "rejected" })
      .eq("id", btn.dataset.installment);
    if (instError) return showError(instError.message);

    toast(isApprove ? "پرداخت تایید شد." : "پرداخت رد شد.");
    refresh();
  });

  await refresh();
}
