// =========================================================
// پنل ادمین — نمای کلی سفارش‌ها، وضعیت مالی، و پیشرفت ارسال
// =========================================================
import { supabase } from "./supabase-client.js";
import { formatToman, statusBadge, toast, showError } from "./ui.js";

const FULFILLMENT_OPTIONS = [
  { value: "processing", label: "در حال آماده‌سازی" },
  { value: "shipped", label: "ارسال شد" },
  { value: "delivered", label: "تحویل داده شد" },
];

async function fetchAllOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, weight_grams, total_price, status, fulfillment_status, installment_count, created_at,
       profiles ( full_name, phone ),
       rice_products ( name ),
       installments ( amount, status )`
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

function summarize(orders) {
  let collected = 0;
  let outstanding = 0;
  let totalGrams = 0;
  let awaitingShipment = 0;

  orders.forEach((order) => {
    totalGrams += order.weight_grams;
    if (order.fulfillment_status === "processing") awaitingShipment += 1;
    order.installments.forEach((inst) => {
      if (inst.status === "approved") collected += Number(inst.amount);
      else if (inst.status !== "rejected") outstanding += Number(inst.amount);
    });
  });

  return { collected, outstanding, totalOrders: orders.length, totalGrams, awaitingShipment };
}

function installmentProgress(order) {
  const approved = order.installments.filter((i) => i.status === "approved").length;
  return `${approved.toLocaleString("fa-IR")} از ${order.installment_count.toLocaleString("fa-IR")}`;
}

function fulfillmentSelectHTML(order) {
  const options = FULFILLMENT_OPTIONS.map(
    (opt) =>
      `<option value="${opt.value}" ${opt.value === order.fulfillment_status ? "selected" : ""}>${opt.label}</option>`
  ).join("");
  return `<select class="input fulfillment-select" data-order-id="${order.id}" style="padding:0.4rem 0.6rem;">${options}</select>`;
}

function orderRowHTML(order) {
  return `
    <tr>
      <td data-label="مشتری">
        ${order.profiles?.full_name || "—"}
        <div class="text-muted" style="font-size:0.8rem;">${order.profiles?.phone || ""}</div>
      </td>
      <td data-label="محصول">${order.rice_products?.name || "—"}</td>
      <td data-label="وزن">${(order.weight_grams / 1000).toLocaleString("fa-IR")} کیلوگرم</td>
      <td data-label="مبلغ کل">${formatToman(order.total_price)}</td>
      <td data-label="اقساط تایید‌شده">${installmentProgress(order)}</td>
      <td data-label="وضعیت پرداخت">${statusBadge(order.status)}</td>
      <td data-label="وضعیت ارسال">${fulfillmentSelectHTML(order)}</td>
    </tr>
  `;
}

export async function renderAdminOrders(root) {
  root.innerHTML = `<div class="skeleton" style="height:160px;"></div>`;

  async function refresh() {
    try {
      const orders = await fetchAllOrders();
      const summary = summarize(orders);

      root.innerHTML = `
        <div class="grid-3" style="margin-bottom:1.5rem;">
          <div class="glass glass-card">
            <div class="text-muted">تعداد سفارش‌ها</div>
            <div class="price-line">${summary.totalOrders.toLocaleString("fa-IR")}</div>
          </div>
          <div class="glass glass-card">
            <div class="text-muted">مجموع برنج فروخته‌شده</div>
            <div class="price-line">${(summary.totalGrams / 1000).toLocaleString("fa-IR")} <small>کیلوگرم</small></div>
          </div>
          <div class="glass glass-card">
            <div class="text-muted">وصول‌شده</div>
            <div class="price-line">${formatToman(summary.collected)}</div>
          </div>
          <div class="glass glass-card">
            <div class="text-muted">در انتظار وصول</div>
            <div class="price-line">${formatToman(summary.outstanding)}</div>
          </div>
          <div class="glass glass-card">
            <div class="text-muted">در انتظار ارسال</div>
            <div class="price-line">${summary.awaitingShipment.toLocaleString("fa-IR")}</div>
          </div>
        </div>
        <div class="glass glass-card" style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>مشتری</th><th>محصول</th><th>وزن</th><th>مبلغ کل</th>
                <th>اقساط تایید‌شده</th><th>وضعیت پرداخت</th><th>وضعیت ارسال</th>
              </tr>
            </thead>
            <tbody>${orders.map(orderRowHTML).join("") || `<tr><td colspan="7" class="empty-state">سفارشی ثبت نشده است.</td></tr>`}</tbody>
          </table>
        </div>
      `;
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="empty-state">خطا در بارگذاری سفارش‌ها.</div>`;
    }
  }

  root.addEventListener("change", async (e) => {
    const select = e.target.closest(".fulfillment-select");
    if (!select) return;
    const { error } = await supabase
      .from("orders")
      .update({ fulfillment_status: select.value })
      .eq("id", select.dataset.orderId);
    if (error) return showError(error.message);
    toast("وضعیت ارسال به‌روزرسانی شد.");
  });

  await refresh();
}
