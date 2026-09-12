// =========================================================
// پنل ادمین — نمای کلی سفارش‌ها و وضعیت مالی
// =========================================================
import { supabase } from "./supabase-client.js";
import { formatToman, statusBadge } from "./ui.js";

async function fetchAllOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, weight_grams, total_price, status, created_at,
       profiles ( full_name ),
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
  orders.forEach((order) => {
    order.installments.forEach((inst) => {
      if (inst.status === "approved") collected += Number(inst.amount);
      else if (inst.status !== "rejected") outstanding += Number(inst.amount);
    });
  });
  return { collected, outstanding, totalOrders: orders.length };
}

function orderRowHTML(order) {
  return `
    <tr>
      <td data-label="مشتری">${order.profiles?.full_name || "—"}</td>
      <td data-label="محصول">${order.rice_products?.name || "—"}</td>
      <td data-label="وزن">${(order.weight_grams / 1000).toLocaleString("fa-IR")} کیلوگرم</td>
      <td data-label="مبلغ کل">${formatToman(order.total_price)}</td>
      <td data-label="وضعیت">${statusBadge(order.status)}</td>
    </tr>
  `;
}

export async function renderAdminOrders(root) {
  root.innerHTML = `<div class="skeleton" style="height:160px;"></div>`;
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
          <div class="text-muted">وصول‌شده</div>
          <div class="price-line">${formatToman(summary.collected)}</div>
        </div>
        <div class="glass glass-card">
          <div class="text-muted">در انتظار وصول</div>
          <div class="price-line">${formatToman(summary.outstanding)}</div>
        </div>
      </div>
      <div class="glass glass-card" style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>مشتری</th><th>محصول</th><th>وزن</th><th>مبلغ کل</th><th>وضعیت</th></tr></thead>
          <tbody>${orders.map(orderRowHTML).join("") || `<tr><td colspan="5" class="empty-state">سفارشی ثبت نشده است.</td></tr>`}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty-state">خطا در بارگذاری سفارش‌ها.</div>`;
  }
}
