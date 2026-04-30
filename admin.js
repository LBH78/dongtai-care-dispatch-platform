const ordersKey = "dongtai-care-orders";
const statusOptions = ["待付款", "已付款", "現場未收款", "已取消"];

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

function readLocalOrders() {
  try {
    return JSON.parse(localStorage.getItem(ordersKey)) || [];
  } catch {
    return [];
  }
}

function writeLocalOrders(orders) {
  localStorage.setItem(ordersKey, JSON.stringify(orders));
}

async function fetchOrders() {
  if (window.location.protocol.startsWith("http")) {
    const response = await fetch("/api/orders");
    if (response.ok) {
      return response.json();
    }
  }

  return readLocalOrders();
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
}

async function updatePaymentStatus(orderId, status) {
  if (window.location.protocol.startsWith("http")) {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ paymentStatus: status })
    });

    if (response.ok) {
      await renderTable();
      return;
    }
  }

  const orders = readLocalOrders().map((order) => {
    if (order.id !== orderId) {
      return order;
    }

    return {
      ...order,
      paymentStatus: status,
      updatedAt: new Date().toISOString()
    };
  });

  writeLocalOrders(orders);
  await renderTable();
}

function csvCell(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

async function downloadCsv() {
  const orders = getFilteredOrders(await fetchOrders());
  const rows = [
    ["時間", "受理編號", "姓名", "電話", "樓層", "病房號碼", "照護方案", "金額", "付款方式", "付款狀態", "備註"],
    ...orders.map((order) => [
      formatDate(order.createdAt),
      order.id,
      order.name,
      order.phone,
      order.floor,
      order.room,
      order.planName,
      order.amount,
      order.paymentMethod,
      order.paymentStatus,
      order.note
    ])
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
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

renderTable();
