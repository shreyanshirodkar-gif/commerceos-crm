
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearManagerToken,
  managerLogin,
  getCurrentManager,
  getDashboard,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getCustomers,
  getOrders,
  updateOrder,
} from "./api";
import "./App.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const dateText = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

const unwrap = (result) => {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.rows)) return result.data.rows;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
};

function App() {
  const [manager, setManager] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("manager@commerceos.local");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);

  const [section, setSection] = useState("Overview");
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [showProductForm, setShowProductForm] = useState(false);

  // Product editing state
  const [editingProductId, setEditingProductId] = useState(null);
  const [editProductForm, setEditProductForm] = useState({
    price: "",
    stock_quantity: "",
  });
  const [savingProductId, setSavingProductId] = useState(null);

  const [productForm, setProductForm] = useState({
    name: "",
    sku: "",
    price: "",
    stock_quantity: "1",
    stock_status: "instock",
    product_status: "publish",
    image_url: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const results = await Promise.allSettled([
        getDashboard(),
        getProducts(),
        getCustomers(),
        getOrders(),
      ]);

      const [dashboardResult, productResult, customerResult, orderResult] =
        results;

      if (
        results.some(
          (result) =>
            result.status === "rejected" &&
            /session expired|access denied|manager access|required/i.test(
              result.reason?.message || ""
            )
        )
      ) {
        clearManagerToken();
        setManager(null);
        setPageError("Your manager session expired. Please sign in again.");
        return;
      }

      if (dashboardResult.status === "fulfilled") {
        setDashboard(
          dashboardResult.value.data ?? dashboardResult.value
        );
      }

      if (productResult.status === "fulfilled") {
        setProducts(unwrap(productResult.value));
      } else {
        throw new Error(
          `Could not load products: ${
            productResult.reason?.message || "Unknown error"
          }`
        );
      }

      if (customerResult.status === "fulfilled") {
        setCustomers(unwrap(customerResult.value));
      }

      if (orderResult.status === "fulfilled") {
        setOrders(unwrap(orderResult.value));
      }

      const failed = results.filter(
        (result) => result.status === "rejected"
      );

      if (failed.length) {
        setPageError(
          failed
            .map((result) => result.reason?.message)
            .filter(Boolean)
            .join(" ")
        );
      }
    } catch (error) {
      setPageError(error.message || "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const user = await getCurrentManager();
        if (active) setManager(user);
      } catch {
        clearManagerToken();
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    checkSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (manager) {
      // Load dashboard data after authentication.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [manager, loadData]);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");

    try {
      const result = await managerLogin(email.trim(), password);
      setManager(result.user);
      setPassword("");
    } catch (error) {
      setLoginError(
        error.message ||
          "Login failed. Check the manager email and password."
      );
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    clearManagerToken();
    setManager(null);
    setDashboard(null);
    setProducts([]);
    setCustomers([]);
    setOrders([]);
    setSection("Overview");
    setLoginError("");
    setEditingProductId(null);
  }

  async function handleCreateProduct(event) {
    event.preventDefault();
    setBusy(true);
    setPageError("");
    setNotice("");

    try {
      const price = Number(productForm.price);
      const quantity = Number(productForm.stock_quantity);

      if (!productForm.name.trim()) {
        throw new Error("Enter a product name.");
      }

      if (!Number.isFinite(price) || price < 0) {
        throw new Error("Enter a valid price.");
      }

      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new Error(
          "Stock quantity must be a whole number of 0 or more."
        );
      }

      await createProduct({
        ...productForm,
        name: productForm.name.trim(),
        sku: productForm.sku.trim(),
        price,
        stock_quantity: quantity,
        stock_status: quantity > 0 ? "instock" : "outofstock",
      });

      setProductForm({
        name: "",
        sku: "",
        price: "",
        stock_quantity: "1",
        stock_status: "instock",
        product_status: "publish",
        image_url: "",
      });

      setShowProductForm(false);
      setNotice("Product created successfully.");
      await loadData();
    } catch (error) {
      setPageError(error.message || "Could not create product.");
    } finally {
      setBusy(false);
    }
  }

  function handleEditProduct(product) {
    setEditingProductId(product.id);
    setEditProductForm({
      price: String(product.price ?? 0),
      stock_quantity: String(product.stock_quantity ?? 0),
    });
    setPageError("");
    setNotice("");
  }

  function handleCancelEdit() {
    setEditingProductId(null);
    setEditProductForm({
      price: "",
      stock_quantity: "",
    });
    setPageError("");
  }

  async function handleSaveProduct(product) {
    const priceText = String(editProductForm.price);
    const quantityText = String(editProductForm.stock_quantity);
    const price = Number(priceText);
    const quantity = Number(quantityText);

    if (
      priceText.trim() === "" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setPageError("Enter a valid price of 0 or more.");
      return;
    }

    if (
      quantityText.trim() === "" ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      setPageError(
        "Stock quantity must be a whole number of 0 or more."
      );
      return;
    }

    setSavingProductId(product.id);
    setPageError("");
    setNotice("");

    try {
      await updateProduct(product.id, {
        name: product.name,
        sku: product.sku || "",
        price,
        stock_quantity: quantity,
        stock_status: quantity > 0 ? "instock" : "outofstock",
        product_status: product.product_status || "publish",
        image_url: product.image_url || "",
      });

      setEditingProductId(null);
      setEditProductForm({ price: "", stock_quantity: "" });
      setNotice(`"${product.name}" updated successfully.`);
      await loadData();
    } catch (error) {
      setPageError(error.message || "Could not update product.");
    } finally {
      setSavingProductId(null);
    }
  }

  async function handleDeleteProduct(product) {
    if (
      !window.confirm(
        `Delete "${product.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    setPageError("");
    setNotice("");

    try {
      await deleteProduct(product.id);
      setNotice("Product deleted.");
      await loadData();
    } catch (error) {
      setPageError(error.message || "Could not delete product.");
    }
  }

  async function handleOrderStatus(order, status) {
    setPageError("");
    setNotice("");

    try {
      await updateOrder(order.id, { status });
      setNotice(`Order ${order.order_number || order.id} updated.`);
      await loadData();
    } catch (error) {
      setPageError(error.message || "Could not update order.");
    }
  }

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;

    return products.filter((product) =>
      [
        product.name,
        product.sku,
        product.product_status,
        product.stock_status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [products, search]);

  const visibleCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;

    return customers.filter((customer) =>
      [
        customer.first_name,
        customer.last_name,
        customer.email,
        customer.phone,
        customer.city,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [customers, search]);

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;

    return orders.filter((order) =>
      [
        order.order_number,
        order.customer_email,
        order.status,
        order.payment_method,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [orders, search]);

  if (checkingSession) {
    return (
      <div className="manager-loading">
        <span className="manager-logo">C</span>
        <p>Loading CommerceOS…</p>
      </div>
    );
  }

  if (!manager) {
    return (
      <main className="login-screen">
        <section className="login-art">
          <div className="login-brand">
            <span className="manager-logo">C</span>
            <span>
              Commerce<span>OS</span>
            </span>
          </div>

          <div className="login-art-copy">
            <span className="overline">COMMERCEOS MANAGEMENT</span>
            <h1>
              Your business.
              <br />
              In better view.
            </h1>
            <p>
              Manage products, track orders, and understand your store
              from one central workspace.
            </p>
          </div>

          <div className="login-art-footer">
            COMMERCEOS · ADMINISTRATION
          </div>
        </section>

        <section className="login-panel">
          <form className="login-form" onSubmit={handleLogin}>
            <span className="overline">MANAGER PORTAL</span>
            <h2>Welcome back</h2>
            <p>Sign in with your manager account to continue.</p>

            {loginError && (
              <div className="manager-alert error" role="alert">
                {loginError}
              </div>
            )}

            <label htmlFor="manager-email">Email address</label>
            <input
              id="manager-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="manager@example.com"
              required
            />

            <label htmlFor="manager-password">Password</label>
            <input
              id="manager-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your manager password"
              required
            />

            <button
              className="manager-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign in to dashboard"}
              <span aria-hidden="true">→</span>
            </button>

            <small className="login-security">
              Protected manager access · CommerceOS
            </small>
          </form>
        </section>
      </main>
    );
  }

  const stats = dashboard?.stats || dashboard?.summary || dashboard || {};

  const totalRevenue = orders.reduce(
    (sum, order) =>
      ["cancelled", "failed", "refunded"].includes(
        String(order.status || "").toLowerCase()
      )
        ? sum
        : sum + Number(order.total || 0),
    0
  );

  const publishedProducts = products.filter(
    (product) =>
      String(product.product_status || "").toLowerCase() === "publish"
  ).length;

  const lowStockProducts = products.filter(
    (product) =>
      Number(product.stock_quantity || 0) <= 5 &&
      String(product.stock_status || "").toLowerCase() !== "outofstock"
  ).length;

  return (
    <div className="manager-app">
      <aside className="manager-sidebar">
        <button
          className="manager-brand"
          onClick={() => setSection("Overview")}
          type="button"
        >
          <span className="manager-logo">C</span>
          <span>
            Commerce<span>OS</span>
          </span>
        </button>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="manager-nav" aria-label="Dashboard navigation">
          {[
            ["Overview", "◫"],
            ["Products", "▦"],
            ["Orders", "↗"],
            ["Customers", "♙"],
          ].map(([name, symbol]) => (
            <button
              type="button"
              key={name}
              className={`manager-nav-item ${
                section === name ? "selected" : ""
              }`}
              onClick={() => {
                setSection(name);
                setSearch("");
                setPageError("");
                setNotice("");
              }}
            >
              <span className="nav-symbol">{symbol}</span>
              <span>{name}</span>
              {name === "Products" && (
                <span className="nav-count">{products.length}</span>
              )}
              {name === "Orders" && (
                <span className="nav-count">{orders.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="manager-profile">
            <div className="profile-avatar">
              {(manager.email || "M").charAt(0).toUpperCase()}
            </div>
            <div className="profile-copy">
              <strong>Store manager</strong>
              <small>{manager.email}</small>
            </div>
          </div>

          <button
            className="logout-button"
            onClick={handleLogout}
            type="button"
          >
            <span>↪</span> Sign out
          </button>
        </div>
      </aside>

      <main className="manager-main">
        <header className="manager-topbar">
          <div>
            <span className="topbar-label">
              COMMERCEOS / MANAGEMENT
            </span>
            <div className="topbar-current">{section}</div>
          </div>

          <div className="topbar-actions">
            <span className="api-status">
              <span className="status-dot" />
              Local workspace
            </span>
            <button
              className="refresh-button"
              type="button"
              onClick={loadData}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </header>

        <div className="manager-content">
          {pageError && (
            <div className="manager-alert error" role="alert">
              <span>{pageError}</span>
              <button
                type="button"
                onClick={() => setPageError("")}
              >
                ×
              </button>
            </div>
          )}

          {notice && (
            <div className="manager-alert success" role="status">
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}

          {section === "Overview" && (
            <>
              <div className="page-intro">
                <div>
                  <span className="overline">STORE PERFORMANCE</span>
                  <h1>Good to see you.</h1>
                  <p>Here’s what’s happening with your store today.</p>
                </div>
                <button
                  className="manager-primary compact"
                  type="button"
                  onClick={() => {
                    setSection("Products");
                    setShowProductForm(true);
                  }}
                >
                  + Add product
                </button>
              </div>

              <div className="stats-grid">
                <StatCard
                  label="TOTAL PRODUCTS"
                  value={products.length}
                  note={`${publishedProducts} published`}
                  symbol="▦"
                />
                <StatCard
                  label="TOTAL ORDERS"
                  value={orders.length}
                  note="Orders in your database"
                  symbol="↗"
                />
                <StatCard
                  label="CUSTOMERS"
                  value={customers.length}
                  note="Customer records"
                  symbol="♙"
                />
                <StatCard
                  label="ORDER VALUE"
                  value={money(
                    stats.totalRevenue ?? stats.revenue ?? totalRevenue
                  )}
                  note="Excludes cancelled, failed and refunded orders"
                  symbol="₹"
                />
              </div>

              <div className="overview-grid">
                <section className="manager-card">
                  <div className="card-heading">
                    <div>
                      <h2>Recent orders</h2>
                      <p>Latest activity from your store</p>
                    </div>
                    <button
                      className="text-action"
                      onClick={() => setSection("Orders")}
                      type="button"
                    >
                      View all →
                    </button>
                  </div>

                  {orders.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>ORDER</th>
                            <th>CUSTOMER</th>
                            <th>STATUS</th>
                            <th className="align-right">TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.slice(0, 5).map((order) => (
                            <tr key={order.id}>
                              <td className="strong-cell">
                                #{order.order_number || order.id}
                              </td>
                              <td>
                                {order.customer_email || "Guest / customer"}
                              </td>
                              <td>
                                <StatusPill status={order.status} />
                              </td>
                              <td className="align-right">
                                {money(order.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      title="No orders yet"
                      message="New storefront orders will appear here."
                    />
                  )}
                </section>

                <section className="manager-card inventory-card">
                  <div className="card-heading">
                    <div>
                      <h2>Inventory overview</h2>
                      <p>Product availability</p>
                    </div>
                  </div>

                  <div className="inventory-summary">
                    <div>
                      <span className="inventory-icon">▦</span>
                      <span>Published products</span>
                      <strong>{publishedProducts}</strong>
                    </div>
                    <div>
                      <span className="inventory-icon warning-icon">!</span>
                      <span>Low stock (5 or fewer)</span>
                      <strong>{lowStockProducts}</strong>
                    </div>
                    <div>
                      <span className="inventory-icon">◌</span>
                      <span>Out of stock</span>
                      <strong>
                        {
                          products.filter(
                            (product) =>
                              String(product.stock_status).toLowerCase() ===
                              "outofstock"
                          ).length
                        }
                      </strong>
                    </div>
                  </div>

                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => setSection("Products")}
                  >
                    Manage inventory →
                  </button>
                </section>
              </div>
            </>
          )}

          {section === "Products" && (
            <>
              <div className="page-intro">
                <div>
                  <span className="overline">CATALOGUE MANAGEMENT</span>
                  <h1>Products</h1>
                  <p>
                    Manage the products displayed in your customer storefront.
                  </p>
                </div>
                <button
                  className="manager-primary compact"
                  type="button"
                  onClick={() => setShowProductForm((current) => !current)}
                >
                  {showProductForm ? "Cancel" : "+ Add product"}
                </button>
              </div>

              {showProductForm && (
                <section className="manager-card product-form-card">
                  <div className="card-heading">
                    <div>
                      <h2>Add a product</h2>
                      <p>
                        Published products can appear on the storefront.
                      </p>
                    </div>
                  </div>

                  <form
                    className="product-form"
                    onSubmit={handleCreateProduct}
                  >
                    <label>
                      Product name *
                      <input
                        value={productForm.name}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            name: event.target.value,
                          })
                        }
                        required
                        maxLength={200}
                      />
                    </label>

                    <label>
                      SKU
                      <input
                        value={productForm.sku}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            sku: event.target.value,
                          })
                        }
                        maxLength={100}
                      />
                    </label>

                    <label>
                      Price (₹) *
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={productForm.price}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            price: event.target.value,
                          })
                        }
                        required
                      />
                    </label>

                    <label>
                      Stock quantity *
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={productForm.stock_quantity}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            stock_quantity: event.target.value,
                          })
                        }
                        required
                      />
                    </label>

                    <label className="wide-field">
                      Product image URL
                      <input
                        type="url"
                        placeholder="https://example.com/product.jpg"
                        value={productForm.image_url}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            image_url: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Publication status
                      <select
                        value={productForm.product_status}
                        onChange={(event) =>
                          setProductForm({
                            ...productForm,
                            product_status: event.target.value,
                          })
                        }
                      >
                        <option value="publish">Published</option>
                        <option value="draft">Draft</option>
                      </select>
                    </label>

                    <div className="form-submit-row">
                      <button
                        className="manager-primary compact"
                        type="submit"
                        disabled={busy}
                      >
                        {busy ? "Saving…" : "Save product"}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              <DataToolbar
                search={search}
                setSearch={setSearch}
                placeholder="Search products by name or SKU…"
              />

              <section className="manager-card">
                <div className="card-heading">
                  <div>
                    <h2>All products</h2>
                    <p>
                      {visibleProducts.length} of {products.length} products
                    </p>
                  </div>
                  <span className="table-count">
                    {products.length} total
                  </span>
                </div>

                {loading && !products.length ? (
                  <EmptyState
                    title="Loading products…"
                    message="Connecting to the database."
                  />
                ) : visibleProducts.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>PRODUCT</th>
                          <th>SKU</th>
                          <th>PRICE</th>
                          <th>STOCK</th>
                          <th>STATUS</th>
                          <th>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleProducts.map((product) => {
                          const isEditing =
                            editingProductId === product.id;
                          const isSaving =
                            savingProductId === product.id;

                          const displayedQuantity = isEditing
                            ? Number(editProductForm.stock_quantity)
                            : Number(product.stock_quantity ?? 0);

                          return (
                            <tr key={product.id}>
                              <td>
                                <div className="product-cell">
                                  {product.image_url ? (
                                    <img
                                      src={product.image_url}
                                      alt=""
                                      onError={(event) => {
                                        event.currentTarget.style.display =
                                          "none";
                                      }}
                                    />
                                  ) : (
                                    <span className="product-cell-placeholder">
                                      C
                                    </span>
                                  )}
                                  <span className="strong-cell">
                                    {product.name}
                                  </span>
                                </div>
                              </td>

                              <td>{product.sku || "—"}</td>

                              <td>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editProductForm.price}
                                    aria-label={`Price for ${product.name}`}
                                    onChange={(event) =>
                                      setEditProductForm((current) => ({
                                        ...current,
                                        price: event.target.value,
                                      }))
                                    }
                                    style={{ width: "110px" }}
                                  />
                                ) : (
                                  <span className="strong-cell">
                                    {money(product.price)}
                                  </span>
                                )}
                              </td>

                              <td>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={editProductForm.stock_quantity}
                                    aria-label={`Stock quantity for ${product.name}`}
                                    onChange={(event) =>
                                      setEditProductForm((current) => ({
                                        ...current,
                                        stock_quantity: event.target.value,
                                      }))
                                    }
                                    style={{ width: "85px" }}
                                  />
                                ) : (
                                  product.stock_quantity ?? 0
                                )}
                              </td>

                              <td>
                                <StatusPill
                                  status={
                                    isEditing
                                      ? displayedQuantity > 0
                                        ? "instock"
                                        : "outofstock"
                                      : product.stock_status ||
                                        (Number(product.stock_quantity) > 0
                                          ? "instock"
                                          : "outofstock")
                                  }
                                />
                              </td>

                              <td>
                                {isEditing ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "8px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="manager-primary compact"
                                      disabled={isSaving}
                                      onClick={() =>
                                        handleSaveProduct(product)
                                      }
                                    >
                                      {isSaving ? "Saving…" : "Save"}
                                    </button>

                                    <button
                                      type="button"
                                      className="secondary-action"
                                      disabled={isSaving}
                                      onClick={handleCancelEdit}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "8px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="secondary-action"
                                      disabled={editingProductId !== null}
                                      onClick={() =>
                                        handleEditProduct(product)
                                      }
                                    >
                                      Edit
                                    </button>

                                    <button
                                      type="button"
                                      className="danger-action"
                                      disabled={editingProductId !== null}
                                      onClick={() =>
                                        handleDeleteProduct(product)
                                      }
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title="No matching products"
                    message={
                      products.length
                        ? "Try another search term."
                        : "No products were returned by the manager API."
                    }
                  />
                )}
              </section>
            </>
          )}

          {section === "Customers" && (
            <>
              <div className="page-intro">
                <div>
                  <span className="overline">CUSTOMER RELATIONSHIPS</span>
                  <h1>Customers</h1>
                  <p>View customer profiles and contact information.</p>
                </div>
              </div>

              <DataToolbar
                search={search}
                setSearch={setSearch}
                placeholder="Search customers…"
              />

              <section className="manager-card">
                <div className="card-heading">
                  <div>
                    <h2>Customer directory</h2>
                    <p>{visibleCustomers.length} customers</p>
                  </div>
                </div>

                {visibleCustomers.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>CUSTOMER</th>
                          <th>EMAIL</th>
                          <th>PHONE</th>
                          <th>CITY</th>
                          <th>JOINED</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleCustomers.map((customer) => (
                          <tr key={customer.id}>
                            <td className="strong-cell">
                              {[
                                customer.first_name,
                                customer.last_name,
                              ]
                                .filter(Boolean)
                                .join(" ") || "Customer"}
                            </td>
                            <td>{customer.email || "—"}</td>
                            <td>{customer.phone || "—"}</td>
                            <td>{customer.city || "—"}</td>
                            <td>{dateText(customer.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title="No customers found"
                    message="Registered customer records will appear here."
                  />
                )}
              </section>
            </>
          )}

          {section === "Orders" && (
            <>
              <div className="page-intro">
                <div>
                  <span className="overline">FULFILMENT & PAYMENTS</span>
                  <h1>Orders</h1>
                  <p>Review purchases and update order status.</p>
                </div>
              </div>

              <DataToolbar
                search={search}
                setSearch={setSearch}
                placeholder="Search by order number or email…"
              />

              <section className="manager-card">
                <div className="card-heading">
                  <div>
                    <h2>All orders</h2>
                    <p>{visibleOrders.length} orders</p>
                  </div>
                </div>

                {visibleOrders.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>ORDER</th>
                          <th>CUSTOMER</th>
                          <th>DATE</th>
                          <th>PAYMENT</th>
                          <th>TOTAL</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleOrders.map((order) => (
                          <tr key={order.id}>
                            <td className="strong-cell">
                              #{order.order_number || order.id}
                            </td>
                            <td>{order.customer_email || "—"}</td>
                            <td>
                              {dateText(
                                order.order_date || order.created_at
                              )}
                            </td>
                            <td>{order.payment_method || "—"}</td>
                            <td className="strong-cell">
                              {money(order.total)}
                            </td>
                            <td>
                              <select
                                className="status-select"
                                value={order.status || "pending"}
                                aria-label={`Status for order ${
                                  order.order_number || order.id
                                }`}
                                onChange={(event) =>
                                  handleOrderStatus(
                                    order,
                                    event.target.value
                                  )
                                }
                              >
                                {[
                                  "pending",
                                  "processing",
                                  "on-hold",
                                  "completed",
                                  "cancelled",
                                  "failed",
                                  "refunded",
                                ].map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title="No orders found"
                    message="Orders placed by customers will appear here."
                  />
                )}
              </section>
            </>
          )}
        </div>

        <footer className="manager-footer">
          <span>© {new Date().getFullYear()} CommerceOS</span>
          <span>Manager workspace · Local development</span>
        </footer>
      </main>
    </div>
  );
}

function StatCard({ label, value, note, symbol }) {
  return (
    <section className="stat-card">
      <div className="stat-card-top">
        <span>{label}</span>
        <span className="stat-symbol">{symbol}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </section>
  );
}

function StatusPill({ status }) {
  const normalized = String(status || "pending").toLowerCase();

  const tone = [
    "completed",
    "published",
    "processing",
    "instock",
  ].includes(normalized)
    ? "good"
    : [
        "cancelled",
        "failed",
        "refunded",
        "outofstock",
      ].includes(normalized)
      ? "bad"
      : [
          "pending",
          "on-hold",
          "draft",
        ].includes(normalized)
        ? "warning"
        : "neutral";

  return (
    <span className={`status-pill status-${tone}`}>
      {normalized.replaceAll("-", " ")}
    </span>
  );
}

function DataToolbar({ search, setSearch, placeholder }) {
  return (
    <div className="data-toolbar">
      <label className="manager-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </label>
    </div>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="manager-empty">
      <span className="empty-icon">▦</span>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

export default App;
