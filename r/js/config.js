// =========================================================
// مقصد ارسال رسید در تلگرام
// شماره‌ی تلگرام فروشنده رو اینجا با فرمت بین‌المللی (با + و کد کشور، بدون فاصله) بگذارید
// مثال ایران: "+989123456789"
// =========================================================
export const TELEGRAM_RECEIPT_CONTACT = "+989308779454";

/**
 * لینک بازکردن چت تلگرام با پیام از پیش پرشده
 * توجه مهم: به دلیل محدودیت مرورگرها، امکان ضمیمه‌ی خودکار فایل عکس به
 * پیام تلگرام از طریق لینک وجود ندارد — کاربر باید خودش عکسی که انتخاب
 * کرده رو داخل تلگرام ضمیمه و ارسال کنه. این لینک فقط چت رو با متن آماده باز می‌کنه.
 */
export function telegramReceiptLink({ orderLabel, installmentNumber, amount }) {
  const message = [
    "رسید پرداخت قسط",
    orderLabel ? `سفارش: ${orderLabel}` : null,
    installmentNumber ? `قسط شماره: ${installmentNumber}` : null,
    amount ? `مبلغ: ${amount}` : null,
    "(لطفاً تصویر رسید رو همین‌جا ضمیمه کنید)",
  ]
    .filter(Boolean)
    .join("\n");

  return `https://t.me/${TELEGRAM_RECEIPT_CONTACT}?text=${encodeURIComponent(message)}`;
}
