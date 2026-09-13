// =========================================================
// نظرات محصولات — نمایش، ثبت، ویرایش، و حذف
// نام کسانی که این محصول رو خریده‌اند با رنگ طلایی و glow مشخص میشه
// =========================================================
import { supabase } from "./supabase-client.js";
import { getSession, getProfile } from "./auth.js";
import { formatGramsAsKg, toast, showError, confirmAction } from "./ui.js";
import { formatJalali } from "./jalali.js";

export async function fetchProductComments(productId) {
  const { data, error } = await supabase.rpc("product_comments_with_purchases", {
    p_product_id: productId,
  });
  if (error) throw error;
  return data;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function commentRowHTML(comment, currentUserId) {
  const isBuyer = Number(comment.total_grams) > 0;
  const isOwner = comment.user_id === currentUserId;
  const wasEdited = new Date(comment.updated_at) > new Date(comment.created_at);

  return `
    <div class="comment-row" data-comment-id="${comment.id}">
      <div class="row justify-between wrap gap-sm">
        <span class="commenter-name${isBuyer ? " is-buyer" : ""}">${escapeHtml(comment.full_name)}</span>
        ${isBuyer ? `<span class="buy-badge">خرید: ${formatGramsAsKg(comment.total_grams)}</span>` : ""}
      </div>
      <p class="comment-body" style="margin:0.4rem 0;">${escapeHtml(comment.body)}</p>
      <div class="row justify-between wrap gap-sm">
        <span class="text-muted" style="font-size:0.8rem;">
          ${formatJalali(comment.created_at)}${wasEdited ? " · ویرایش شده" : ""}
        </span>
        ${
          isOwner
            ? `<div class="row gap-sm">
                 <button class="btn btn-ghost btn-xs edit-comment-btn" data-id="${comment.id}">ویرایش</button>
                 <button class="btn btn-ghost btn-xs delete-comment-btn" data-id="${comment.id}">حذف</button>
               </div>`
            : ""
        }
      </div>
    </div>
  `;
}

export async function renderProductComments(container, productId) {
  container.innerHTML = `<div class="skeleton" style="height:70px;"></div>`;

  const session = await getSession();
  const profile = session ? await getProfile() : null;
  const inputId = `comment-input-${productId}`;

  async function refresh() {
    try {
      const comments = await fetchProductComments(productId);
      const listHTML = comments.length
        ? comments.map((c) => commentRowHTML(c, profile?.id)).join("")
        : `<p class="text-muted">هنوز نظری ثبت نشده. اولین نفر باش!</p>`;

      const formHTML = profile
        ? `
          <div class="field" style="margin-top:1rem;">
            <label>نظرت رو بنویس</label>
            <textarea class="input" id="${inputId}" rows="2" placeholder="مثلاً: کیفیت و طعمش چطور بود؟"></textarea>
          </div>
          <button class="btn btn-primary btn-sm" id="comment-submit">ثبت نظر</button>
        `
        : `<p class="text-muted" style="margin-top:1rem;">برای ثبت نظر باید <a href="auth.html" class="text-link">وارد حساب</a> بشی.</p>`;

      container.innerHTML = `
        <div class="comment-list stack gap-sm">${listHTML}</div>
        ${formHTML}
      `;

      container.querySelector("#comment-submit")?.addEventListener("click", async () => {
        const textarea = container.querySelector(`#${inputId}`);
        const body = textarea.value.trim();
        if (!body) return showError("نظر نمی‌تواند خالی باشد.");
        const { error } = await supabase
          .from("product_comments")
          .insert({ product_id: productId, user_id: profile.id, body });
        if (error) return showError(error.message);
        toast("نظر شما ثبت شد.");
        refresh();
      });

      container.querySelectorAll(".delete-comment-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const ok = await confirmAction("این نظر حذف شود؟");
          if (!ok) return;
          const { error } = await supabase.from("product_comments").delete().eq("id", btn.dataset.id);
          if (error) return showError(error.message);
          toast("نظر حذف شد.");
          refresh();
        });
      });

      container.querySelectorAll(".edit-comment-btn").forEach((btn) => {
        btn.addEventListener("click", () => startEditing(btn.dataset.id));
      });
    } catch (err) {
      console.error(err);
      container.innerHTML = `<p class="text-muted">خطا در بارگذاری نظرات. اگر تازه این قابلیت رو اضافه کردی، مطمئن شو migration مربوط به نظرات رو در Supabase اجرا کردی.</p>`;
    }
  }

  function startEditing(commentId) {
    const row = container.querySelector(`.comment-row[data-comment-id="${commentId}"]`);
    const bodyEl = row.querySelector(".comment-body");
    const currentText = bodyEl.textContent;

    bodyEl.outerHTML = `
      <div class="field comment-body" style="margin:0.4rem 0;">
        <textarea class="input" id="edit-${commentId}" rows="2">${escapeHtml(currentText)}</textarea>
        <div class="row gap-sm mt-lg">
          <button class="btn btn-primary btn-sm save-edit-btn" data-id="${commentId}">ذخیره</button>
          <button class="btn btn-ghost btn-sm cancel-edit-btn">انصراف</button>
        </div>
      </div>
    `;

    row.querySelector(".save-edit-btn").addEventListener("click", async () => {
      const newBody = row.querySelector(`#edit-${commentId}`).value.trim();
      if (!newBody) return showError("نظر نمی‌تواند خالی باشد.");
      const { error } = await supabase
        .from("product_comments")
        .update({ body: newBody })
        .eq("id", commentId);
      if (error) return showError(error.message);
      toast("نظر ویرایش شد.");
      refresh();
    });
    row.querySelector(".cancel-edit-btn").addEventListener("click", () => refresh());
  }

  await refresh();
}
