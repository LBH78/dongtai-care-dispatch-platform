const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const port = Number(process.env.PORT || process.argv[2] || 5173);
const host = process.env.HOST || "127.0.0.1";
const root = __dirname;
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const ordersFile = path.join(dataDir, "orders.json");
const adminPassword = process.env.ADMIN_PASSWORD || "dongtai2026";
const sessionCookieName = "dongtai_admin_session";
const sessionMaxAgeSeconds = 60 * 60 * 8;
const sessions = new Map();

const plans = {
  shared24: { name: "一對六照顧 24 小時", price: 1100 },
  shared12: { name: "一對六照顧 12 小時", price: 700 },
  private24: { name: "一對一專人照顧 24 小時", price: 2800 },
  private12: { name: "一對一專人照顧 12 小時", price: 1800 }
};

const paymentMethods = new Set(["ATM", "信用卡", "LINE Pay", "現場付款"]);
const paymentStatuses = new Set(["待付款", "已付款", "現場未收款", "已取消"]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

ensureDataFile();

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url);
    return;
  }

  serveStatic(url, response);
});

function ensureDataFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(ordersFile)) {
    fs.writeFileSync(ordersFile, "[]\n", "utf8");
  }
}

function serveStatic(url, response) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(root, decodeURIComponent(requestedPath)));

  if (!filePath.startsWith(root) || filePath.startsWith(dataDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  });
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      await login(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/logout") {
      logout(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/session") {
      sendJson(response, 200, { authenticated: isAuthenticated(request) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      await createOrder(request, response);
      return;
    }

    if (!isAuthenticated(request)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/orders") {
      sendJson(response, 200, readOrders());
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/orders/")) {
      await updateOrder(request, response, url);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/orders.csv") {
      sendCsv(response, readOrders());
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: "Server error" });
  }
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function sendCsv(response, orders) {
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

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="dongtai-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Content-Type": "text/csv; charset=utf-8"
  });
  response.end(`\ufeff${csv}`);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(ordersFile, "utf8"));
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  const tempFile = `${ordersFile}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(orders, null, 2)}\n`, "utf8");
  fs.renameSync(tempFile, ordersFile);
}

async function login(request, response) {
  const payload = await readJsonBody(request);
  if (!safeCompare(String(payload.password || ""), adminPassword)) {
    sendJson(response, 401, { error: "Invalid password" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + sessionMaxAgeSeconds * 1000);
  sendJson(response, 200, { authenticated: true }, {
    "Set-Cookie": buildSessionCookie(token, request)
  });
}

function logout(request, response) {
  const token = getCookie(request, sessionCookieName);
  if (token) {
    sessions.delete(token);
  }

  sendJson(response, 200, { authenticated: false }, {
    "Set-Cookie": `${sessionCookieName}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`
  });
}

async function createOrder(request, response) {
  const payload = await readJsonBody(request);
  const validationError = validateOrderPayload(payload);
  if (validationError) {
    sendJson(response, 400, { error: validationError });
    return;
  }

  const plan = plans[payload.planKey];
  const paymentStatus = payload.paymentMethod === "現場付款" ? "現場未收款" : "待付款";
  const order = {
    id: createOrderId(),
    createdAt: new Date().toISOString(),
    name: cleanText(payload.name, 80),
    phone: cleanText(payload.phone, 40),
    floor: cleanText(payload.floor, 40),
    room: cleanText(payload.room, 40),
    note: cleanText(payload.note, 500),
    planKey: payload.planKey,
    planName: plan.name,
    amount: plan.price,
    paymentMethod: payload.paymentMethod,
    paymentStatus,
    paymentProviderStatus: "未串接金流"
  };

  const orders = readOrders();
  orders.unshift(order);
  writeOrders(orders);
  sendJson(response, 201, order);
}

async function updateOrder(request, response, url) {
  const orderId = decodeURIComponent(url.pathname.replace("/api/orders/", ""));
  const payload = await readJsonBody(request);

  if (!paymentStatuses.has(payload.paymentStatus)) {
    sendJson(response, 400, { error: "Invalid payment status" });
    return;
  }

  let updatedOrder = null;
  const orders = readOrders().map((order) => {
    if (order.id !== orderId) {
      return order;
    }

    updatedOrder = {
      ...order,
      paymentStatus: payload.paymentStatus,
      updatedAt: new Date().toISOString()
    };
    return updatedOrder;
  });

  if (!updatedOrder) {
    sendJson(response, 404, { error: "Order not found" });
    return;
  }

  writeOrders(orders);
  sendJson(response, 200, updatedOrder);
}

function validateOrderPayload(payload) {
  if (!cleanText(payload.name, 80)) return "姓名必填";
  if (!cleanText(payload.phone, 40)) return "電話必填";
  if (!cleanText(payload.floor, 40)) return "樓層必填";
  if (!cleanText(payload.room, 40)) return "病房號碼必填";
  if (!plans[payload.planKey]) return "照護方案不正確";
  if (!paymentMethods.has(payload.paymentMethod)) return "付款方式不正確";
  return "";
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function createOrderId() {
  const date = new Date();
  const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `DT${ymd}${suffix}`;
}

function isAuthenticated(request) {
  const token = getCookie(request, sessionCookieName);
  if (!token) {
    return false;
  }

  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }

  sessions.set(token, Date.now() + sessionMaxAgeSeconds * 1000);
  return true;
}

function getCookie(request, name) {
  const cookies = String(request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }
  return "";
}

function buildSessionCookie(token, request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const hostHeader = request.headers.host || "";
  const isLocalHost = hostHeader.startsWith("localhost") || hostHeader.startsWith("127.0.0.1");
  const secure = forwardedProto === "https" || (!isLocalHost && forwardedProto !== "http");
  const secureFlag = secure ? "; Secure" : "";
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}; Path=/${secureFlag}`;
}

function safeCompare(input, expected) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

function csvCell(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
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

server.listen(port, host, () => {
  console.log(`東泰照服平台：http://${host}:${port}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log("提醒：正式營運請設定 ADMIN_PASSWORD 環境變數。");
  }
});
