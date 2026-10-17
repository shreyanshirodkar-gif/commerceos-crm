require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5000);

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "commerceos_crm",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

// CORS: allow explicitly configured deployed origins and local Vite development ports.
// Set FRONTEND_URL / STOREFRONT_URL to the full origin (scheme + hostname + optional port).
const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.STOREFRONT_URL,
  ...(process.env.ALLOWED_ORIGINS || "").split(","),
].map((value) => value?.trim()).filter(Boolean);
const allowedOrigins = new Set([
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:5174", "http://127.0.0.1:5174",
  "http://localhost:5176", "http://127.0.0.1:5176",
  ...configuredOrigins,
]);
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, server-to-server, and health checks
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1"].includes(url.hostname) &&
      /^https?:$/.test(url.protocol) && /^\d+$/.test(url.port || "80");
  } catch {
    return false;
  }
}

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      console.warn(`Blocked by CORS: ${origin}`);
      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ limit: "100kb" }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  limit: 20,                // Allow 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many registration attempts. Please try again later.",
  },
});

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email) {
  return typeof email === "string" &&
    email.length <= 255 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requiredText(value, max = 255) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

function validPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 999999999;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) return sendError(res, 401, "Please log in.");

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return sendError(res, 500, "Authentication is not configured.");
  }

  try {
    req.user = jwt.verify(match[1], process.env.JWT_SECRET);
    next();
  } catch {
    return sendError(res, 401, "Your session is invalid or expired.");
  }
}

function requireManager(req, res, next) {
  if (req.user?.role !== "manager") {
    return sendError(res, 403, "Manager access required.");
  }
  next();
}

function requireCustomer(req, res, next) {
  if (req.user?.role !== "customer" || !req.user?.customerId) {
    return sendError(res, 403, "Customer account required.");
  }
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function makeToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      customerId: user.customer_id ? String(user.customer_id) : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

function validateProduct(body) {
  if (!requiredText(body.name, 255)) {
    return "Product name is required and must be under 256 characters.";
  }

  if (body.price === undefined || !validPrice(body.price)) {
    return "Enter a valid non-negative product price.";
  }

  if (
    body.stock_quantity !== undefined &&
    body.stock_quantity !== null &&
    (!Number.isInteger(Number(body.stock_quantity)) ||
      Number(body.stock_quantity) < 0)
  ) {
    return "Stock quantity must be a non-negative integer.";
  }

  if (
    body.product_status !== undefined &&
    !["publish", "draft"].includes(body.product_status)
  ) {
    return "Product status must be publish or draft.";
  }

  if (
    body.image_url !== undefined &&
    body.image_url !== null &&
    typeof body.image_url !== "string"
  ) {
    return "Image URL must be text.";
  }

  return null;
}

function getProductValues(body) {
  const stock = body.stock_quantity == null ? 0 : Number(body.stock_quantity);

  return [
    body.name.trim(),
    body.sku?.trim() || null,
    Number(body.price),
    stock,
    stock > 0 ? "instock" : "outofstock",
    body.product_status || "draft",
    body.image_url?.trim() || null,
  ];
}

// ----------------------------------------------------
// Health
// ----------------------------------------------------

app.get("/", (req, res) => {
  res.json({ name: "CommerceOS API", status: "running" });
});

app.get("/api/health", asyncRoute(async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ success: true, database: "connected" });
}));

// ----------------------------------------------------
// Authentication
// ----------------------------------------------------

app.post("/api/auth/login", loginLimiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;

  if (!validEmail(email) || typeof password !== "string") {
    return sendError(res, 400, "Enter a valid email and password.");
  }

  const result = await pool.query(
    `SELECT id, email, password_hash, role, is_active, customer_id
     FROM app_users WHERE email = $1 LIMIT 1`,
    [email]
  );

  const user = result.rows[0];

  if (
    !user ||
    !user.is_active ||
    !(await bcrypt.compare(password, user.password_hash))
  ) {
    return sendError(res, 401, "Invalid email or password.");
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return sendError(res, 500, "Authentication is not configured.");
  }

  res.json({
    success: true,
    token: makeToken(user),
    user: publicUser(user),
  });
}));

app.post("/api/auth/register", registerLimiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;
  const firstName = req.body.first_name;
  const lastName = req.body.last_name || "";
  const phone = req.body.phone || "";
  const city = req.body.city || "";
  const country = req.body.country || "India";

  if (!validEmail(email)) {
    return sendError(res, 400, "Enter a valid email address.");
  }

  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return sendError(res, 400, "Password must be between 12 and 128 characters.");
  }

  if (!requiredText(firstName, 255) || typeof lastName !== "string" || lastName.length > 255) {
    return sendError(res, 400, "Enter a valid first name and last name.");
  }

  if (
    typeof phone !== "string" ||
    typeof city !== "string" ||
    typeof country !== "string" ||
    phone.length > 50 ||
    city.length > 150 ||
    country.length > 100
  ) {
    return sendError(res, 400, "Please check your contact details.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id FROM app_users WHERE email = $1",
      [email]
    );

    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return sendError(res, 409, "An account with this email already exists.");
    }

    const customer = await client.query(
      `INSERT INTO customers
       (first_name, last_name, email, phone, city, country, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id`,
      [firstName.trim(), lastName.trim(), email, phone.trim(), city.trim(), country.trim()]
    );

    const passwordHash = await bcrypt.hash(password, 12);

    const account = await client.query(
      `INSERT INTO app_users (email, password_hash, role, customer_id, is_active)
       VALUES ($1, $2, 'customer', $3, TRUE)
       RETURNING id, email, role, customer_id`,
      [email, passwordHash, customer.rows[0].id]
    );

    await client.query("COMMIT");

    const user = account.rows[0];

    res.status(201).json({
      success: true,
      token: makeToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return sendError(res, 409, "An account with this email already exists.");
    }

    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/auth/me", requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT id, email, role, customer_id, is_active
     FROM app_users WHERE id = $1`,
    [req.user.sub]
  );

  const user = result.rows[0];

  if (!user || !user.is_active) {
    return sendError(res, 401, "Account is unavailable.");
  }

  res.json({
    success: true,
    user: { ...publicUser(user), customer_id: user.customer_id },
  });
}));

app.get("/api/auth/manager-check", requireAuth, requireManager, (req, res) => {
  res.json({ success: true, message: "Manager authentication verified." });
});

// ----------------------------------------------------
// Public storefront products
// ----------------------------------------------------

app.get("/api/store/products", asyncRoute(async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 100);

  const result = await pool.query(
    `SELECT id, name, sku, price, stock_quantity, stock_status, image_url
     FROM products
     WHERE LOWER(COALESCE(product_status, '')) = 'publish'
       AND ($1 = '' OR name ILIKE '%' || $1 || '%')
     ORDER BY name ASC
     LIMIT 100`,
    [search]
  );

  res.json({ success: true, count: result.rowCount, data: result.rows });
}));

app.get("/api/store/products/:id", asyncRoute(async (req, res) => {
  if (!positiveInteger(req.params.id)) {
    return sendError(res, 400, "Invalid product ID.");
  }

  const result = await pool.query(
    `SELECT id, name, sku, price, stock_quantity, stock_status, image_url
     FROM products
     WHERE id = $1 AND LOWER(COALESCE(product_status, '')) = 'publish'`,
    [req.params.id]
  );

  if (!result.rowCount) return sendError(res, 404, "Product not found.");

  res.json({ success: true, data: result.rows[0] });
}));

// ----------------------------------------------------
// Manager dashboard
// ----------------------------------------------------

app.get("/api/dashboard", requireAuth, requireManager, asyncRoute(async (req, res) => {
  const [orders, customers, products] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
             COALESCE(SUM(total), 0)::numeric AS revenue
      FROM orders
    `),
    pool.query("SELECT COUNT(*)::int AS total FROM customers"),
    pool.query("SELECT COUNT(*)::int AS total FROM products"),
  ]);

  res.json({
    success: true,
    orders: orders.rows[0],
    customers: customers.rows[0].total,
    products: products.rows[0].total,
  });
}));

// ----------------------------------------------------
// Manager products
// ----------------------------------------------------

app.get("/api/products", requireAuth, requireManager, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT id, woo_product_id, name, sku, price, stock_quantity,
            stock_status, product_status, image_url
     FROM products ORDER BY name ASC LIMIT 100`
  );

  res.json({ success: true, count: result.rowCount, data: result.rows });
}));

app.post("/api/products", requireAuth, requireManager, asyncRoute(async (req, res) => {
  const error = validateProduct(req.body);
  if (error) return sendError(res, 400, error);

  const stock = req.body.stock_quantity == null ? 0 : Number(req.body.stock_quantity);

  const result = await pool.query(
    `INSERT INTO products
     (name, sku, price, stock_quantity, stock_status, product_status, image_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id, name, sku, price, stock_quantity, stock_status, product_status, image_url`,
    getProductValues(req.body)
  );

  res.status(201).json({ success: true, data: result.rows[0] });
}));

app.put("/api/products/:id", requireAuth, requireManager, asyncRoute(async (req, res) => {
  if (!positiveInteger(req.params.id)) return sendError(res, 400, "Invalid product ID.");

  const error = validateProduct(req.body);
  if (error) return sendError(res, 400, error);

  const result = await pool.query(
    `UPDATE products
     SET name = $1, sku = $2, price = $3, stock_quantity = $4,
         stock_status = $5, product_status = $6, image_url = $7, updated_at = NOW()
     WHERE id = $8
     RETURNING id, name, sku, price, stock_quantity, stock_status, product_status, image_url`,
    [...getProductValues(req.body), req.params.id]
  );

  if (!result.rowCount) return sendError(res, 404, "Product not found.");

  res.json({ success: true, data: result.rows[0] });
}));

app.delete("/api/products/:id", requireAuth, requireManager, asyncRoute(async (req, res) => {
  if (!positiveInteger(req.params.id)) return sendError(res, 400, "Invalid product ID.");

  const result = await pool.query(
    "DELETE FROM products WHERE id = $1 RETURNING id",
    [req.params.id]
  );

  if (!result.rowCount) return sendError(res, 404, "Product not found.");

  res.json({ success: true, message: "Product deleted." });
}));

// ----------------------------------------------------
// Manager customers
// ----------------------------------------------------

app.get("/api/customers", requireAuth, requireManager, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT id, woo_customer_id, first_name, last_name, email, phone, city, country, created_at
     FROM customers ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 100`
  );

  res.json({ success: true, count: result.rowCount, data: result.rows });
}));

app.post("/api/customers", requireAuth, requireManager, asyncRoute(async (req, res) => {
  const body = req.body;

  if (!requiredText(body.first_name, 255)) {
    return sendError(res, 400, "First name is required.");
  }

  const email = body.email ? normalizeEmail(body.email) : null;
  if (email && !validEmail(email)) return sendError(res, 400, "Enter a valid email address.");

  const result = await pool.query(
    `INSERT INTO customers
     (first_name, last_name, email, phone, city, country, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING id, first_name, last_name, email, phone, city, country`,
    [
      body.first_name.trim(),
      String(body.last_name || "").trim(),
      email,
      String(body.phone || "").trim(),
      String(body.city || "").trim(),
      String(body.country || "India").trim(),
    ]
  );

  res.status(201).json({ success: true, data: result.rows[0] });
}));

app.put("/api/customers/:id", requireAuth, requireManager, asyncRoute(async (req, res) => {
  if (!positiveInteger(req.params.id)) return sendError(res, 400, "Invalid customer ID.");

  const body = req.body;
  if (!requiredText(body.first_name, 255)) return sendError(res, 400, "First name is required.");

  const email = body.email ? normalizeEmail(body.email) : null;
  if (email && !validEmail(email)) return sendError(res, 400, "Enter a valid email address.");

  const result = await pool.query(
    `UPDATE customers
     SET first_name = $1, last_name = $2, email = $3, phone = $4,
         city = $5, country = $6, updated_at = NOW()
     WHERE id = $7
     RETURNING id, first_name, last_name, email, phone, city, country`,
    [
      body.first_name.trim(),
      String(body.last_name || "").trim(),
      email,
      String(body.phone || "").trim(),
      String(body.city || "").trim(),
      String(body.country || "India").trim(),
      req.params.id,
    ]
  );

  if (!result.rowCount) return sendError(res, 404, "Customer not found.");

  res.json({ success: true, data: result.rows[0] });
}));

app.delete("/api/customers/:id", requireAuth, requireManager, asyncRoute(async (req, res) => {
  if (!positiveInteger(req.params.id)) return sendError(res, 400, "Invalid customer ID.");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const linkedOrders = await client.query(
      "SELECT 1 FROM orders WHERE customer_id = $1 LIMIT 1",
      [req.params.id]
    );

    if (linkedOrders.rowCount) {
      await client.query("ROLLBACK");
      return sendError(res, 409, "This customer has orders and cannot be deleted.");
    }

    await client.query("DELETE FROM app_users WHERE customer_id = $1", [req.params.id]);

    const result = await client.query(
      "DELETE FROM customers WHERE id = $1 RETURNING id",
      [req.params.id]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Customer not found.");
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Customer deleted." });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

// ----------------------------------------------------
// Customer profile and order history
// ----------------------------------------------------

app.get("/api/customer/profile", requireAuth, requireCustomer, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT id, first_name, last_name, email, phone, city, country
     FROM customers WHERE id = $1`,
    [req.user.customerId]
  );

  if (!result.rowCount) return sendError(res, 404, "Customer profile not found.");

  res.json({ success: true, data: result.rows[0] });
}));

app.get("/api/customer/orders", requireAuth, requireCustomer, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT id, order_number, status, currency, total, payment_method, order_date
     FROM orders WHERE customer_id = $1
     ORDER BY order_date DESC NULLS LAST, id DESC LIMIT 100`,
    [req.user.customerId]
  );

  res.json({ success: true, data: result.rows });
}));

// ----------------------------------------------------
// Customer COD checkout
// ----------------------------------------------------

app.post("/api/orders", requireAuth, requireCustomer, asyncRoute(async (req, res) => {
  const {
    items,
    shipping_name,
    shipping_phone,
    shipping_address,
    shipping_city,
    shipping_state,
    shipping_postal_code,
    shipping_country,
    notes,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return sendError(res, 400, "Your cart is empty or invalid.");
  }

  if (
    !requiredText(shipping_name, 255) ||
    !requiredText(shipping_phone, 50) ||
    !requiredText(shipping_address, 2000) ||
    !requiredText(shipping_city, 150) ||
    !requiredText(shipping_state, 150) ||
    !requiredText(shipping_postal_code, 20) ||
    !requiredText(shipping_country, 100)
  ) {
    return sendError(res, 400, "Complete all required delivery fields.");
  }

  const quantities = new Map();

  for (const item of items) {
    const id = Number(item.product_id ?? item.id);
    const quantity = Number(item.quantity);

    if (!positiveInteger(id) || !positiveInteger(quantity) || quantity > 100) {
      return sendError(res, 400, "One or more cart items are invalid.");
    }

    quantities.set(id, (quantities.get(id) || 0) + quantity);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const customerResult = await client.query(
      "SELECT id, email FROM customers WHERE id = $1 FOR UPDATE",
      [req.user.customerId]
    );

    if (!customerResult.rowCount) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Customer profile not found.");
    }

    const customer = customerResult.rows[0];
    const orderItems = [];
    let total = 0;

    const sortedIds = [...quantities.keys()].sort((a, b) => a - b);

    for (const productId of sortedIds) {
      const quantity = quantities.get(productId);

      const productResult = await client.query(
        `SELECT id, name, sku, price, stock_quantity, product_status
         FROM products WHERE id = $1 FOR UPDATE`,
        [productId]
      );

      const product = productResult.rows[0];

      if (!product || String(product.product_status || "").toLowerCase() !== "publish") {
        await client.query("ROLLBACK");
        return sendError(res, 400, "A product is unavailable.");
      }

      const stock = Number(product.stock_quantity ?? 0);
      const price = Number(product.price);

      if (!Number.isFinite(price) || price < 0) {
        await client.query("ROLLBACK");
        return sendError(res, 400, "A product has an invalid price.");
      }

      if (stock < quantity) {
        await client.query("ROLLBACK");
        return sendError(res, 409, `Not enough stock for ${product.name}. Available: ${stock}.`);
      }

      const lineTotal = Math.round(price * quantity * 100) / 100;
      total = Math.round((total + lineTotal) * 100) / 100;

      orderItems.push({ product, quantity, price, lineTotal });
    }

    const orderNumber =
      "CO-" + Date.now().toString(36).toUpperCase() + "-" +
      crypto.randomBytes(3).toString("hex").toUpperCase();

    const orderResult = await client.query(
      `INSERT INTO orders
       (customer_id, order_number, status, currency, total, payment_method,
        customer_email, order_date, created_at, updated_at, shipping_name,
        shipping_phone, shipping_address, shipping_city, shipping_state,
        shipping_postal_code, shipping_country, notes)
       VALUES ($1, $2, 'processing', 'INR', $3, 'cod', $4, NOW(), NOW(), NOW(),
        $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, order_number, status, currency, total`,
      [
        customer.id,
        orderNumber,
        total,
        customer.email,
        shipping_name.trim(),
        shipping_phone.trim(),
        shipping_address.trim(),
        shipping_city.trim(),
        shipping_state.trim(),
        shipping_postal_code.trim(),
        shipping_country.trim(),
        typeof notes === "string" ? notes.slice(0, 1000) : null,
      ]
    );

    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, product_name, sku, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.id,
          item.product.id,
          item.product.name,
          item.product.sku,
          item.quantity,
          item.price,
          item.lineTotal,
        ]
      );

      const remaining = Number(item.product.stock_quantity) - item.quantity;

      await client.query(
        `UPDATE products
         SET stock_quantity = $1, stock_status = $2, updated_at = NOW()
         WHERE id = $3`,
        [
          remaining,
          remaining > 0 ? "instock" : "outofstock",
          item.product.id,
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Cash-on-delivery order placed successfully.",
      data: order,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

// ----------------------------------------------------
// Manager orders
// ----------------------------------------------------

app.get("/api/orders", requireAuth, requireManager, asyncRoute(async (req, res) => {
  const parsed = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(parsed || 50, 1), 100);

  const result = await pool.query(
    `SELECT id, woo_order_id, customer_id, order_number, status, currency,
            total, payment_method, customer_email, order_date, shipping_name,
            shipping_phone, shipping_address, shipping_city, shipping_state,
            shipping_postal_code, shipping_country
     FROM orders ORDER BY order_date DESC NULLS LAST, id DESC LIMIT $1`,
    [limit]
  );

  res.json({ success: true, count: result.rowCount, data: result.rows });
}));

app.get("/api/orders/:id/items", requireAuth, requireManager, asyncRoute(async (req, res) => {
  if (!positiveInteger(req.params.id)) return sendError(res, 400, "Invalid order ID.");

  const result = await pool.query(
    `SELECT id, product_id, product_name, sku, quantity, unit_price, line_total
     FROM order_items WHERE order_id = $1 ORDER BY id`,
    [req.params.id]
  );

  res.json({ success: true, data: result.rows });
}));

app.put("/api/orders/:id", requireAuth, requireManager, asyncRoute(async (req, res) => {
  if (!positiveInteger(req.params.id)) return sendError(res, 400, "Invalid order ID.");

  const allowedStatuses = [
    "pending",
    "processing",
    "on-hold",
    "completed",
    "cancelled",
    "refunded",
    "failed",
  ];

  if (!allowedStatuses.includes(req.body.status)) {
    return sendError(res, 400, "Invalid order status.");
  }

  const result = await pool.query(
    `UPDATE orders SET status = $1, updated_at = NOW()
     WHERE id = $2 RETURNING id, order_number, status, total`,
    [req.body.status, req.params.id]
  );

  if (!result.rowCount) return sendError(res, 404, "Order not found.");

  res.json({ success: true, data: result.rows[0] });
}));

app.delete("/api/orders/:id", requireAuth, requireManager, asyncRoute(async (req, res) => {
  if (!positiveInteger(req.params.id)) return sendError(res, 400, "Invalid order ID.");

  const result = await pool.query(
    "DELETE FROM orders WHERE id = $1 RETURNING id",
    [req.params.id]
  );

  if (!result.rowCount) return sendError(res, 404, "Order not found.");

  res.json({ success: true, message: "Order deleted." });
}));

// ----------------------------------------------------
// Unknown API routes and centralized errors
// ----------------------------------------------------

app.use("/api", (req, res) => {
  sendError(res, 404, "API endpoint not found.");
});

app.use((error, req, res, next) => {
  console.error("API error:", error.message);

  if (res.headersSent) return next(error);

  if (error.message === "Origin not allowed by CORS") {
    return sendError(res, 403, "This website origin is not allowed.");
  }

  if (error.type === "entity.parse.failed") {
    return sendError(res, 400, "Invalid JSON request.");
  }

  if (error.code === "23505") {
    return sendError(res, 409, "A record with that unique value already exists.");
  }

  if (error.code === "23503") {
    return sendError(res, 409, "This record is linked to another record.");
  }

  res.status(500).json({
    success: false,
    message: "An unexpected server error occurred.",
  });
});

// ----------------------------------------------------
// Start and graceful shutdown
// ----------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`CommerceOS API running at http://localhost:${PORT}`);
});

async function shutdown() {
  server.close(async () => {
    try {
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error.message);
      process.exit(1);
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);