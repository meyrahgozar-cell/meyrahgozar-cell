// ============================================
// Orders & Installments Module
// ============================================

import { supabase } from './supabase-client.js';
import { calculateInstallments, generateDueDates, formatPrice, showToast } from './utils.js';

export async function getInstallmentSettings() {
  const { data, error } = await supabase
    .from('installment_settings')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) {
    // Fallback defaults
    return {
      base_fee_percent: 5,
      per_installment_fee_percent: 1.5,
      min_installments: 1,
      max_installments: 12
    };
  }
  return data;
}

export async function createOrder({
  userId,
  product,
  quantityKg,
  numInstallments,
  shippingAddress,
  notes = ''
}) {
  const settings = await getInstallmentSettings();
  const subtotal = Math.round(quantityKg * product.price_per_kg);
  const calc = calculateInstallments(subtotal, numInstallments, settings);

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      product_id: product.id,
      quantity_kg: quantityKg,
      unit_price: product.price_per_kg,
      subtotal,
      fee_amount: calc.feeAmount,
      total_amount: calc.total,
      num_installments: numInstallments,
      installment_amount: calc.installmentAmount,
      status: 'pending_payment',
      shipping_address: shippingAddress,
      notes
    })
    .select()
    .single();

  if (orderError) {
    console.error(orderError);
    return { error: orderError };
  }

  // Create installment schedule
  const dueDates = generateDueDates(numInstallments);
  const installmentsData = calc.schedule.map((s, i) => ({
    order_id: order.id,
    installment_number: s.number,
    amount: s.amount,
    due_date: dueDates[i],
    status: 'pending'
  }));

  const { error: instError } = await supabase
    .from('installments')
    .insert(installmentsData);

  if (instError) {
    console.error('Installments error:', instError);
    // Order still created, can be fixed later
  }

  // Optionally reduce stock (optimistic)
  await supabase
    .from('products')
    .update({ stock_kg: product.stock_kg - quantityKg })
    .eq('id', product.id);

  return { data: order, calc, error: null };
}

export async function fetchUserOrders(userId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      product:products(name),
      installments(*),
      payments(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return { data: data || [], error };
}

export async function fetchAllOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      product:products(name),
      user:profiles(full_name, phone),
      installments(*),
      payments(*)
    `)
    .order('created_at', { ascending: false });

  return { data: data || [], error };
}

export async function submitPayment({ orderId, installmentId = null, amount, receiptNote, transferDate }) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      order_id: orderId,
      installment_id: installmentId,
      amount,
      receipt_url: receiptNote, // text description for now
      transfer_date: transferDate || new Date().toISOString().slice(0, 10),
      status: 'pending'
    })
    .select()
    .single();

  if (!error) {
    // Update order status
    await supabase
      .from('orders')
      .update({ status: 'payment_submitted', updated_at: new Date().toISOString() })
      .eq('id', orderId);
  }

  return { data, error };
}

export async function reviewPayment(paymentId, status, adminId, adminNote = '') {
  const { data: payment, error } = await supabase
    .from('payments')
    .update({
      status,
      admin_note: adminNote,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', paymentId)
    .select('*, order:orders(*)')
    .single();

  if (error) return { error };

  if (status === 'approved') {
    // Mark related installment as paid if exists
    if (payment.installment_id) {
      await supabase
        .from('installments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', payment.installment_id);
    }

    // Check if all installments paid → mark order approved/delivered later
    const { data: insts } = await supabase
      .from('installments')
      .select('status')
      .eq('order_id', payment.order_id);

    const allPaid = insts?.every(i => i.status === 'paid');
    if (allPaid) {
      await supabase
        .from('orders')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', payment.order_id);
    } else {
      await supabase
        .from('orders')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', payment.order_id);
    }
  } else if (status === 'rejected') {
    await supabase
      .from('orders')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', payment.order_id);
  }

  return { data: payment, error: null };
}

export async function updateOrderStatus(orderId, status) {
  return supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);
}
