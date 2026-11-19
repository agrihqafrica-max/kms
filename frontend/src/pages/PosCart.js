export function addCartItem(cart, item) {
  const existing = cart.find(row => row.id === item.id)
  if (existing) {
    return cart.map(row => row.id === item.id ? { ...row, quantity: Math.min(row.quantity + 1, item.stock_quantity) } : row)
  }
  return item.stock_quantity > 0 ? [...cart, { ...item, quantity: 1 }] : cart
}

export function setCartQuantity(cart, id, quantity) {
  return cart.map(row => row.id === id ? { ...row, quantity: Math.max(1, Math.min(quantity, row.stock_quantity)) } : row)
}

export function removeCartItem(cart, id) {
  return cart.filter(row => row.id !== id)
}

export function cartTotals(cart, discountAmount = '0') {
  const discount = Number(discountAmount || 0)
  const subtotal = cart.reduce((sum, row) => sum + Number(row.retail_price) * row.quantity, 0)
  return { subtotal, discount: Math.max(0, discount), total: Math.max(0, subtotal - Math.max(0, discount)) }
}
