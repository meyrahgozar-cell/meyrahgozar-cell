// ============================================
// Utility Functions
// ============================================

export function formatNumber(num) {
  if (num == null) return '۰';
  return new Intl.NumberFormat('fa-IR').format(Math.round(num));
}

export function formatPrice(amount) {
  return `${formatNumber(amount)} ${window.APP_CONFIG.CURRENCY}`;
}

export function kgToGrams(kg) {
  return Math.round(kg * 1000);
}

export function gramsToKg(g) {
  return g / 1000;
}

export function formatWeight(kg) {
  const grams = kgToGrams(kg);
  if (kg >= 1) {
    return `${formatNumber(kg)} کیلوگرم (${formatNumber(grams)} گرم)`;
  }
  return `${formatNumber(grams)} گرم`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(d);
}

export function statusLabel(status) {
  const map = {
    pending_payment: 'در انتظار پرداخت',
    payment_submitted: 'فیش ارسال شده',
    approved: 'تأیید شده',
    rejected: 'رد شده',
    shipping: 'در حال ارسال',
    delivered: 'تحویل شده',
    cancelled: 'لغو شده',
    pending: 'در انتظار',
    paid: 'پرداخت شده',
    overdue: 'معوقه'
  };
  return map[status] || status;
}

export function statusClass(status) {
  if (['approved', 'paid', 'delivered'].includes(status)) return 'status-approved';
  if (['rejected', 'overdue', 'cancelled'].includes(status)) return 'status-rejected';
  if (['shipping'].includes(status)) return 'status-shipping';
  return 'status-pending';
}

export function showToast(message, type = 'info') {
  // Simple toast without external lib for modularity
  const existing = document.querySelector('.toast-container');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.className = 'toast-container';
  container.style.cssText = `
    position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
    z-index: 9999; max-width: 90%; width: 360px;
  `;

  const toast = document.createElement('div');
  toast.className = `glass alert alert-${type === 'error' ? 'warning' : type}`;
  toast.style.cssText = 'text-align: center; animation: slideUp 0.3s ease;';
  toast.textContent = message;

  container.appendChild(toast);
  document.body.appendChild(container);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => container.remove(), 300);
  }, 3500);
}

// Calculate installment amounts based on admin formula
export function calculateInstallments(subtotal, numInstallments, settings) {
  const base = parseFloat(settings.base_fee_percent) || 5;
  const per = parseFloat(settings.per_installment_fee_percent) || 1.5;
  const feePercent = base + (Math.max(0, numInstallments - 1) * per);
  const feeAmount = Math.round(subtotal * (feePercent / 100));
  const total = subtotal + feeAmount;
  const installmentAmount = Math.ceil(total / numInstallments); // round up for simplicity

  return {
    feePercent: Math.round(feePercent * 100) / 100,
    feeAmount,
    total,
    installmentAmount,
    // last installment may be adjusted slightly due to rounding
    schedule: Array.from({ length: numInstallments }, (_, i) => ({
      number: i + 1,
      amount: i === numInstallments - 1
        ? total - (installmentAmount * (numInstallments - 1))
        : installmentAmount
    }))
  };
}

export function generateDueDates(num, startDate = new Date()) {
  const dates = [];
  for (let i = 0; i < num; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
