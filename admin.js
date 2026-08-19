const statusOptions = ["待付款", "已付款", "現場未收款", "已取消"];

const loginPanel = document.querySelector("#loginPanel");
const loginForm = document.querySelector("#loginForm");
const adminPassword = document.querySelector("#adminPassword");
const loginError = document.querySelector("#loginError");
const backendError = document.querySelector("#backendError");
const adminContent = document.querySelector("#adminContent");
const logoutAdmin = document.querySelector("#logoutAdmin");
const totalOrders = document.querySelector("#totalOrders");
const pendingOrders = document.querySelector("#pendingOrders");
const paidOrders = document.querySelector("#paidOrders");
const totalAmount = document.querySelector("#totalAmount");
const ordersBody = document.querySelector("#ordersBody");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const statusFilter = document.querySelector("#statusFilter");
const exportCsv = document.querySelector("#exportCsv");

function currency(value) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function setBackendError(message) {
  backendError.textContent = message;
  backendError.hidden = !message;
}

async function apiFetch(path, options = {}) {
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.headers || {})
      }
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await response.json().catch(() => null) : null;

    if (!isJson && path.startsWith("/api/")) {
      throw new Error("這個網址沒有連接營運後端，請改用 Render / Node.js 正式網址登入後台。");
    }

    return { response, body };
  } catch (error) {
    throw new Error(error.message || "目前連不到營運後端，請確認主機是否已部署完成。");
  }
}

async function requireLogin() {
  let result;
  try {
    const session = await apiFetch("/api/admin/session");
    result = session.body || { authenticated: false };
    setBackendError("");
  } catch (error) {
    loginPanel.hidden = false;
    adminContent.hidden = true;
    exportCsv.hidden = true;
    logoutAdmin.hidden = true;
    setBackendError(error.message);
    return;
  }

  if (!result.authenticated) {
    loginPanel.hidden = false;
    adminContent.hidden = true;
    exportCsv.hidden = true;
    logoutAdmin.hidden = true;
    return;
  }

  loginPanel.hidden = true;
  adminContent.hidden = false;
  exportCsv.hidden = false;
  logoutAdmin.hidden = false;
  await renderTable();
}

async function fetchOrders() {
  const { response, body } = await apiFetch("/api/orders");

  if (response.status === 401) {
    await requireLogin();
    return [];
  }

  if (!response.ok) {
    throw new Error(body?.error || "無法讀取後台資料");
  }

  return body || [];
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getFilteredOrders(orders) {
  const keyword = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  return orders.filter((order) => {
    const matchesStatus = status === "all" || order.paymentStatus === status;
    const haystack = [
      order.id,
      order.name,
      order.phone,
      order.floor,
      order.room,
      order.planName,
      order.paymentMethod,
      order.paymentStatus,
      order.note
    ].join(" ").toLowerCase();

    return matchesStatus && (!keyword || haystack.includes(keyword));
  });
}

function renderMetrics(orders) {
  totalOrders.textContent = String(orders.length);
  pendingOrders.textContent = String(orders.filter((order) => order.paymentStatus === "待付款" || order.paymentStatus === "現場未收款").length);
  paidOrders.textContent = String(orders.filter((order) => order.paymentStatus === "已付款").length);
  totalAmount.textContent = currency(orders.reduce((sum, order) => sum + Number(order.amount || 0), 0));
}

function statusSelect(order) {
  const options = statusOptions.map((status) => {
    const selected = status === order.paymentStatus ? "selected" : "";
    return `<option value="${escapeHtml(status)}" ${selected}>${escapeHtml(status)}</option>`;
  }).join("");

  return `<select data-order-id="${escapeHtml(order.id)}" aria-label="更新 ${escapeHtml(order.id)} 付款狀態">${options}</select>`;
}

async function renderTable() {
  try {
    const allOrders = await fetchOrders();
    const filteredOrders = getFilteredOrders(allOrders);
    renderMetrics(allOrders);
    emptyState.hidden = allOrders.length > 0;

    ordersBody.innerHTML = filteredOrders.map((order) => `
      <tr>
        <td>${escapeHtml(formatDate(order.createdAt))}</td>
        <td><strong>${escapeHtml(order.id)}</strong></td>
        <td>
          <div class="admin-name">${escapeHtml(order.name)}</div>
          <div class="admin-subtext">${escapeHtml(order.phone)}</div>
        </td>
        <td>${escapeHtml(order.floor)}<br>${escapeHtml(order.room)}</td>
        <td>${escapeHtml(order.planName)}</td>
        <td><strong>${currency(order.amount)}</strong></td>
        <td>${escapeHtml(order.paymentMethod)}</td>
        <td>${statusSelect(order)}</td>
        <td>${escapeHtml(order.note || "無")}</td>
      </tr>
    `).join("");
  } catch (error) {
    emptyState.hidden = false;
    emptyState.textContent = error.message;
  }
}

async function updatePaymentStatus(orderId, status) {
  const { response } = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ paymentStatus: status })
  });

  if (!response.ok) {
    await requireLogin();
    return;
  }

  await renderTable();
}

async function downloadCsv() {
  const response = await fetch("/api/orders.csv", { credentials: "same-origin" });

  if (!response.ok) {
    await requireLogin();
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `東泰照服登記資料-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

ordersBody.addEventListener("change", async (event) => {
  const select = event.target.closest("select[data-order-id]");
  if (!select) {
    return;
  }

  await updatePaymentStatus(select.dataset.orderId, select.value);
});

searchInput.addEventListener("input", renderTable);
statusFilter.addEventListener("change", renderTable);
exportCsv.addEventListener("click", downloadCsv);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let response;
  try {
    const result = await apiFetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: adminPassword.value })
    });
    response = result.response;
    setBackendError("");
  } catch (error) {
    loginError.hidden = true;
    setBackendError(error.message);
    return;
  }

  if (!response.ok) {
    loginError.hidden = false;
    setBackendError("");
    adminPassword.value = "";
    adminPassword.focus();
    return;
  }

  loginError.hidden = true;
  adminPassword.value = "";
  await requireLogin();
});

logoutAdmin.addEventListener("click", async () => {
  await apiFetch("/api/admin/logout", { method: "POST" }).catch(() => null);
  await requireLogin();
});

requireLogin();
