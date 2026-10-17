const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const TOKEN_KEY = "commerceos_manager_token";

export function getManagerToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveManagerToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearManagerToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(endpoint, options = {}) {
  const token = getManagerToken();

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Cannot connect to CommerceOS API. Make sure backend is running on port 5000."
    );
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Session expired or access denied. Please sign in again."
      );
    }

    throw new Error(result.message || `Request failed (${response.status}).`);
  }

  return result;
}

function jsonOptions(method, data) {
  return {
    method,
    body: JSON.stringify(data),
  };
}

// Authentication
export async function managerLogin(email, password) {
  const result = await request("/auth/login", {
    ...jsonOptions("POST", { email, password }),
  });

  const user = result.user || result.data?.user;
  const token = result.token || result.data?.token;

  if (!token || user?.role !== "manager") {
    throw new Error(
      "This account is not a manager account, or the API returned no token."
    );
  }

  saveManagerToken(token);
  return { ...result, user, token };
}

export function managerLogout() {
  clearManagerToken();
}

export async function getCurrentManager() {
  const result = await request("/auth/me");
  const user = result.user || result.data?.user;

  if (user?.role !== "manager") {
    clearManagerToken();
    throw new Error("Manager access required.");
  }

  return user;
}

// Health and dashboard
export function getHealth() {
  return request("/health");
}

export function getDashboard() {
  return request("/dashboard");
}

// Products
export function getProducts() {
  return request("/products");
}

export function createProduct(data) {
  return request("/products", jsonOptions("POST", data));
}

export function updateProduct(id, data) {
  return request(`/products/${id}`, jsonOptions("PUT", data));
}

export function deleteProduct(id) {
  return request(`/products/${id}`, { method: "DELETE" });
}

// Customers
export function getCustomers() {
  return request("/customers");
}

export function createCustomer(data) {
  return request("/customers", jsonOptions("POST", data));
}

export function updateCustomer(id, data) {
  return request(`/customers/${id}`, jsonOptions("PUT", data));
}

export function deleteCustomer(id) {
  return request(`/customers/${id}`, { method: "DELETE" });
}

// Orders
export function getOrders() {
  return request("/orders");
}

export function createOrder(data) {
  return request("/orders", jsonOptions("POST", data));
}

export function updateOrder(id, data) {
  return request(`/orders/${id}`, jsonOptions("PUT", data));
}

export function deleteOrder(id) {
  return request(`/orders/${id}`, { method: "DELETE" });
}

export function getOrderItems(id) {
  return request(`/orders/${id}/items`);
}