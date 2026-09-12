// =========================================================
// محصولات برنج — واکشی و نمایش
// =========================================================
import { supabase } from "./supabase-client.js";
import { formatToman } from "./ui.js";

export async function fetchActiveProducts() {
  const { data, error } = await supabase
    .from("rice_products")
    .select("*")
    .eq("is_active", true)
    .order("price_per_kg", { ascending: true });
  if (error) throw error;
  return data;
}

export function productCardHTML(product, { renderCta } = {}) {
  const img = product.image_url
    ? `<img src="${product.image_url}" alt="${product.name}" style="height:150px;object-fit:cover;border-radius:14px;" />`
    : `<div class="grain-chip"></div>`;

  const cta = renderCta
    ? renderCta(product)
    : `<a href="products.html" class="btn btn-primary btn-block">مشاهده و خرید</a>`;

  return `
    <article class="glass glass-card product-card glass-hover" data-product-id="${product.id}">
      ${img}
      <h3>${product.name}</h3>
      <p>${product.description || ""}</p>
      <div class="price-line">${formatToman(product.price_per_kg)} <small>/ کیلوگرم</small></div>
      ${cta}
    </article>
  `;
}

export async function renderProductGrid(containerEl, options = {}) {
  containerEl.innerHTML = `
    <div class="skeleton" style="height:280px;"></div>
    <div class="skeleton" style="height:280px;"></div>
    <div class="skeleton" style="height:280px;"></div>
  `;
  try {
    const products = await fetchActiveProducts();
    if (!products.length) {
      containerEl.innerHTML = `<div class="empty-state">فعلاً محصولی برای فروش ثبت نشده است.</div>`;
      return [];
    }
    containerEl.innerHTML = products.map((p) => productCardHTML(p, options)).join("");
    return products;
  } catch (err) {
    containerEl.innerHTML = `<div class="empty-state">خطا در بارگذاری محصولات.</div>`;
    console.error(err);
    return [];
  }
}
