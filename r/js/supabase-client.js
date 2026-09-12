// =========================================================
// اتصال به Supabase — این تنها فایلی است که باید کلیدهای پروژه
// خودتان را در آن قرار دهید (از Supabase Dashboard > Project Settings > API)
// =========================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// نام باکت‌های Storage (باید در schema.sql هم همین نام‌ها را ساخته باشید)
export const RECEIPTS_BUCKET = "receipts";
export const PRODUCT_IMAGES_BUCKET = "product-images";
