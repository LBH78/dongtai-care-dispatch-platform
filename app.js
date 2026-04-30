const plans = {
  shared24: {
    name: "一對六照顧 24 小時",
    price: 1100
  },
  shared12: {
    name: "一對六照顧 12 小時",
    price: 700
  },
  private24: {
    name: "一對一專人照顧 24 小時",
    price: 2800
  },
  private12: {
    name: "一對一專人照顧 12 小時",
    price: 1800
  }
};

const paymentNotes = {
  "ATM": "ATM 轉帳資料會於送出後顯示，請保留末五碼方便對帳。",
  "信用卡": "送出後會建立信用卡付款連結，付款完成後由專人回電確認。",
  "LINE Pay": "送出後會顯示 LINE Pay 付款提示，付款完成後由專人回電確認。",
  "現場付款": "現場付款可於照服員抵達時付款，仍需先完成線上登記。"
};

const form = document.querySelector("#bookingForm");
const summaryPlan = document.querySelector("#summaryPlan");
const summaryPrice = document.querySelector("#summaryPrice");
const summaryPayment = document.querySelector("#summaryPayment");
const paymentNote = document.querySelector("#paymentNote");
const receipt = document.querySelector("#receipt");
const qrImage = document.querySelector("#qrImage");
const qrUrl = document.querySelector("#qrUrl");
const qrTargetInput = document.querySelector("#qrTargetInput");
const qrWarning = document.querySelector("#qrWarning");
const printPoster = document.querySelector("#printPoster");
const qrTargetKey = "dongtai-qr-target";

function currency(value) {
  return `NT$${value.toLocaleString("zh-TW")}`;
}

function getSelectedPlanKey() {
  return new FormData(form).get("plan") || "shared24";
}

function getSelectedPlan() {
  return plans[getSelectedPlanKey()] || plans.shared24;
}

function getSelectedPayment() {
  return new FormData(form).get("payment") || "ATM";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateSummary() {
  const plan = getSelectedPlan();
  const payment = getSelectedPayment();
  summaryPlan.textContent = plan.name;
  summaryPrice.textContent = currency(plan.price);
  summaryPayment.textContent = `付款方式：${payment}`;
  paymentNote.textContent = paymentNotes[payment];
}

function setupQrCode() {
  const fallback = new URL("index.html#booking", window.location.href).toString();
  const savedTarget = localStorage.getItem(qrTargetKey);
  const isFileMode = window.location.protocol === "file:";
  const target = savedTarget || fallback;

  qrTargetInput.value = target;
  qrUrl.textContent = target;
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(target)}`;

  if (isFileMode && !savedTarget) {
    qrWarning.hidden = false;
    qrWarning.textContent = "目前使用 file:// 開啟，正式營運請使用伺服器網址。手機無法讀取電腦本機檔案。";
  } else {
    qrWarning.hidden = true;
  }
}

function buildOrderPayload(data) {
  return {
    name: data.get("name"),
    phone: data.get("phone"),
    floor: data.get("floor"),
    room: data.get("room"),
    note: data.get("note"),
    planKey: getSelectedPlanKey(),
    paymentMethod: getSelectedPayment()
  };
}

async function saveOrder(payload) {
  if (!window.location.protocol.startsWith("http")) {
    throw new Error("請使用伺服器網址開啟，才能送出營運資料。");
  }

  const response = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "送出失敗，請稍後再試。");
  }

  return response.json();
}

function buildReceipt(order) {
  const paymentDetail = order.paymentMethod === "ATM"
    ? "ATM 轉帳帳號：待串接金流後顯示。請先保留此受理編號。"
    : order.paymentMethod === "現場付款"
      ? "現場付款：照服員抵達時付款。"
      : `${order.paymentMethod}：待串接金流後導向付款頁。`;

  return `
    <strong>已送出登記</strong><br>
    受理編號：${escapeHtml(order.id)}<br>
    姓名：${escapeHtml(order.name)}<br>
    電話：${escapeHtml(order.phone)}<br>
    位置：${escapeHtml(order.floor)}，${escapeHtml(order.room)}<br>
    方案：${escapeHtml(order.planName)}，${currency(order.amount)}<br>
    付款：${escapeHtml(order.paymentMethod)}<br>
    付款狀態：${escapeHtml(order.paymentStatus)}<br>
    ${paymentDetail}
  `;
}

form.addEventListener("change", updateSummary);
form.addEventListener("input", updateSummary);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  const data = new FormData(form);
  try {
    const order = await saveOrder(buildOrderPayload(data));
    receipt.hidden = false;
    receipt.innerHTML = buildReceipt(order);
    receipt.scrollIntoView({ behavior: "smooth", block: "nearest" });
    form.reset();
    updateSummary();
  } catch (error) {
    paymentNote.textContent = error.message;
  }
});

function updateQrTargetFromInput() {
  const nextTarget = qrTargetInput.value.trim();
  if (nextTarget) {
    localStorage.setItem(qrTargetKey, nextTarget);
  } else {
    localStorage.removeItem(qrTargetKey);
  }
  setupQrCode();
}

qrTargetInput.addEventListener("input", updateQrTargetFromInput);
qrTargetInput.addEventListener("change", updateQrTargetFromInput);

qrImage.addEventListener("error", () => {
  qrWarning.hidden = false;
  qrWarning.textContent = "QR 圖片服務目前無法載入。正式上線時可使用下方網址到任一 QR Code 產生器製作，或部署後再重新整理。";
});

printPoster.addEventListener("click", () => {
  window.print();
});

updateSummary();
setupQrCode();
