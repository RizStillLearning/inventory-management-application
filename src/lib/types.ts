export type MovementType = 'receive' | 'ship' | 'adjust';
export type StockStatus = 'in' | 'low' | 'out';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category_id: string | null;
  supplier_id: string | null;
  unit: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
  reorder_level: number;
  created_at: string;
  updated_at: string;
}

/** Product fields a client may write. `quantity` only changes through stock movements. */
export type ProductInput = Pick<
  Product,
  'sku' | 'name' | 'description' | 'category_id' | 'supplier_id' | 'unit' | 'cost_price' | 'sale_price' | 'reorder_level'
>;

export type CategoryInput = Pick<Category, 'name' | 'description'>;
export type SupplierInput = Pick<Supplier, 'name' | 'contact_name' | 'email' | 'phone'>;

export interface StockMovement {
  id: string;
  product_id: string;
  movement_type: MovementType;
  quantity_change: number;
  quantity_after: number | null;
  note: string | null;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  product?: Pick<Product, 'id' | 'name' | 'sku' | 'unit'> | null;
}

export interface MovementInput {
  product_id: string;
  movement_type: MovementType;
  quantity_change: number;
  note: string | null;
}
