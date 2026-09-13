// =========================================================
// پنل ادمین — مدیریت محصولات برنج
// =========================================================
import { supabase } from "./supabase-client.js";
import { formatToman, toast, showError, confirmAction } from "./ui.js";

async function fetchAllProducts() {
  const { data, error } = await supabase
    .from("rice_products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

function rowHTML(product) {
  return `
    <tr data-id="${product.id}">
      <td data-label="نام">${product.name}</td>
      <td data-label="قیمت هر کیلو">${formatToman(product.price_per_kg)}</td>
      <td data-label="موجودی">${(product.stock_grams / 1000).toLocaleString("fa-IR")} کیلوگرم</td>
      <td data-label="وضعیت">
        <span class="badge ${product.is_active ? "badge-approved" : "badge-cancelled"}">
          ${product.is_active ? "فعال" : "غیرفعال"}
        </span>
      </td>
      <td data-label="عملیات">
        <button class="btn btn-ghost btn-sm edit-btn" data-id="${product.id}">ویرایش</button>
        <button class="btn btn-ghost btn-sm toggle-btn" data-id="${product.id}" data-active="${product.is_active}">
          ${product.is_active ? "غیرفعال کن" : "فعال کن"}
        </button>
      </td>
    </tr>
  `;
}

export async function renderAdminProducts(root) {
  root.innerHTML = `
    <div class="row justify-between wrap gap-sm" style="margin-bottom:1rem;">
      <h3>محصولات برنج</h3>
      <button class="btn btn-primary btn-sm" id="new-product-btn">+ محصول جدید</button>
    </div>
    <div class="glass glass-card" style="overflow-x:auto;">
      <table class="data-table" id="products-table">
        <thead>
          <tr><th>نام</th><th>قیمت هر کیلو</th><th>موجودی</th><th>وضعیت</th><th>عملیات</th></tr>
        </thead>
        <tbody><tr><td colspan="5"><div class="skeleton" style="height:40px;"></div></td></tr></tbody>
      </table>
    </div>
  `;

  const tbody = root.querySelector("tbody");

  async function refresh() {
    try {
      const products = await fetchAllProducts();
      tbody.innerHTML = products.length
        ? products.map(rowHTML).join("")
        : `<tr><td colspan="5" class="empty-state">هنوز محصولی ثبت نشده است.</td></tr>`;
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">خطا در بارگذاری.</td></tr>`;
    }
  }

  root.querySelector("#new-product-btn").addEventListener("click", () => openProductForm(refresh));

  tbody.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".edit-btn");
    const toggleBtn = e.target.closest(".toggle-btn");

    if (editBtn) {
      const { data } = await supabase
        .from("rice_products")
        .select("*")
        .eq("id", editBtn.dataset.id)
        .single();
      openProductForm(refresh, data);
    }

    if (toggleBtn) {
      const isActive = toggleBtn.dataset.active === "true";
      const ok = await confirmAction(
        isActive ? "این محصول غیرفعال شود؟" : "این محصول فعال شود؟",
        "کاربران فقط محصولات فعال را می‌بینند."
      );
      if (!ok) return;
      const { error } = await supabase
        .from("rice_products")
        .update({ is_active: !isActive })
        .eq("id", toggleBtn.dataset.id);
      if (error) return showError(error.message);
      toast("وضعیت محصول به‌روزرسانی شد.");
      refresh();
    }
  });

  await refresh();
}

function openProductForm(onSaved, existing = null) {
  const isEdit = Boolean(existing);
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="glass glass-strong glass-panel modal-box">
      <h3>${isEdit ? "ویرایش محصول" : "محصول جدید"}</h3>
      <div class="field"><label>نام برنج</label>
        <input class="input" id="pf-name" value="${existing?.name || ""}" /></div>
      <div class="field"><label>توضیحات</label>
        <textarea class="input" id="pf-desc" rows="2">${existing?.description || ""}</textarea></div>
      <div class="field"><label>قیمت هر کیلوگرم (تومان)</label>
        <input class="input" type="number" id="pf-price" value="${existing?.price_per_kg || ""}" /></div>
      <div class="field"><label>موجودی (گرم)</label>
        <input class="input" type="number" id="pf-stock" value="${existing?.stock_grams || 0}" /></div>
      <div class="field"><label>آدرس تصویر (اختیاری)</label>
        <input class="input" id="pf-image" value="${existing?.image_url || ""}" /></div>
      <div class="row gap-sm">
        <button class="btn btn-primary" id="pf-save">ذخیره</button>
        <button class="btn btn-ghost" id="pf-cancel">انصراف</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector("#pf-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#pf-save").addEventListener("click", async () => {
    const payload = {
      name: backdrop.querySelector("#pf-name").value.trim(),
      description: backdrop.querySelector("#pf-desc").value.trim(),
      price_per_kg: Number(backdrop.querySelector("#pf-price").value),
      stock_grams: Number(backdrop.querySelector("#pf-stock").value),
      image_url: backdrop.querySelector("#pf-image").value.trim() || null,
    };
    if (!payload.name || !payload.price_per_kg) {
      return showError("نام و قیمت الزامی است.");
    }
    const query = isEdit
      ? supabase.from("rice_products").update(payload).eq("id", existing.id)
      : supabase.from("rice_products").insert(payload);
    const { error } = await query;
    if (error) return showError(error.message);
    toast("محصول ذخیره شد.");
    backdrop.remove();
    onSaved();
  });
}
