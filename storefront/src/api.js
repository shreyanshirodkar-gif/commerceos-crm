
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

const SESSION_TOKEN_KEY = "commerceos_token";
const SESSION_USER_KEY = "commerceos_user";

async function request(endpoint, options = {}) {
  const token = getToken();

  const headers = {
    Accept: "application/json",
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
      "Cannot connect to CommerceOS. Check that the backend is running on port 5000."
    );
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message ||
        result.error ||
        `Request failed with status ${response.status}.`
    );
  }

  return result;
}

function saveSession(result) {
  const token = result.token;
  const user = result.user;

  if (!token || !user) {
    throw new Error("The server did not return a valid login session.");
  }

  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));

  return { token, user };
}

export function getToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function getSavedUser() {
  try {
    const saved = localStorage.getItem(SESSION_USER_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}

export async function getProducts(search = "") {
  const query = search
    ? `?search=${encodeURIComponent(search)}`
    : "";

  const result = await request(`/store/products${query}`);

  if (Array.isArray(result.data)) {
    return result.data;
  }

  if (Array.isArray(result)) {
    return result;
  }

  return [];
}

export async function getProduct(id) {
  const result = await request(
    `/store/products/${encodeURIComponent(id)}`
  );

  return result.data;
}

export async function loginCustomer(email, password) {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim(),
      password,
    }),
  });

  return saveSession(result);
}

export async function registerCustomer(form) {
  const result = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      password: form.password,
    }),
  });

  return saveSession(result);
}

export async function getCurrentUser() {
  return request("/auth/me");
}

export async function getMyOrders() {
  const result = await request("/customer/orders");

  return Array.isArray(result.data) ? result.data : [];
}


export async function placeCodOrder(address) {
  return request("/orders", {
    method: "POST",
    body: JSON.stringify({
      shipping_name: address.shippingName,
      shipping_phone: address.shippingPhone,
      shipping_address: address.shippingAddress,
      shipping_city: address.shippingCity,
      shipping_state: address.shippingState,
      shipping_postal_code: address.shippingPostalCode,
      shipping_country: address.shippingCountry || "India",
      notes: address.notes || "",
      items: (address.items || []).map((item) => ({
        product_id: item.productId ?? item.id,
        quantity: item.quantity,
      })),
    }),
  });
}
