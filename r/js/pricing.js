// =========================================================
// فرمول محاسبه‌ی کارمزد اقساط
// فرمول توسط ادمین (از طریق جدول settings) قابل تنظیم است:
//   fee_percent = fee_base_percent + (installment_count - 1) * fee_per_installment_percent
//   total_price = base_price * (1 + fee_percent / 100)
//   هر قسط = total_price / installment_count (قسط آخر گرد کردن باقی‌مانده را جذب می‌کند)
// =========================================================

export async function loadFeeSettings(supabase) {
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [
      "fee_base_percent",
      "fee_per_installment_percent",
      "min_installments",
      "max_installments",
    ]);

  if (error) throw error;

  const map = Object.fromEntries(data.map((row) => [row.key, Number(row.value)]));
  return {
    feeBasePercent: map.fee_base_percent ?? 5,
    feePerInstallmentPercent: map.fee_per_installment_percent ?? 1.5,
    minInstallments: map.min_installments ?? 2,
    maxInstallments: map.max_installments ?? 12,
  };
}

export function calcFeePercent(installmentCount, settings) {
  if (installmentCount <= 1) return 0; // پرداخت یک‌جا بدون کارمزد
  return (
    settings.feeBasePercent +
    Math.max(0, installmentCount - 1) * settings.feePerInstallmentPercent
  );
}

/**
 * محاسبه‌ی کامل قیمت یک سفارش بر اساس وزن، قیمت هر کیلو و تعداد اقساط
 * @returns {{ basePrice:number, feePercent:number, totalPrice:number, installmentAmount:number, amounts:number[] }}
 */
export function calcOrderPricing({ weightGrams, pricePerKg, installmentCount, settings }) {
  const basePrice = (weightGrams / 1000) * pricePerKg;
  const feePercent = calcFeePercent(installmentCount, settings);
  const totalPrice = Math.round(basePrice * (1 + feePercent / 100));

  const baseInstallment = Math.floor(totalPrice / installmentCount);
  const amounts = new Array(installmentCount).fill(baseInstallment);
  const remainder = totalPrice - baseInstallment * installmentCount;
  amounts[amounts.length - 1] += remainder; // قسط آخر باقی‌مانده‌ی رند شدن را جذب می‌کند

  return {
    basePrice,
    feePercent,
    totalPrice,
    installmentAmount: baseInstallment,
    amounts,
  };
}
