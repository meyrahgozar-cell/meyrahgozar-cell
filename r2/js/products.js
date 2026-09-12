// ============================================
// Products Module
// ============================================

import { supabase } from './supabase-client.js';
import { formatPrice, formatWeight, formatNumber } from './utils.js';

export async function fetchActiveProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }
  return data || [];
}

export async function fetchAllProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

export function renderProductCard(product, onBuyClick) {
  const card = document.createElement('div');
  card.className = 'product-card glass';
  card.innerHTML = `
    <span class="badge">موجود</span>
    <h3>${product.name}</h3>
    <div class="price">${formatPrice(product.price_per_kg)} <small>/ کیلوگرم</small></div>
    <p class="desc">${product.description || ''}</p>
    <div class="stock">موجودی: ${formatWeight(product.stock_kg)}</div>
    <button class="btn btn-primary buy-btn" data-id="${product.id}">
      خرید اقساطی
    </button>
  `;

  card.querySelector('.buy-btn').addEventListener('click', () => {
    onBuyClick(product);
  });

  return card;
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

export async function createProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select()
    .single();

  return { data, error };
}

export async function toggleProductActive(id, isActive) {
  return updateProduct(id, { is_active: isActive });
}
