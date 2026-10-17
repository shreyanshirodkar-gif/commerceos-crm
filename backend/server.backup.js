
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "commerceos_crm",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
);
app.use(express.json({ limit: "1mb" }));

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function sendError(res, error, message) {
  console.error(message, error.message);

  if (error.code === "23505") {
    return res.status(409).json({
      success: false,
      message: "A record with this unique value already exists.",
    });
  }

  if (error.code === "23503") {
    return res.status(400).json({
      success: false,
      message: "This record is linked to another record and cannot be changed this way.",
    });
  }

  return res.status(500).json({
    success: false,
    message,
  });
}

function validId(id) {
  return /^\d+$/.test(String(id)) && Number(id) > 0;
}

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

// --------------------------------------------------
// BASIC STATUS AND DATABASE HEALTH
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    name: "CommerceOS CRM API",
    status: "running",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      database: "connected",
    });
  } catch (error) {
    sendError(res, error, "Database unavailable");
  }
});

// --------------------------------------------------
// DASHBOARD SUMMARY
// --------------------------------------------------

app.get("/api/dashboard", async (req, res) => {
  try {
    const [orders, customers, products] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE status = 'processing'
          )::int AS processing,
          COUNT(*) FILTER (
            WHERE status = 'completed'
          )::int AS completed,
          COALESCE(
            SUM(total) FILTER (
              WHERE status NOT IN ('cancelled', 'failed', 'refunded')
            ),
            0
          )::numeric AS revenue
        FROM orders
      `),
      pool.query(
        "SELECT COUNT(*)::int AS total FROM customers"
      ),
      pool.query(
        "SELECT COUNT(*)::int AS total FROM products"
      ),
    ]);

    res.json({
      success: true,
      orders: orders.rows[0],
      customers: customers.rows[0].total,
      products: products.rows[0].total,
    });
  } catch (error) {
    sendError(res, error, "Could not load dashboard");
  }
});

// --------------------------------------------------
// CUSTOMERS: LIST
// --------------------------------------------------

app.get("/api/customers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, woo_customer_id, first_name, last_name,
        email, phone, city, country, created_at
      FROM customers
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    sendError(res, error, "Could not load customers");
  }
});

// CUSTOMERS: CREATE
app.post("/api/customers", async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    city,
    country,
  } = req.body;

  if (
    typeof first_name !== "string" ||
    !first_name.trim() ||
    typeof last_name !== "string" ||
    !last_name.trim() ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a first name, last name, and valid email address.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO customers
        (first_name, last_name, email, phone, city, country)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, woo_customer_id, first_name, last_name,
                 email, phone, city, country, created_at`,
      [
        first_name.trim(),
        last_name.trim(),
        email.trim().toLowerCase(),
        phone || null,
        city || null,
        country || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Customer created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    sendError(res, error, "Could not create customer");
  }
});

// CUSTOMERS: UPDATE
app.put("/api/customers/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid customer ID.",
    });
  }

  const {
    first_name,
    last_name,
    email,
    phone,
    city,
    country,
  } = req.body;

  if (
    typeof first_name !== "string" ||
    !first_name.trim() ||
    typeof last_name !== "string" ||
    !last_name.trim() ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a first name, last name, and valid email address.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE customers
       SET first_name = $1,
           last_name = $2,
           email = $3,
           phone = $4,
           city = $5,
           country = $6
       WHERE id = $7
       RETURNING id, woo_customer_id, first_name, last_name,
                 email, phone, city, country, created_at`,
      [
        first_name.trim(),
        last_name.trim(),
        email.trim().toLowerCase(),
        phone || null,
        city || null,
        country || null,
        Number(req.params.id),
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    res.json({
      success: true,
      message: "Customer updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    sendError(res, error, "Could not update customer");
  }
});

// CUSTOMERS: DELETE
app.delete("/api/customers/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid customer ID.",
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM customers
       WHERE id = $1 AND woo_customer_id IS NULL
       RETURNING id`,
      [Number(req.params.id)]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or is linked to WooCommerce.",
      });
    }

    res.json({
      success: true,
      message: "Customer deleted successfully.",
    });
  } catch (error) {
    sendError(res, error, "Could not delete customer");
  }
});

// --------------------------------------------------
// PRODUCTS: LIST
// --------------------------------------------------

app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, woo_product_id, name, sku, price,
        stock_quantity, stock_status, product_status, image_url
      FROM products
      ORDER BY name ASC
      LIMIT 100
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    sendError(res, error, "Could not load products");
  }
});

// PRODUCTS: CREATE
app.post("/api/products", async (req, res) => {
  const {
    name,
    sku,
    price,
    stock_quantity,
    stock_status,
    product_status,
    image_url,
  } = req.body;

  const parsedPrice = parseNumber(price);
  const parsedStock = parseNumber(stock_quantity);

  if (
    typeof name !== "string" ||
    !name.trim() ||
    parsedPrice === null ||
    !Number.isFinite(parsedPrice) ||
    parsedPrice < 0 ||
    parsedStock === null ||
    !Number.isInteger(parsedStock) ||
    parsedStock < 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a product name, non-negative price, and whole-number stock quantity.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products
        (name, sku, price, stock_quantity, stock_status,
         product_status, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, woo_product_id, name, sku, price,
                 stock_quantity, stock_status, product_status, image_url`,
      [
        name.trim(),
        sku || null,
        parsedPrice,
        parsedStock,
        stock_status || (parsedStock > 0 ? "instock" : "outofstock"),
        product_status || "publish",
        image_url || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Product created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    sendError(res, error, "Could not create product");
  }
});

// PRODUCTS: UPDATE
app.put("/api/products/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  const {
    name,
    sku,
    price,
    stock_quantity,
    stock_status,
    product_status,
    image_url,
  } = req.body;

  const parsedPrice = parseNumber(price);
  const parsedStock = parseNumber(stock_quantity);

  if (
    typeof name !== "string" ||
    !name.trim() ||
    parsedPrice === null ||
    !Number.isFinite(parsedPrice) ||
    parsedPrice < 0 ||
    parsedStock === null ||
    !Number.isInteger(parsedStock) ||
    parsedStock < 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a product name, non-negative price, and whole-number stock quantity.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE products
       SET name = $1,
           sku = $2,
           price = $3,
           stock_quantity = $4,
           stock_status = $5,
           product_status = $6,
           image_url = $7
       WHERE id = $8 AND woo_product_id IS NULL
       RETURNING id, woo_product_id, name, sku, price,
                 stock_quantity, stock_status, product_status, image_url`,
      [
        name.trim(),
        sku || null,
        parsedPrice,
        parsedStock,
        stock_status || (parsedStock > 0 ? "instock" : "outofstock"),
        product_status || "publish",
        image_url || null,
        Number(req.params.id),
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Product not found or is linked to WooCommerce.",
      });
    }

    res.json({
      success: true,
      message: "Product updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    sendError(res, error, "Could not update product");
  }
});

// PRODUCTS: DELETE
app.delete("/api/products/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM products
       WHERE id = $1 AND woo_product_id IS NULL
       RETURNING id`,
      [Number(req.params.id)]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Product not found or is linked to WooCommerce.",
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully.",
    });
  } catch (error) {
    sendError(res, error, "Could not delete product");
  }
});

// --------------------------------------------------
// ORDERS: LIST
// --------------------------------------------------

app.get("/api/orders", async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    const result = await pool.query(
      `SELECT
        id, woo_order_id, order_number, status, currency,
        total, payment_method, customer_email, order_date
       FROM orders
       ORDER BY order_date DESC NULLS LAST, id DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    sendError(res, error, "Could not load orders");
  }
});

// ORDERS: CREATE
app.post("/api/orders", async (req, res) => {
  const {
    order_number,
    status,
    currency,
    total,
    payment_method,
    customer_email,
    order_date,
  } = req.body;

  const parsedTotal = parseNumber(total);
  const allowedStatuses = [
    "pending",
    "processing",
    "on-hold",
    "completed",
    "cancelled",
    "refunded",
    "failed",
  ];

  if (
    typeof order_number !== "string" ||
    !order_number.trim() ||
    !allowedStatuses.includes(status || "pending") ||
    parsedTotal === null ||
    !Number.isFinite(parsedTotal) ||
    parsedTotal < 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter an order number, valid status, and non-negative total.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO orders
        (order_number, status, currency, total, payment_method,
         customer_email, order_date)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
       RETURNING id, woo_order_id, order_number, status, currency,
                 total, payment_method, customer_email, order_date`,
      [
        order_number.trim(),
        status || "pending",
        currency || "INR",
        parsedTotal,
        payment_method || null,
        customer_email || null,
        order_date || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Order created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    sendError(res, error, "Could not create order");
  }
});

// ORDERS: UPDATE
app.put("/api/orders/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
    });
  }

  const { status, total, payment_method, customer_email } = req.body;
  const parsedTotal = parseNumber(total);

  const allowedStatuses = [
    "pending",
    "processing",
    "on-hold",
    "completed",
    "cancelled",
    "refunded",
    "failed",
  ];

  if (
    !allowedStatuses.includes(status) ||
    parsedTotal === null ||
    !Number.isFinite(parsedTotal) ||
    parsedTotal < 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Select a valid order status and enter a non-negative total.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE orders
       SET status = $1,
           total = $2,
           payment_method = $3,
           customer_email = $4
       WHERE id = $5 AND woo_order_id IS NULL
       RETURNING id, woo_order_id, order_number, status, currency,
                 total, payment_method, customer_email, order_date`,
      [
        status,
        parsedTotal,
        payment_method || null,
        customer_email || null,
        Number(req.params.id),
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Order not found or is linked to WooCommerce.",
      });
    }

    res.json({
      success: true,
      message: "Order updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    sendError(res, error, "Could not update order");
  }
});

// ORDERS: DELETE
app.delete("/api/orders/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM orders
       WHERE id = $1 AND woo_order_id IS NULL
       RETURNING id`,
      [Number(req.params.id)]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Order not found or is linked to WooCommerce.",
      });
    }

    res.json({
      success: true,
      message: "Order deleted successfully.",
    });
  } catch (error) {
    sendError(res, error, "Could not delete order");
  }
});

// --------------------------------------------------
// UNKNOWN API ROUTES
// --------------------------------------------------

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// Catch malformed JSON
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request body.",
    });
  }

  next(error);
});

app.listen(PORT, () => {
  console.log(`CRM backend running at http://localhost:${PORT}`);
});
