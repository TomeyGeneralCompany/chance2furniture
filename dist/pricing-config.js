// Retail price = (supplier product price + supplier shipping cost) × multiplier.
// Amounts are USD per product unit. Null means unknown, never free shipping.
window.CHANCE2_PRICING = {
  multiplier: 2.5,
  defaultSupplierShipping: null,
  supplierShippingBySku: {
    // "EXAMPLE-SKU": 25.00
  }
};
