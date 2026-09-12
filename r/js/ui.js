// =========================================================
// کمک‌توابع مشترک UI — پیام‌ها، فرمت اعداد، وزن و قیمت
// از SweetAlert2 (از CDN در HTML لود شده) استفاده می‌کند
// =========================================================
import { toPersianDigits } from "./jalali.js";

const numberFormatter = new Intl.NumberFormat("fa-IR");

export function formatToman(amount) {
  return `${toPersianDigits(numberFormatter.format(Math.round(amount)))} تومان`;
}

export function formatGramsAsKg(grams) {
  const kg = grams / 1000;
  const text = kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${toPersianDigits(text)} کیلوگرم`;
}

export function toast(message, icon = "success") {
  if (window.Swal) {
    window.Swal.fire({
      toast: true,
      position: "top",
      timer: 2600,
      showConfirmButton: false,
      icon,
      title: message,
      background: "#16342a",
      color: "#f7f3e8",
    });
  } else {
    alert(message);
  }
}

export async function confirmAction(title, text = "", confirmText = "تایید") {
  if (window.Swal) {
    const result = await window.Swal.fire({
      title,
      text,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: "انصراف",
      background: "#16342a",
      color: "#f7f3e8",
      confirmButtonColor: "#c99a3e",
      cancelButtonColor: "rgba(247,243,232,0.2)",
    });
    return result.isConfirmed;
  }
  return confirm(`${title}\n${text}`);
}

export function showError(message) {
  toast(message, "error");
}

const STATUS_LABELS = {
  pending: "در انتظار پرداخت",
  submitted: "در انتظار بررسی",
  approved: "تایید شده",
  rejected: "رد شده",
  overdue: "معوق",
  active: "در حال پرداخت",
  completed: "تسویه شده",
  cancelled: "لغو شده",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function statusBadge(status) {
  return `<span class="badge badge-${status}">${statusLabel(status)}</span>`;
}

export function el(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function syncSliderFill(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const pct = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
  input.style.setProperty("--_p", `${pct}%`);
}

export function requireSession(session, redirectTo = "auth.html") {
  if (!session) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}
