"use strict";

// Application constants and initial state
const keys = {
  products: "vegetify-products-v1",
  orders: "vegetify-orders-v1",
  cart: "vegetify-cart-v1",
  settings: "vegetify-settings-v1",
  users: "vegetify-users-v1",
  session: "vegetify-auth-session-v1",
};

const photos = [
  "https://images.unsplash.com/photo-1600618202813-ee7fca1fcc2b?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1641893720944-15c83082f2f5?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1576181456177-2b99ac0aa1ef?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1538826051293-02b4da7acc5f?auto=format&fit=crop&w=900&q=82",
];
const now = new Date().toISOString();
const defaultProducts = [
  ["001", "Kamatis", "Fruit", "Ripe local tomatoes, selected for freshness.", 50, 34, photos[0]],
  ["002", "Sili", "Herbs", "A colorful mix of crisp local peppers.", 550, 5, photos[1]],
  ["003", "Talong", "Fruit", "Freshly harvested market eggplant.", 45, 12, photos[2]],
  ["004", "Ampalaya", "Gourds", "Firm, fresh bitter melon.", 130, 0, photos[3]],
  ["005", "Pechay", "Leafy", "Tender leafy greens for everyday cooking.", 65, 8, photos[2]],
  ["006", "Carrots", "Root", "Sweet and crunchy market carrots.", 90, 27, photos[0]],
].map(([id, name, category, description, price, stock, imageUrl]) => ({
  id,
  name,
  category,
  description,
  price,
  stock,
  available: true,
  imageUrl,
  createdAt: now,
  updatedAt: now,
}));
const defaultSettings = {
  storeName: "Vegetify Supply Network",
  currency: "Philippine Peso (PHP)",
  lowStock: 10,
  orderAlerts: true,
  stockAlerts: true,
};
const pages = [
  "Dashboard",
  "Inventory",
  "Orders",
  "Customers",
  "Reports",
  "Settings",
  "Store Preview",
];
const categories = ["Fruit", "Herbs", "Gourds", "Leafy", "Root"];
const app = document.querySelector("#app");
const imageUrls = new Map();
const state = {
  session: readSession(),
  authView: location.hash === "#/register" ? "register" : "login",
  authMessage: "",
  page: "Dashboard",
  userPage: "Home",
  products: read(keys.products, defaultProducts),
  orders: read(keys.orders, []).filter(
    (order) =>
      !["V-8842", "V-8841", "V-8840", "V-8839", "V-8838"].includes(order.id),
  ),
  users: read(keys.users, []),
  cart: read(keys.cart, []),
  settings: read(keys.settings, defaultSettings),
  query: "",
  category: "All",
  statusFilter: "All",
  modal: null,
  mobileMenu: false,
  darkMode: read("vegetify-theme-v1", false),
};

// Browser storage and product image persistence
function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : structuredClone(fallback);
  } catch (error) {
    console.error(`Unable to read ${key} from browser storage.`, error);
    return structuredClone(fallback);
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Unable to save ${key} to browser storage.`, error);
    alert("Your browser could not save this change. Check available storage and try again.");
  }
}
function readSession() {
  try {
    const remembered = localStorage.getItem(keys.session);
    const temporary = sessionStorage.getItem(`${keys.session}-temporary`);
    return JSON.parse(remembered || temporary || "null");
  } catch (error) {
    console.error("Unable to restore the saved sign-in session.", error);
    return null;
  }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
function renderView(name, values = {}) {
  const template = document.getElementById(`view-${name}`);
  if (!template) throw new Error(`Missing HTML view template: ${name}`);
  return template.innerHTML.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}
function imageUrl(value) {
  const url = String(value || "");
  return /^(https:\/\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(url) ? url : "";
}
function money(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}
function productImage(product, extraClass = "") {
  const src = imageUrl(product.imageUrl);
  const name = escapeHtml(product.name);
  const initial = escapeHtml(product.name?.slice(0, 1) || "?");
  let content = renderView("image-fallback", { name: initial });
  if (product.imageId) {
    content = renderView("image-saved", {
      id: escapeHtml(product.imageId),
      name,
      fallback: escapeHtml(src),
      initial,
    });
  } else if (src) {
    content = renderView("image-remote", { src: escapeHtml(src), name });
  }
  return renderView("product-image", { className: extraClass, content });
}
function openImageDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("vegetify-images", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("images")) request.result.createObjectStore("images");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open product image storage."));
  });
}
async function saveImage(id, blob) {
  const database = await openImageDatabase();
  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction("images", "readwrite").objectStore("images").put(blob, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Could not save product image."));
    });
  } finally {
    database.close();
  }
}
async function loadImage(id) {
  const database = await openImageDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction("images").objectStore("images").get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not load product image."));
    });
  } finally {
    database.close();
  }
}
async function deleteImage(id) {
  if (!id) return;
  const database = await openImageDatabase();
  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction("images", "readwrite").objectStore("images").delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Could not delete product image."));
    });
  } finally {
    database.close();
  }
  const url = imageUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  imageUrls.delete(id);
}
async function hydrateProductImages() {
  const placeholders = app.querySelectorAll("[data-image-id]");
  for (const placeholder of placeholders) {
    const id = placeholder.dataset.imageId;
    try {
      let url = imageUrls.get(id);
      if (!url) {
        const blob = await loadImage(id);
        if (blob) {
          url = URL.createObjectURL(blob);
          imageUrls.set(id, url);
        } else {
          url = placeholder.dataset.imageFallback;
        }
      }
      if (!placeholder.isConnected) continue;
      if (!url) continue;
      const image = new Image();
      image.src = url;
      image.alt = placeholder.dataset.imageName || "";
      placeholder.replaceWith(image);
    } catch (error) {
      console.error(`Unable to load product image ${id}.`, error);
      const fallback = placeholder.dataset.imageFallback;
      if (fallback && placeholder.isConnected) {
        const image = new Image();
        image.src = fallback;
        image.alt = placeholder.dataset.imageName || "";
        placeholder.replaceWith(image);
      }
    }
  }
}

// Authentication and navigation
function saveSession(session, remember) {
  localStorage.removeItem(keys.session);
  sessionStorage.removeItem(`${keys.session}-temporary`);
  (remember ? localStorage : sessionStorage).setItem(
    remember ? keys.session : `${keys.session}-temporary`,
    JSON.stringify(session),
  );
  state.session = session;
  state.authMessage = "";
  state.page = "Dashboard";
  state.userPage = "Home";
  updateHash();
  render();
}
function logout() {
  localStorage.removeItem(keys.session);
  sessionStorage.removeItem(`${keys.session}-temporary`);
  localStorage.removeItem("vegetify-session");
  sessionStorage.removeItem("vegetify-session");
  state.session = null;
  state.authView = "login";
  state.authMessage = "";
  updateHash();
  render();
}
function updateHash() {
  const target = !state.session
    ? `#/${state.authView}`
    : state.session.role === "user" ? "#/user" : "#/admin";
  if (location.hash !== target) history.replaceState(null, "", target);
}

// Shared HTML rendering helpers
function header(eyebrow, title, subtitle, action = "") {
  return renderView("header", {
    eyebrow: escapeHtml(eyebrow),
    title: escapeHtml(title),
    subtitle: escapeHtml(subtitle),
    action,
  });
}

// Page and modal rendering
function statusBadge(status) {
  return renderView("status", {
    className: escapeHtml(String(status).toLowerCase()),
    status: escapeHtml(status),
  });
}
function stockBadge(product) {
  const out = !product.available || Number(product.stock) === 0;
  const low = !out && Number(product.stock) <= Number(state.settings.lowStock);
  return renderView("stock", {
    className: out ? "out" : low ? "low" : "",
    label: out ? "Out of stock" : low ? "Low stock" : "In stock",
  });
}
function orderItems(order) {
  return (order.items || []).map((item) => `${escapeHtml(item.name)} (${Number(item.quantity)} kg)`).join(", ");
}
function stat(label, value, note, icon = "") {
  return renderView("stat", {
    label: escapeHtml(label),
    value: escapeHtml(value),
    note: escapeHtml(note),
    icon: icon ? renderView("stat-icon", { icon }) : "",
  });
}
function render() {
  if (!state.session) {
    app.innerHTML = state.authView === "register" ? renderRegister() : renderLogin();
    void hydrateProductImages();
    return;
  }
  if (state.session.role === "user") {
    app.innerHTML = renderUserArea();
    void hydrateProductImages();
    return;
  }
  app.innerHTML = renderAdmin();
  void hydrateProductImages();
}

function renderLogin() {
  return renderView("login", {
    brand: renderView("brand"),
    message: state.authMessage ? renderView("form-success", { message: escapeHtml(state.authMessage) }) : "",
    passwordToggle: renderView("password-toggle"),
  });
}
function renderRegister() {
  return renderView("register", {
    brand: renderView("brand"),
    passwordToggle: renderView("password-toggle"),
  });
}

function renderAdmin() {
  const icons = ["▦", "▤", "▣", "♧", "▥", "⚙", "🛒"];
  const nav = pages.map((page, index) => renderView("admin-nav", {
    activeClass: state.page === page ? "active" : "",
    page: escapeHtml(page),
    icon: icons[index],
  })).join("");
  return renderView("admin-shell", {
    brand: renderView("brand"),
    openClass: state.mobileMenu ? "open" : "",
    nav,
    content: renderAdminPage(),
    modal: renderModal(),
  });
}
function renderAdminPage() {
  switch (state.page) {
    case "Inventory":
      return renderInventory();
    case "Orders":
      return renderOrders();
    case "Customers":
      return renderCustomers();
    case "Reports":
      return renderReports();
    case "Settings":
      return renderSettings();
    case "Store Preview":
      return renderStore(true);
    default:
      return renderDashboard();
  }
}
function renderDashboard() {
  const low = state.products.filter(
    (product) => product.stock > 0 && product.stock <= state.settings.lowStock,
  ).length;
  const pending = state.orders.filter((order) =>
    ["Pending", "Processing"].includes(order.status),
  ).length;
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = state.orders
    .filter((order) => order.date === today && order.status !== "Cancelled")
    .reduce((sum, order) => sum + Number(order.total), 0);
  const recent = state.orders.slice(0, 4).map((order) => renderView("dashboard-row", {
    id: escapeHtml(order.id),
    customer: escapeHtml(order.customer),
    items: orderItems(order),
    total: money(order.total),
    status: statusBadge(order.status),
  })).join("") || renderView("empty", { message: "No customer orders have been placed yet." });
  const stats = [
    stat("Today's Sales", money(todaySales), "Completed customer checkouts", "↗"),
    stat("Pending Orders", pending, "Needs fulfilment", "♧"),
    stat("Low Stock Items", low, "Requires restock", "⚠"),
    stat("Registered Customers", state.users.length, "Created user accounts", "♧"),
  ].join("");
  const pageHeader = header(
    "OPERATIONS OVERVIEW",
    "Admin Control Panel",
    "Monitor sales, fulfilment, and inventory health.",
    renderView("notification-button"),
  );
  const dashboard = renderView("dashboard", { stats, recent, low });
  return pageHeader + dashboard;
}
function renderInventory() {
  const products = state.products.filter((product) => {
    const matchesCategory =
      state.category === "All" || product.category === state.category;
    const matchesQuery = product.name
      .toLowerCase()
      .includes(state.query.toLowerCase());
    return matchesCategory && matchesQuery;
  });
  const rows = products.map((product) => renderView("inventory-row", {
    image: productImage(product),
    name: escapeHtml(product.name),
    shortId: escapeHtml(product.id.slice(0, 6)),
    category: escapeHtml(product.category),
    price: money(product.price),
    stockClass: !product.available || !product.stock
      ? "danger"
      : product.stock <= state.settings.lowStock
        ? "warning"
        : "",
    stock: Number(product.stock),
    status: stockBadge(product),
    id: escapeHtml(product.id),
  })).join("");
  const categoryOptions = ["All", ...categories].map((category) => renderView("option", {
    selected: state.category === category ? "selected" : "",
    label: escapeHtml(category),
  })).join("");
  const pageHeader = header(
    "CATALOGUE MANAGEMENT",
    "Inventory",
    "Manage pricing, availability, and stock in one place.",
    renderView("add-product-button"),
  );
  const inventory = renderView("inventory", {
    query: escapeHtml(state.query),
    categories: categoryOptions,
    rows,
    empty: products.length ? "" : renderView("empty", { message: "No products match your search." }),
  });
  return pageHeader + inventory;
}
function renderOrders() {
  const shown = state.orders.filter((order) => {
    const matchesStatus =
      state.statusFilter === "All" || order.status === state.statusFilter;
    const searchableText = `${order.id} ${order.customer}`.toLowerCase();
    const matchesQuery = searchableText.includes(state.query.toLowerCase());
    return matchesStatus && matchesQuery;
  });
  const rows = shown.map((order) => renderView("order-row", {
    id: escapeHtml(order.id),
    customer: escapeHtml(order.customer),
    registered: order.customerId ? renderView("registered-customer") : "",
    items: orderItems(order),
    date: escapeHtml(order.date),
    total: money(order.total),
    payment: escapeHtml(order.paymentMethod || "Cash on Delivery"),
    statuses: ["Pending", "Processing", "Delivered", "Cancelled"].map((status) => renderView("option", {
      selected: order.status === status ? "selected" : "",
      label: status,
    })).join(""),
  })).join("");
  const statuses = ["All", "Pending", "Processing", "Delivered", "Cancelled"].map((status) => renderView("option", {
    selected: state.statusFilter === status ? "selected" : "",
    label: status,
  })).join("");
  const pageHeader = header(
    "FULFILMENT",
    "Orders",
    "Track purchases and keep customers informed.",
  );
  const ordersTable = renderView("orders", {
    query: escapeHtml(state.query),
    statuses,
    rows,
    empty: shown.length ? "" : renderView("empty", { message: "No orders match your search." }),
  });
  return pageHeader + ordersTable;
}
function renderCustomers() {
  const shown = state.users.filter((user) => `${user.fullName} ${user.username} ${user.email}`.toLowerCase().includes(state.query.toLowerCase()));
  const rows = shown.map((user) => {
    const orders = userOrders(user);
    return renderView("customer-row", {
      initials: escapeHtml(initials(user.fullName)),
      name: escapeHtml(user.fullName),
      username: escapeHtml(user.username),
      email: escapeHtml(user.email),
      orders: orders.length,
      spend: money(orders.reduce((sum, order) => sum + (order.status === "Cancelled" ? 0 : order.total), 0)),
      id: escapeHtml(user.id),
    });
  }).join("");
  return `${header("RELATIONSHIPS", "Customers", "Review customer activity and contact information.")}${renderView("customers", {
    query: escapeHtml(state.query),
    rows,
    empty: shown.length ? "" : renderView("empty", { message: "No registered customers match your search." }),
  })}`;
}
function userOrders(user) {
  return state.orders.filter((order) => order.customerId === user.id || (!order.customerId && order.customer.toLowerCase() === user.fullName.toLowerCase()));
}
function initials(name) {
  return String(name || "").split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}
function renderReports() {
  const active = state.orders.filter((order) => order.status !== "Cancelled");
  const gross = active.reduce((sum, order) => sum + Number(order.total), 0);
  const units = active.flatMap((order) => order.items || []).reduce((sum, item) => sum + Number(item.quantity), 0);
  const sales = new Map();
  active.flatMap((order) => order.items || []).forEach((item) => {
    const current = sales.get(item.productId) || { name: item.name, kilograms: 0, revenue: 0 };
    current.kilograms += Number(item.quantity);
    current.revenue += Number(item.price) * Number(item.quantity);
    sales.set(item.productId, current);
  });
  const top = [...sales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const lastWeek = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const total = active
      .filter((order) => order.date === key)
      .reduce((sum, order) => sum + Number(order.total), 0);

    return {
      key,
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      total,
    };
  });
  const highest = Math.max(...lastWeek.map((day) => day.total), 0);
  const stats = [
    stat("Gross Sales", money(gross), "Excludes cancelled orders"),
    stat("Orders", state.orders.length, "Actual customer checkouts"),
    stat("Average Order", money(active.length ? gross / active.length : 0), "Across active orders"),
    stat("Kilograms Sold", units, "Excludes cancelled orders"),
  ].join("");
  const bars = lastWeek.map((day) => renderView("report-bar", {
    title: money(day.total),
    style: `height:${day.total && highest ? Math.max(8, day.total / highest * 100) : 0}%`,
    label: day.label,
  })).join("");
  const products = top.map((item, index) => renderView("report-product", {
    rank: index + 1,
    name: escapeHtml(item.name),
    sales: `${item.kilograms} kg · ${money(item.revenue)}`,
  })).join("") || renderView("empty", { message: "No product sales yet." });
  return `${header("LIVE ANALYTICS", "Reports", "Performance figures calculated from actual customer orders.")}${renderView("reports", { stats, bars, products })}`;
}
function renderSettings() {
  return `${header("PREFERENCES", "Settings", "Configure the admin portal and save choices on this browser.")}${renderView("settings", {
    storeName: escapeHtml(state.settings.storeName),
    lowStock: Number(state.settings.lowStock),
    orderAlerts: state.settings.orderAlerts ? "checked" : "",
    stockAlerts: state.settings.stockAlerts ? "checked" : "",
  })}`;
}

function renderStore(adminPreview) {
  const visible = state.products.filter((product) => {
    const matchesCategory =
      state.category === "All" || product.category === state.category;
    const matchesQuery = product.name
      .toLowerCase()
      .includes(state.query.toLowerCase());
    return product.available && matchesCategory && matchesQuery;
  });
  const storeCategories = ["All", ...new Set(state.products.map((product) => product.category))];
  const cartCount = state.cart.reduce((sum, item) => sum + Number(item.quantity), 0);
  const action = renderView("store-search", {
    query: escapeHtml(state.query),
    cartCount,
  });
  const categoryButtons = storeCategories.map((category) => renderView("store-category", {
    activeClass: state.category === category ? "active" : "",
    category: escapeHtml(category),
  })).join("");
  const productCards = visible.map((product) => {
    const cartItem = state.cart.find((item) => item.productId === product.id);
    const remaining = Math.max(0, product.stock - (cartItem?.quantity || 0));
    return renderView("product-card", {
      soldClass: remaining ? "" : "sold-image",
      image: productImage(product),
      soldLabel: remaining ? "" : renderView("sold-label"),
      name: escapeHtml(product.name),
      description: escapeHtml(product.description),
      price: money(product.price),
      stockClass: remaining ? "" : "out",
      remaining,
      id: escapeHtml(product.id),
      disabled: remaining ? "" : "disabled",
    });
  }).join("");
  const content = renderView("store", {
    preview: adminPreview ? renderView("preview-note") : "",
    categories: categoryButtons,
    products: productCards,
    empty: visible.length ? "" : renderView("empty", { message: "No products are available for this search." }),
  });
  return header(
    adminPreview ? "CUSTOMER-FACING PREVIEW" : "FRESH MARKET",
    state.settings.storeName,
    adminPreview
      ? "Preview the shopper catalogue without mixing it into admin operations."
      : "Fresh local vegetables, ready for your next meal.",
    action,
  ) + content;
}

function renderUserArea() {
  const user = state.session;
  const navIcons = { Home: "⌂", Orders: "▣", Shop: "🛒" };
  const nav = ["Home", "Orders", "Shop"].map((page) => renderView("user-nav", {
    activeClass: state.userPage === page ? "active" : "",
    page,
    icon: navIcons[page],
  })).join("");
  let content = "";
  if (state.userPage === "Shop") {
    content = renderStore(false);
  } else if (state.userPage === "Orders") {
    const pageHeader = header(
      "ORDER HISTORY",
      "My Orders",
      "See what you ordered, the kilograms purchased, totals, and fulfilment status.",
      renderView("shop-again-button"),
    );
    content = pageHeader + renderUserOrderList(user);
  } else {
    const orders = userOrders({ id: user.id, fullName: user.fullName });
    const spend = orders.filter((order) => order.status !== "Cancelled").reduce((sum, order) => sum + Number(order.total), 0);
    content = renderView("user-home", {
      name: escapeHtml(user.fullName),
      stats: [
        stat("Your Orders", orders.length, "Placed with Vegetify", "▣"),
        stat("Total Spent", money(spend), "Excludes cancelled orders", "₱"),
      ].join(""),
      viewAll: orders.length ? renderView("user-view-all") : "",
      orders: renderUserOrderList(user, true),
    });
  }
  return renderView("user-shell", {
    darkClass: state.darkMode ? "dark" : "",
    openClass: state.mobileMenu ? "open" : "",
    brand: renderView("brand"),
    nav,
    initials: escapeHtml(initials(user.fullName)),
    name: escapeHtml(user.fullName),
    themeIcon: state.darkMode ? "☀" : "☾",
    themeLabel: state.darkMode ? "Light mode" : "Dark mode",
    content,
    modal: renderModal(),
  });
}
function renderUserOrderList(user, compact = false) {
  const orders = userOrders({ id: user.id, fullName: user.fullName });
  if (!orders.length) return renderView("user-order-empty");
  const orderCards = (compact ? orders.slice(0, 3) : orders).map((order) => renderView("user-order", {
    id: escapeHtml(order.id),
    date: escapeHtml(order.date),
    status: statusBadge(order.status),
    items: (order.items || []).map((item) => renderView("user-order-item", {
      name: escapeHtml(item.name),
      price: money(item.price),
      quantity: Number(item.quantity),
      total: money(item.price * item.quantity),
    })).join(""),
    payment: escapeHtml(order.paymentMethod || "Cash on Delivery"),
    total: money(order.total),
  })).join("");
  return renderView("user-order-list", { orders: orderCards });
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal.type === "product") return renderProductModal(state.modal.product);
  if (state.modal.type === "cart") return renderCartModal();
  if (state.modal.type === "receipt") {
    const order = state.orders.find((item) => item.id === state.modal.id);
    if (!order) return "";
    const items = (order.items || []).map((item) => renderView("receipt-item", {
      name: escapeHtml(item.name),
      quantity: Number(item.quantity),
      price: money(item.price),
      total: money(item.quantity * item.price),
    })).join("");
    return renderView("receipt", {
      id: escapeHtml(order.id),
      status: statusBadge(order.status),
      customer: escapeHtml(order.customer),
      date: escapeHtml(order.date),
      payment: escapeHtml(order.paymentMethod || "Cash on Delivery"),
      items,
      total: money(order.total),
    });
  }
  if (state.modal.type === "detail") {
    const product = state.products.find((item) => item.id === state.modal.id);
    return product ? renderView("detail", {
      image: productImage(product),
      category: escapeHtml(product.category),
      name: escapeHtml(product.name),
      price: money(product.price),
      description: escapeHtml(product.description),
      stock: Number(product.stock),
      id: escapeHtml(product.id),
    }) : "";
  }
  if (state.modal.type === "customer") {
    const user = state.users.find((item) => item.id === state.modal.id);
    if (!user) return "";
    const orders = userOrders(user);
    const orderRows = orders.map((order) => renderView("customer-order", {
      id: escapeHtml(order.id),
      date: escapeHtml(order.date),
      status: statusBadge(order.status),
      total: money(order.total),
    })).join("") || renderView("no-orders");
    return renderView("customer-detail", {
      initials: escapeHtml(initials(user.fullName)),
      name: escapeHtml(user.fullName),
      username: escapeHtml(user.username),
      email: escapeHtml(user.email),
      count: orders.length,
      orders: orderRows,
    });
  }
  return "";
}
function renderProductModal(product) {
  const fresh = product || { id: "", name: "", category: "Fruit", description: "", price: "", stock: "", available: true, imageUrl: "" };
  const categoryOptions = categories.map((category) => renderView("option", {
    selected: fresh.category === category ? "selected" : "",
    label: escapeHtml(category),
  })).join("");
  return renderView("product-modal", {
    id: escapeHtml(fresh.id),
    title: product ? "Edit product" : "Add product",
    name: escapeHtml(fresh.name),
    categories: categoryOptions,
    price: escapeHtml(fresh.price),
    stock: escapeHtml(fresh.stock),
    description: escapeHtml(fresh.description),
    image: productImage(fresh),
    available: fresh.available ? "checked" : "",
  });
}
function renderCartModal() {
  const rows = state.cart.map((item) => {
    const product = state.products.find((entry) => entry.id === item.productId);
    return product ? renderView("cart-item", {
      image: productImage(product),
      name: escapeHtml(product.name),
      price: money(product.price),
      id: escapeHtml(product.id),
      quantity: Number(item.quantity),
      disabled: item.quantity >= product.stock ? "disabled" : "",
    }) : "";
  }).join("");
  const total = state.cart.reduce((sum, item) => {
    const product = state.products.find((entry) => entry.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
  const customerName = state.session?.role === "user" ? state.session.fullName : "";
  return renderView("cart", {
    items: rows || renderView("cart-empty"),
    total: money(total),
    customerName: escapeHtml(customerName),
    readOnly: customerName ? "readonly" : "",
    accountNote: customerName ? renderView("account-note") : "",
    disabled: state.cart.length ? "" : "disabled",
  });
}

// Form utilities and cart operations
function renderProductError(form, message) {
  const error = form.querySelector("[data-error]");
  if (error) error.textContent = message;
}
function bytesToBase64(bytes) {
  let value = "";
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value);
}
function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
async function passwordHash(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, material, 256);
  return bytesToBase64(new Uint8Array(bits));
}
function showFormError(form, message) {
  const error = form.querySelector("[data-error]");
  if (error) error.textContent = message;
}
function setFilter(field, value) {
  if (field === "query") state.query = value;
  if (field === "category") state.category = value;
  if (field === "status") state.statusFilter = value;
  render();
  const input = app.querySelector(`[data-filter="${field}"]`);
  if (input) {
    input.focus();
    if (input.setSelectionRange) input.setSelectionRange(value.length, value.length);
  }
}
function persistCart() {
  state.cart = state.cart.filter((item) => state.products.some((product) => product.id === item.productId));
  save(keys.cart, state.cart);
}
function addToCart(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product || !product.available || product.stock < 1) return;
  const existing = state.cart.find((item) => item.productId === id);
  if (existing && existing.quantity >= product.stock) {
    alert("There is no more stock available for this product.");
    return;
  }
  if (existing) existing.quantity += 1;
  else state.cart.push({ productId: id, quantity: 1 });
  persistCart();
  state.modal = state.modal?.type === "cart" ? { type: "cart" } : null;
  render();
}
function checkout(name, paymentMethod) {
  const items = state.cart.map((entry) => {
    const product = state.products.find((item) => item.id === entry.productId);
    if (!product) return null;

    return {
      productId: product.id,
      name: product.name,
      quantity: entry.quantity,
      price: product.price,
    };
  }).filter(Boolean);

  const hasInvalidItem = items.some((item) => {
    const product = state.products.find((entry) => entry.id === item.productId);
    return (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      !product?.available ||
      item.quantity > (product.stock || 0)
    );
  });
  if (!items.length || hasInvalidItem) {
    alert("One or more products are unavailable. Update your cart before checkout.");
    return;
  }
  if (!name.trim()) {
    alert("Enter your name to place the order.");
    return;
  }
  const order = {
    id: `V-${Math.floor(9000 + Math.random() * 999)}`,
    customer: name.trim(),
    ...(state.session?.role === "user" ? { customerId: state.session.id } : {}),
    items,
    date: new Date().toISOString().slice(0, 10),
    total: items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    ),
    status: "Pending",
    paymentMethod,
  };
  state.products = state.products.map((product) => {
    const item = items.find((entry) => entry.productId === product.id);
    return item
      ? {
          ...product,
          stock: product.stock - item.quantity,
          updatedAt: new Date().toISOString(),
        }
      : product;
  });
  state.orders.unshift(order);
  state.cart = [];
  save(keys.products, state.products);
  save(keys.orders, state.orders);
  save(keys.cart, state.cart);
  state.modal = null;
  render();
  alert(`Order #${order.id} was placed successfully.`);
}

// Form submission handlers
async function handleLogin(form, data) {
  const loginId = String(data.get("identifier") || "").trim().toLowerCase();
  const password = String(data.get("password") || "");

  if (loginId === "admin") {
    if (password !== "Admin123!") {
      showFormError(form, "The administrator password is incorrect.");
      return;
    }

    saveSession(
      { role: "admin", id: "admin", fullName: "Mang Kanor", username: "admin" },
      data.has("remember"),
    );
    return;
  }

  const user = state.users.find(
    (item) =>
      item.username.toLowerCase() === loginId ||
      item.email.toLowerCase() === loginId,
  );
  if (!user) {
    showFormError(form, "No account matches those login details.");
    return;
  }

  try {
    const salt = base64ToBytes(user.passwordSalt);
    const verifiedPassword = await passwordHash(password, salt);
    if (verifiedPassword !== user.passwordHash) {
      showFormError(form, "No account matches those login details.");
      return;
    }

    saveSession(
      {
        role: "user",
        id: user.id,
        fullName: user.fullName,
        username: user.username,
      },
      data.has("remember"),
    );
  } catch (error) {
    console.error("Unable to verify the customer password.", error);
    showFormError(form, "Unable to sign in right now. Please try again.");
  }
}

async function handleRegistration(form, data) {
  const fullName = String(data.get("fullName") || "").trim();
  const username = String(data.get("username") || "").trim();
  const email = String(data.get("email") || "").trim().toLowerCase();
  const password = String(data.get("password") || "");

  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
    showFormError(
      form,
      "Username must be 3–24 characters using letters, numbers, dots, dashes, or underscores.",
    );
    return;
  }
  if (username.toLowerCase() === "admin") {
    showFormError(form, "That username is reserved. Please choose another.");
    return;
  }
  if (password.length < 8) {
    showFormError(form, "Password must contain at least 8 characters.");
    return;
  }
  if (password !== data.get("confirmPassword")) {
    showFormError(form, "The passwords do not match.");
    return;
  }
  if (
    state.users.some(
      (user) => user.username.toLowerCase() === username.toLowerCase(),
    )
  ) {
    showFormError(form, "That username is already registered.");
    return;
  }
  if (state.users.some((user) => user.email.toLowerCase() === email)) {
    showFormError(form, "That email address is already registered.");
    return;
  }

  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const user = {
      id: crypto.randomUUID(),
      fullName,
      username,
      email,
      passwordHash: await passwordHash(password, salt),
      passwordSalt: bytesToBase64(salt),
      role: "user",
      createdAt: new Date().toISOString(),
    };

    state.users.push(user);
    save(keys.users, state.users);
    state.authView = "login";
    state.authMessage = "Account created successfully. You can now log in.";
    updateHash();
    render();
  } catch (error) {
    console.error("Unable to create the customer account.", error);
    showFormError(form, "Unable to create your account right now. Please try again.");
  }
}

async function handleProductSubmit(form, data) {
  const product = state.products.find((item) => item.id === form.dataset.id);
  const file = data.get("image");
  const nextProduct = {
    ...(product || {}),
    id: product?.id || crypto.randomUUID(),
    name: String(data.get("name") || "").trim(),
    category: data.get("category"),
    description: String(data.get("description") || "").trim(),
    price: Number(data.get("price")),
    stock: Number(data.get("stock")),
    available: data.has("available"),
    imageUrl: product?.imageUrl || "",
    createdAt: product?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const hasValidDetails =
    nextProduct.name &&
    Number.isFinite(nextProduct.price) &&
    nextProduct.price >= 0 &&
    Number.isInteger(nextProduct.stock) &&
    nextProduct.stock >= 0;
  if (!hasValidDetails) {
    showFormError(
      form,
      "Enter a name and valid non-negative price and stock.",
    );
    return;
  }

  let replacedImageId = "";
  if (file instanceof File && file.size) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showFormError(form, "Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showFormError(form, "The image must be 5 MB or smaller.");
      return;
    }

    const imageId = `product-${nextProduct.id}-${Date.now()}`;
    try {
      await saveImage(imageId, file);
      nextProduct.imageId = imageId;
      replacedImageId = product?.imageId || "";
    } catch (error) {
      console.error("Unable to save the selected product image.", error);
      showFormError(form, "Unable to save this image. Please choose another file.");
      return;
    }
  }

  state.products = product
    ? state.products.map((item) => (item.id === product.id ? nextProduct : item))
    : [nextProduct, ...state.products];
  save(keys.products, state.products);

  if (replacedImageId) {
    try {
      await deleteImage(replacedImageId);
    } catch (error) {
      console.error("Unable to remove the replaced product image.", error);
      alert(
        "The product was saved, but its previous image could not be removed from browser storage.",
      );
    }
  }

  state.modal = null;
  render();
}

function handleSettingsSubmit(data) {
  state.settings = {
    ...state.settings,
    storeName: String(data.get("storeName")).trim(),
    currency: data.get("currency"),
    lowStock: Math.max(1, Number(data.get("lowStock"))),
  };
  save(keys.settings, state.settings);
  render();
  alert("Preferences saved.");
}

async function handleFormSubmit(event) {
  const form = event.target;
  if (!form.matches("form[data-form]")) return;

  event.preventDefault();
  const data = new FormData(form);

  switch (form.dataset.form) {
    case "login":
      await handleLogin(form, data);
      break;
    case "register":
      await handleRegistration(form, data);
      break;
    case "product":
      await handleProductSubmit(form, data);
      break;
    case "settings":
      handleSettingsSubmit(data);
      break;
  }
}

// Delegated event handlers
app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-filter]")) setFilter(target.dataset.filter, target.value);
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-order-status]")) {
    const order = state.orders.find((item) => item.id === target.dataset.orderStatus);
    if (order) {
      order.status = target.value;
      save(keys.orders, state.orders);
    }
  }
  if (target.matches("[data-setting]")) {
    state.settings[target.dataset.setting] = target.checked;
    save(keys.settings, state.settings);
  }
  if (target.matches('input[name="payment-method"]')) {
    app.querySelectorAll(".payment-options label").forEach((label) => label.classList.toggle("selected", label.contains(target)));
  }
  if (target.matches('input[name="image"]')) {
    const file = target.files?.[0];
    if (file) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        target.value = "";
        alert("Choose a JPG, PNG, or WEBP image.");
      } else if (file.size > 5 * 1024 * 1024) {
        target.value = "";
        alert("The image must be 5 MB or smaller.");
      }
    }
  }
});

app.addEventListener("submit", handleFormSubmit);

async function handleClick(event) {
  const button = event.target.closest("[data-action], [data-page], [data-user-page], [data-category]");
  if (!button) return;

  if (button.dataset.page) {
    state.page = button.dataset.page;
    state.query = "";
    state.category = "All";
    state.statusFilter = "All";
    state.mobileMenu = false;
    render();
    return;
  }

  if (button.dataset.userPage) {
    state.userPage = button.dataset.userPage;
    state.query = "";
    state.category = "All";
    state.mobileMenu = false;
    render();
    return;
  }

  if (button.dataset.category) {
    state.category = button.dataset.category;
    render();
    return;
  }

  switch (button.dataset.action) {
    case "register":
      state.authView = "register";
      state.authMessage = "";
      updateHash();
      render();
      break;
    case "login":
      state.authView = "login";
      updateHash();
      render();
      break;
    case "logout":
      logout();
      break;
    case "menu":
      state.mobileMenu = !state.mobileMenu;
      render();
      break;
    case "add-product":
      state.modal = { type: "product" };
      render();
      break;
    case "edit-product":
      state.modal = {
        type: "product",
        product: state.products.find((item) => item.id === button.dataset.id),
      };
      render();
      break;
    case "delete-product": {
      const product = state.products.find((item) => item.id === button.dataset.id);
      if (!product || !confirm(`Delete ${product.name}? Historical order details will be preserved.`)) {
        break;
      }

      state.products = state.products.filter((item) => item.id !== product.id);
      state.cart = state.cart.filter((item) => item.productId !== product.id);
      save(keys.products, state.products);
      persistCart();

      try {
        await deleteImage(product.imageId);
      } catch (error) {
        console.error("Unable to remove the deleted product image.", error);
        alert("The product was deleted, but its image could not be removed from browser storage.");
      }
      render();
      break;
    }
    case "customer-details":
      state.modal = { type: "customer", id: button.dataset.id };
      render();
      break;
    case "receipt":
      state.modal = { type: "receipt", id: button.dataset.id };
      render();
      break;
    case "print-receipt":
      window.print();
      break;
    case "toggle-theme":
      state.darkMode = !state.darkMode;
      save("vegetify-theme-v1", state.darkMode);
      render();
      break;
    case "cart":
      state.modal = { type: "cart" };
      render();
      break;
    case "close-modal":
      state.modal = null;
      render();
      break;
    case "close-overlay":
      if (event.target === button) {
        state.modal = null;
        render();
      }
      break;
    case "add-cart":
      addToCart(button.dataset.id);
      break;
    case "product-detail":
      state.modal = { type: "detail", id: button.dataset.id };
      render();
      break;
    case "quantity":
      updateCartQuantity(button.dataset.id, Number(button.dataset.amount));
      break;
    case "checkout": {
      const name = app.querySelector('[name="checkout-name"]')?.value || "";
      const payment =
        app.querySelector('[name="payment-method"]:checked')?.value ||
        "Cash on Delivery";
      checkout(name, payment);
      break;
    }
    case "toggle-password":
      togglePasswordVisibility(button);
      break;
    case "notifications":
      showOrderNotifications();
      break;
  }
}

function updateCartQuantity(productId, amount) {
  const product = state.products.find((item) => item.id === productId);
  const cartItem = state.cart.find((item) => item.productId === productId);
  if (!product || !cartItem) return;

  cartItem.quantity += amount;
  if (cartItem.quantity <= 0) {
    state.cart = state.cart.filter((item) => item.productId !== product.id);
  } else {
    cartItem.quantity = Math.min(cartItem.quantity, product.stock);
  }

  persistCart();
  state.modal = { type: "cart" };
  render();
}

function togglePasswordVisibility(button) {
  const input = button.parentElement.querySelector("input");
  if (!input) return;

  input.type = input.type === "password" ? "text" : "password";
  const isVisible = input.type === "text";
  button.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
  button.setAttribute("aria-pressed", String(isVisible));
}

function showOrderNotifications() {
  const pendingOrders = state.orders.filter((order) => order.status === "Pending");
  const message = pendingOrders.length
    ? `${pendingOrders.length} order${pendingOrders.length === 1 ? "" : "s"} need attention.`
    : "You have no pending orders.";
  alert(message);
}

app.addEventListener("click", handleClick);

window.addEventListener("storage", (event) => {
  if (!event.key) return;
  if (event.key === keys.products) state.products = read(keys.products, defaultProducts);
  if (event.key === keys.orders) state.orders = read(keys.orders, []);
  if (event.key === keys.users) state.users = read(keys.users, []);
  if (event.key === keys.settings) state.settings = read(keys.settings, defaultSettings);
  if (event.key === keys.cart) state.cart = read(keys.cart, []);
  render();
});

updateHash();
render();
