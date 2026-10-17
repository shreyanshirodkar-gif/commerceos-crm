
-- Customers synced from WooCommerce
CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,
    woo_customer_id BIGINT UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    city VARCHAR(100),
    country VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products synced from WooCommerce
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    woo_product_id BIGINT UNIQUE,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    price NUMERIC(12, 2) DEFAULT 0,
    stock_quantity INTEGER,
    stock_status VARCHAR(50),
    product_status VARCHAR(50),
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders synced from WooCommerce
CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    woo_order_id BIGINT UNIQUE,
    customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    order_number VARCHAR(100),
    status VARCHAR(50),
    currency VARCHAR(10),
    total NUMERIC(12, 2) DEFAULT 0,
    payment_method VARCHAR(100),
    customer_email VARCHAR(255),
    order_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Record synchronization attempts
CREATE TABLE IF NOT EXISTS sync_logs (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL,
    records_processed INTEGER DEFAULT 0,
    message TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- Useful indexes for faster searches
CREATE INDEX IF NOT EXISTS idx_customers_email
    ON customers(email);

CREATE INDEX IF NOT EXISTS idx_products_name
    ON products(name);

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_date
    ON orders(order_date);
