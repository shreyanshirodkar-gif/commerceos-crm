
import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadPurchasePDF } from "./purchasePDF";
import {
  clearSession,
  getCurrentUser,
  getMyOrders,
  getProducts,
  getSavedUser,
  getToken,
  loginCustomer,
  placeCodOrder,
  registerCustomer,
} from "./api";
import "./App.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const initialAddress = {
  shippingName: "",
  shippingPhone: "",
  shippingAddress: "",
  shippingCity: "",
  shippingState: "",
  shippingPostalCode: "",
  shippingCountry: "India",
  notes: "",
};

function ProductImage({ product }) {
  const [failed, setFailed] = useState(false);

  if (!product.image_url || failed) {
    return (
      <div className="product-placeholder">
        <span>C</span>
        <small>CommerceOS</small>
      </div>
    );
  }

  return (
    <img
      className="product-image"
      src={product.image_url}
      alt={product.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function Header({ user, cartCount, page, setPage, onLogout }) {
  return (
    <header className="site-header">
      <button className="brand" onClick={() => setPage("store")}>
        <span className="brand-mark">C</span>
        <span>
          Commerce<span className="brand-light">OS</span>
        </span>
      </button>

      <nav className="main-nav">
        <button
          className={page === "store" ? "nav-link active" : "nav-link"}
          onClick={() => setPage("store")}
        >
          Shop
        </button>

        {user && (
          <button
            className={page === "orders" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("orders")}
          >
            My orders
          </button>
        )}
      </nav>

      <div className="header-actions">
        <button className="cart-button" onClick={() => setPage("cart")}>
          Bag <span className="cart-count">{cartCount}</span>
        </button>

        {user ? (
          <button className="account-button" onClick={onLogout}>
            Sign out
          </button>
        ) : (
          <button className="account-button" onClick={() => setPage("login")}>
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}

function StorePage({ products, loading, search, setSearch, addToCart }) {
  const filtered = products.filter((product) =>
    `${product.name || ""} ${product.sku || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">THE COMMERCEOS COLLECTION</span>
          <h1>
            Good finds.
            <br />
            Better everyday.
          </h1>
          <p>
            Discover everyday essentials selected for quality,
            usefulness and value.
          </p>

          <button
            className="primary-button"
            onClick={() =>
              document.getElementById("catalogue")?.scrollIntoView({
                behavior: "smooth",
              })
            }
          >
            Explore the collection ↘
          </button>
        </div>

        <div className="hero-art">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-product">
            <span className="hero-product-symbol">C</span>
            <span className="hero-product-label">CURATED FOR YOU</span>
          </div>
          <span className="hero-caption">YOUR NEXT FAVOURITE</span>
        </div>
      </section>

      <section className="catalogue section-wrap" id="catalogue">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE SHOP</span>
            <h2>Find your next favourite.</h2>
            <p>Products published in the CommerceOS manager dashboard.</p>
          </div>

          <span className="catalogue-count">
            {loading ? "Loading..." : `${filtered.length} items`}
          </span>
        </div>

        <div className="catalogue-tools">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products or SKU..."
              aria-label="Search products"
            />
          </label>
        </div>

        {loading ? (
          <div className="state-panel">Loading products...</div>
        ) : filtered.length === 0 ? (
          <div className="state-panel">
            <h3>No products found</h3>
            <p>
              Try a different search or check that products are available
              in the manager dashboard.
            </p>
          </div>
        ) : (
          <div className="product-grid">
            {filtered.map((product) => {
              const outOfStock =
                product.stock_status === "outofstock" ||
                (product.stock_quantity != null &&
                  Number(product.stock_quantity) <= 0);

              return (
                <article className="product-card" key={product.id}>
                  <div className="product-visual">
                    <ProductImage product={product} />

                    {outOfStock && (
                      <span className="stock-badge">Out of stock</span>
                    )}
                  </div>

                  <div className="product-details">
                    <div className="product-meta">
                      <span>{product.sku || "COMMERCEOS"}</span>
                      <span>#{product.id}</span>
                    </div>

                    <h3>{product.name}</h3>

                    <div className="product-bottom">
                      <strong>{money(product.price)}</strong>

                      <button
                        className="add-button"
                        disabled={outOfStock}
                        onClick={() => addToCart(product)}
                      >
                        {outOfStock ? "Unavailable" : "Add to bag +"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="promise-strip">
        <div>
          <span>01</span>
          <strong>Simple shopping</strong>
          <small>Browse with ease</small>
        </div>
        <div>
          <span>02</span>
          <strong>Cash on Delivery</strong>
          <small>Pay when delivered</small>
        </div>
        <div>
          <span>03</span>
          <strong>Your account</strong>
          <small>Keep track of orders</small>
        </div>
      </section>
    </>
  );
}

function AuthPage({ mode, setPage, onLogin, onRegister, busy }) {
  const isRegister = mode === "register";

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });

  const [error, setError] = useState("");

  function update(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    try {
      if (isRegister) {
        await onRegister(form);
      } else {
        await onLogin(form.email, form.password);
      }
    } catch (err) {
      setError(err.message || "Unable to continue. Please try again.");
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-art">
        <span className="eyebrow">WELCOME TO COMMERCEOS</span>
        <h2>
          A better way
          <br />
          to shop.
        </h2>
        <p>Your account keeps your shopping and orders together.</p>
        <div className="auth-art-mark">
          C<span>OS</span>
        </div>
      </div>

      <div className="auth-panel">
        <span className="eyebrow">
          {isRegister ? "JOIN THE STORE" : "YOUR ACCOUNT"}
        </span>

        <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p>
          {isRegister
            ? "Enter your details to start shopping."
            : "Sign in to continue shopping."}
        </p>

        <form onSubmit={submit} className="form-stack">
          {isRegister && (
            <div className="form-row">
              <label>
                First name
                <input
                  name="firstName"
                  value={form.firstName}
                  onChange={update}
                  required
                  autoComplete="given-name"
                />
              </label>

              <label>
                Last name
                <input
                  name="lastName"
                  value={form.lastName}
                  onChange={update}
                  required
                  autoComplete="family-name"
                />
              </label>
            </div>
          )}

          <label>
            Email address
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={update}
              required
              autoComplete="email"
            />
          </label>

          {isRegister && (
            <label>
              Phone number
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={update}
                required
                autoComplete="tel"
              />
            </label>
          )}

          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={update}
              required
              minLength={isRegister ? 12 : 1}
              autoComplete={
                isRegister ? "new-password" : "current-password"
              }
            />
            {isRegister && <small>Use at least 12 characters.</small>}
          </label>

          {error && <div className="error-message">{error}</div>}

          <button className="primary-button full-button" disabled={busy}>
            {busy
              ? "Please wait..."
              : isRegister
                ? "Create account →"
                : "Sign in →"}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? "Already have an account?" : "New to CommerceOS?"}{" "}
          <button onClick={() => setPage(isRegister ? "login" : "register")}>
            {isRegister ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </section>
  );
}

function CartPage({ cart, updateQuantity, removeItem, setPage, user }) {
  const total = cart.reduce(
    (sum, item) => sum + Number(item.price || 0) * item.quantity,
    0
  );

  return (
    <section className="content-page section-wrap">
      <span className="eyebrow">YOUR SELECTION</span>
      <h1>Your shopping bag</h1>

      {cart.length === 0 ? (
        <div className="state-panel">
          <h3>Your bag is empty.</h3>
          <p>Find something you love and add it to your bag.</p>
          <button className="primary-button" onClick={() => setPage("store")}>
            Browse products
          </button>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {cart.map((item) => (
              <article className="cart-item" key={item.id}>
                <div className="cart-item-image">
                  <ProductImage product={item} />
                </div>

                <div className="cart-item-info">
                  <h3>{item.name}</h3>
                  <p>{money(item.price)}</p>

                  <div className="quantity-control">
                    <button
                      onClick={() =>
                        updateQuantity(item.id, item.quantity - 1)
                      }
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() =>
                        updateQuantity(item.id, item.quantity + 1)
                      }
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="cart-item-end">
                  <strong>
                    {money(Number(item.price) * item.quantity)}
                  </strong>
                  <button
                    className="text-button"
                    onClick={() => removeItem(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>

          <aside className="summary-card">
            <h2>Order summary</h2>
            <div className="summary-line">
              <span>Subtotal</span>
              <strong>{money(total)}</strong>
            </div>
            <div className="summary-line">
              <span>Delivery</span>
              <strong>Confirm at checkout</strong>
            </div>
            <div className="summary-total">
              <span>Items total</span>
              <strong>{money(total)}</strong>
            </div>
            <p className="muted-note">
              Cash on Delivery is available at checkout.
            </p>
            <button
              className="primary-button full-button"
              onClick={() => setPage(user ? "checkout" : "login")}
            >
              {user
                ? "Continue to checkout →"
                : "Sign in to checkout →"}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}

function CheckoutPage({ cart, user, setPage, onPlaceOrder, busy }) {
  const [form, setForm] = useState({
    ...initialAddress,
    shippingName: [user?.first_name, user?.last_name]
      .filter(Boolean)
      .join(" "),
    shippingPhone: user?.phone || "",
  });

  const [error, setError] = useState("");

  const total = cart.reduce(
    (sum, item) => sum + Number(item.price || 0) * item.quantity,
    0
  );

  function update(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    try {
      await onPlaceOrder(form);
    } catch (err) {
      setError(err.message || "Unable to place your order.");
    }
  }

  if (cart.length === 0) {
    return (
      <section className="content-page section-wrap">
        <h1>Your bag is empty</h1>
        <button className="primary-button" onClick={() => setPage("store")}>
          Browse products
        </button>
      </section>
    );
  }

  return (
    <section className="content-page section-wrap">
      <span className="eyebrow">ALMOST YOURS</span>
      <h1>Delivery &amp; payment</h1>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={submit}>
          <h2>Delivery details</h2>

          <label>
            Full name
            <input
              name="shippingName"
              value={form.shippingName}
              onChange={update}
              required
            />
          </label>

          <label>
            Phone number
            <input
              name="shippingPhone"
              type="tel"
              value={form.shippingPhone}
              onChange={update}
              required
            />
          </label>

          <label>
            Street address
            <textarea
              name="shippingAddress"
              value={form.shippingAddress}
              onChange={update}
              required
              rows={3}
            />
          </label>

          <div className="form-row">
            <label>
              City
              <input
                name="shippingCity"
                value={form.shippingCity}
                onChange={update}
                required
              />
            </label>
            <label>
              State
              <input
                name="shippingState"
                value={form.shippingState}
                onChange={update}
                required
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              PIN code
              <input
                name="shippingPostalCode"
                value={form.shippingPostalCode}
                onChange={update}
                required
                inputMode="numeric"
              />
            </label>
            <label>
              Country
              <input
                name="shippingCountry"
                value={form.shippingCountry}
                onChange={update}
                required
              />
            </label>
          </div>

          <label>
            Order notes (optional)
            <textarea
              name="notes"
              value={form.notes}
              onChange={update}
              rows={2}
            />
          </label>

          <div className="payment-method">
            <span className="cod-icon">₹</span>
            <div>
              <strong>Cash on Delivery</strong>
              <p>Pay when your order arrives.</p>
            </div>
            <span className="selected-dot">✓</span>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button className="primary-button full-button" disabled={busy}>
            {busy
              ? "Placing order..."
              : `Place COD order · ${money(total)}`}
          </button>

          <p className="muted-note">
            Your order will be sent to the store for processing.
          </p>
        </form>

        <aside className="summary-card">
          <h2>Your order</h2>

          {cart.map((item) => (
            <div className="summary-line" key={item.id}>
              <span>
                {item.name} × {item.quantity}
              </span>
              <strong>{money(Number(item.price) * item.quantity)}</strong>
            </div>
          ))}

          <div className="summary-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>

          <button className="text-button" onClick={() => setPage("cart")}>
            ← Edit bag
          </button>
        </aside>
      </div>
    </section>
  );
}


function OrdersPage({
  orders,
  loading,
  error,
  setPage,
  onDownloadOrderPDF,
}) {
  return (
    <section className="content-page section-wrap">
      <span className="eyebrow">YOUR ACCOUNT</span>
      <h1>My orders</h1>

      {loading ? (
        <div className="state-panel">Loading your orders...</div>
      ) : error ? (
        <div className="state-panel error-message">{error}</div>
      ) : orders.length === 0 ? (
        <div className="state-panel">
          <h3>No orders yet.</h3>
          <p>Your purchases will appear here after you place an order.</p>
          <button
            className="primary-button"
            onClick={() => setPage("store")}
          >
            Start shopping
          </button>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div>
                <span className="eyebrow">
                  ORDER #{order.order_number || order.id}
                </span>
                <h3>{money(order.total)}</h3>
                <p>
                  {order.order_date
                    ? new Date(order.order_date).toLocaleString("en-IN")
                    : "Date unavailable"}
                </p>
              </div>

              <div className="order-status">
                <span className="status-pill">
                  {order.status || "processing"}
                </span>
                <small>Cash on Delivery</small>

                <button
                  className="secondary-button"
                  onClick={() => onDownloadOrderPDF(order)}
                  style={{ marginTop: "12px" }}
                >
                  Download PDF
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [page, setPage] = useState("store");
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(getSavedUser);
  const [cart, setCart] = useState([]);
  const [lastPurchase, setLastPurchase] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState("");

  // Fetch public store products from the existing backend endpoint.
  const refreshProducts = useCallback(async () => {
    setLoadingProducts(true);

    try {
      const data = await getProducts();

      console.log("CommerceOS storefront products:", data);

      if (!Array.isArray(data)) {
        console.error("Unexpected products response:", data);
        setProducts([]);
        setMessage("The store received an unexpected products response.");
        setMessageType("error");
        return;
      }

      setProducts(data);
      setMessage("");
    } catch (error) {
      console.error("Storefront product loading failed:", error);
      setMessage(error.message || "Unable to load products.");
      setMessageType("error");
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    refreshProducts();
  }, [refreshProducts]);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      if (!getToken()) return;

      try {
        const result = await getCurrentUser();
        if (active && result.user) setUser(result.user);
      } catch {
        clearSession();
        if (active) setUser(null);
      }
    }

    verifySession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (page !== "orders" || !user) return;

    let active = true;
    setLoadingOrders(true);
    setOrdersError("");

    getMyOrders()
      .then((data) => {
        if (active) setOrders(data);
      })
      .catch((error) => {
        if (active) setOrdersError(error.message);
      })
      .finally(() => {
        if (active) setLoadingOrders(false);
      });

    return () => {
      active = false;
    };
  }, [page, user]);

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });

    setMessage("");
    setPage("cart");
  }

  function updateQuantity(id, quantity) {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.id !== id));
      return;
    }

    setCart((current) =>
      current.map((item) =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  }

  function removeItem(id) {
    setCart((current) => current.filter((item) => item.id !== id));
  }

  async function handleLogin(email, password) {
    setBusy(true);

    try {
      const result = await loginCustomer(email, password);
      setUser(result.user);
      setMessage("");
      setPage("store");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(form) {
    setBusy(true);

    try {
      const result = await registerCustomer(form);
      setUser(result.user);
      setMessage("");
      setPage("store");
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    clearSession();
    setUser(null);
    setOrders([]);
    setMessage("You have signed out.");
    setMessageType("success");
    setPage("store");
  }

  async function handlePlaceOrder(address) {
    setBusy(true);

    try {
      // Preserve a copy of the purchased products before clearing the cart.
      const purchasedItems = cart.map((item) => ({
        ...item,
        productId: item.id,
        quantity: item.quantity,
      }));

      const result = await placeCodOrder({
        ...address,
        items: purchasedItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      });

      // Handle common API response shapes.
      const order = result?.data?.data || result?.data || result;

      if (!order || typeof order !== "object") {
        throw new Error(
          "Your order was submitted, but receipt details were unavailable."
        );
      }

      // Store details for the receipt download button.
      setLastPurchase({
        order,
        address: { ...address },
        cart: purchasedItems,
      });

      const orderId = order.order_number || order.id;

      setCart([]);
      await refreshProducts();

      setMessage(
        `Your order${orderId ? ` #${orderId}` : ""} was submitted successfully.`
      );
      setMessageType("success");
      setPage("success");
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadReceipt() {
    if (!lastPurchase) {
      setMessage("No purchase details are available for a receipt.");
      setMessageType("error");
      return;
    }

    try {
      downloadPurchasePDF(
        lastPurchase.order,
        lastPurchase.address,
        lastPurchase.cart
      );
    } catch (error) {
      console.error("Purchase receipt download failed:", error);
      setMessage(
        error.message || "Unable to generate the purchase receipt."
      );
      setMessageType("error");
    }
  }

async function handleDownloadOrderPDF(order) {
  try {
    // Use the saved checkout details for the most recent order.
    if (
      lastPurchase &&
      String(lastPurchase.order?.id) === String(order.id)
    ) {
      downloadPurchasePDF(
        lastPurchase.order,
        lastPurchase.address,
        lastPurchase.cart
      );
      return;
    }

    // Older orders may not have their original cart/address in React state.
    // Use the order data returned by the backend.
    downloadPurchasePDF(
      order,
      {
        shippingName: order.shipping_name || order.shippingName || "",
        shippingPhone: order.shipping_phone || order.shippingPhone || "",
        shippingAddress:
          order.shipping_address || order.shippingAddress || "",
        shippingCity: order.shipping_city || order.shippingCity || "",
        shippingState: order.shipping_state || order.shippingState || "",
        shippingPostalCode:
          order.shipping_postal_code || order.shippingPostalCode || "",
        shippingCountry:
          order.shipping_country || order.shippingCountry || "India",
      },
      order.items || order.order_items || []
    );
  } catch (error) {
    console.error("Order PDF download failed:", error);
    setMessage(error.message || "Unable to download this order's PDF.");
    setMessageType("error");
  }
}

  return (
    <div className="app-shell">
      <div className="announcement">
        <span>THE COMMERCEOS STORE</span>
        <span>Simple shopping · Cash on Delivery</span>
      </div>

      <Header
        user={user}
        cartCount={cartCount}
        page={page}
        setPage={setPage}
        onLogout={handleLogout}
      />

      {message && (
        <div
          className={
            messageType === "error"
              ? "global-message error-message"
              : "global-message"
          }
        >
          <span>{message}</span>
          <button
            onClick={() => setMessage("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <main>
        {page === "store" && (
          <StorePage
            products={products}
            loading={loadingProducts}
            search={search}
            setSearch={setSearch}
            addToCart={addToCart}
          />
        )}

        {(page === "login" || page === "register") && (
          <AuthPage
            mode={page}
            setPage={setPage}
            onLogin={handleLogin}
            onRegister={handleRegister}
            busy={busy}
          />
        )}

        {page === "cart" && (
          <CartPage
            cart={cart}
            updateQuantity={updateQuantity}
            removeItem={removeItem}
            setPage={setPage}
            user={user}
          />
        )}

        {page === "checkout" &&
          (user ? (
            <CheckoutPage
              cart={cart}
              user={user}
              setPage={setPage}
              onPlaceOrder={handlePlaceOrder}
              busy={busy}
            />
          ) : (
            <AuthPage
              mode="login"
              setPage={setPage}
              onLogin={handleLogin}
              onRegister={handleRegister}
              busy={busy}
            />
          ))}

        {page === "orders" &&
          (user ? (
            
   <OrdersPage
     orders={orders}
     loading={loadingOrders}
     error={ordersError}
     setPage={setPage}
     onDownloadOrderPDF={handleDownloadOrderPDF}
   />
   
          ) : (
            <AuthPage
              mode="login"
              setPage={setPage}
              onLogin={handleLogin}
              onRegister={handleRegister}
              busy={busy}
            />
          ))}

        {page === "success" && (
          <section className="success-panel">
            <div className="success-check">✓</div>
            <span className="eyebrow">ORDER RECEIVED</span>
            <h1>Thank you for shopping with us.</h1>
            <p>{message || "Your order has been submitted."}</p>
            <p>
              Payment method: <strong>Cash on Delivery</strong>
            </p>

            {lastPurchase && (
              <p>
                Order number:{" "}
                <strong>
                  {lastPurchase.order.order_number ||
                    lastPurchase.order.id ||
                    "Confirmed"}
                </strong>
              </p>
            )}

            <div className="success-actions">
              <button
                className="primary-button"
                disabled={!lastPurchase}
                onClick={handleDownloadReceipt}
              >
                Download Purchase Receipt (PDF)
              </button>

              <button
                className="secondary-button"
                onClick={() => setPage("orders")}
              >
                View my orders
              </button>

              <button
                className="secondary-button"
                onClick={() => setPage("store")}
              >
                Continue shopping
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <span className="brand-mark">C</span>
          <span>
            Commerce<span className="brand-light">OS</span>
          </span>
        </div>
        <p>Your everyday shopping, made simple.</p>
        <span>© {new Date().getFullYear()} CommerceOS</span>
      </footer>
    </div>
  );
}
