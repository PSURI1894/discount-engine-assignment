/**
 * Shared test fixtures: the sample rules and cart from the assignment brief,
 * expressed as engine objects (no CSV parsing involved).
 */

export const RULE_01 = { ruleId: 'RULE-01', scope: 'platform', appliesTo: 'Amazon India', type: 'percentage', value: 15, stackable: false }
export const RULE_02 = { ruleId: 'RULE-02', scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 150, stackable: false }
export const RULE_03 = { ruleId: 'RULE-03', scope: 'platform', appliesTo: 'Flipkart', type: 'percentage', value: 10, stackable: true }

export const SAMPLE_ITEM_RULES = [RULE_01, RULE_02, RULE_03]

export const SAMPLE_CART = [
  { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
  { itemId: 'ITEM-02', product: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', basePrice: 849 },
  { itemId: 'ITEM-03', product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Amazon India', basePrice: 599 },
  { itemId: 'ITEM-04', product: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 2499 },
  { itemId: 'ITEM-05', product: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India', basePrice: 449 },
  { itemId: 'ITEM-06', product: 'Desk Organiser', brand: 'Nordic Basics', platform: 'Flipkart', basePrice: 899 },
]

export const item = (overrides) => ({
  itemId: 'ITEM-X', product: 'Test Product', brand: 'Test Brand', platform: 'Test Platform', basePrice: 1000,
  ...overrides,
})
