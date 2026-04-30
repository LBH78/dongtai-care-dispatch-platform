const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.argv[2] || process.env.PORT || 5173);
const root = __dirname;
const ordersFile = path.join(root, "orders.json");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api/orders")) {
    handleOrdersApi(request, response);
    return;
  }

  const requestedPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const filePath = path.normalize(path.join(root, decodeURIComponent(requestedPath)));

  if (!filePath.startsWith(root)) {
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
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  });
});

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
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
  if (!fs.existsSync(ordersFile)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(ordersFile, "utf8"));
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ordersFile, `${JSON.stringify(orders, null, 2)}\n`, "utf8");
}

async function handleOrdersApi(request, response) {
  if (request.method === "GET" && request.url === "/api/orders") {
    sendJson(response, 200, readOrders());
    return;
  }

  if (request.method === "POST" && request.url === "/api/orders") {
    try {
      const order = await readJsonBody(request);
      const orders = readOrders();
      orders.unshift(order);
      writeOrders(orders);
      sendJson(response, 201, order);
    } catch {
      sendJson(response, 400, { error: "Invalid order payload" });
    }
    return;
  }

  if (request.method === "PATCH" && request.url.startsWith("/api/orders/")) {
    try {
      const orderId = decodeURIComponent(request.url.replace("/api/orders/", ""));
      const patch = await readJsonBody(request);
      const orders = readOrders().map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        return {
          ...order,
          ...patch,
          updatedAt: new Date().toISOString()
        };
      });

      writeOrders(orders);
      sendJson(response, 200, orders.find((order) => order.id === orderId) || null);
    } catch {
      sendJson(response, 400, { error: "Invalid update payload" });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

server.listen(port, "127.0.0.1", () => {
  console.log(`東泰照服平台預覽：http://127.0.0.1:${port}`);
});
