BEGIN;

-- Separate login accounts from existing customer records.
CREATE TABLE IF NOT EXISTS app_users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer'
        CHECK (role IN ('customer', 'manager')),
    customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT app_users_email_unique UNIQUE (email)
);

-- Store individual product lines for every order.
CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL
        REFERENCES orders(id) ON DELETE CASCADE,
    product_id BIGINT
        REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(255),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add checkout details without replacing existing order columns.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS shipping_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS shipping_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS shipping_address TEXT,
    ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(150),
    ADD COLUMN IF NOT EXISTS shipping_state VARCHAR(150),
    ADD COLUMN IF NOT EXISTS shipping_postal_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS shipping_country VARCHAR(100),
    ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_app_users_customer_id
    ON app_users(customer_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
    ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
    ON order_items(product_id);

COMMIT;