import test from 'node:test'
import assert from 'node:assert/strict'
import { addCartItem, setCartQuantity, removeCartItem, cartTotals } from '../src/pages/PosCart.js'

const item = { id: 'part-1', retail_price: '7850.00', stock_quantity: 3 }

test('cart blocks zero-stock items and enforces live stock limits', () => {
  assert.deepEqual(addCartItem([], { ...item, stock_quantity: 0 }), [])
  let cart = addCartItem([], item)
  cart = setCartQuantity(cart, item.id, 99)
  assert.equal(cart[0].quantity, 3)
  cart = setCartQuantity(cart, item.id, 0)
  assert.equal(cart[0].quantity, 1)
})

test('cart quantity, remove, and totals remain consistent', () => {
  let cart = addCartItem([], item)
  cart = addCartItem(cart, item)
  assert.equal(cart[0].quantity, 2)
  assert.deepEqual(cartTotals(cart, '50'), { subtotal: 15700, discount: 50, total: 15650 })
  assert.deepEqual(removeCartItem(cart, item.id), [])
})
