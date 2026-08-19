# 東泰照服勞動合作社線上人力派遣平台

這個版本已改成可營運的 Node.js 後端網站。前台可供 QR Code 掃碼登記，後台需要管理員密碼登入，登記資料會集中寫入伺服器資料檔，不再只存在使用者手機或瀏覽器暫存。

## 功能

- 前台登記欄位：姓名、電話、樓層、病房號碼、備註。
- 照護方案：
  - 一對六照顧 24 小時：NT$1,100
  - 一對六照顧 12 小時：NT$700
  - 一對一專人照顧 24 小時：NT$2,800
  - 一對一專人照顧 12 小時：NT$1,800
- 付款方式：ATM、信用卡、LINE Pay、現場付款。
- 伺服器端建立受理編號、金額、付款狀態，避免前端被改價。
- 管理後台密碼登入。
- 後台可查看登記資料、付款方式、付款狀態、總金額。
- 後台可更新付款狀態：待付款、已付款、現場未收款、已取消。
- 後台可匯出 CSV。
- 可列印 QR Code 海報。
- 金流尚未串接，付款狀態先以人工或之後金流回傳更新。

## 本機營運測試

```powershell
node server.js 5175
```

前台：

```text
http://127.0.0.1:5175/index.html
```

後台：

```text
http://127.0.0.1:5175/admin.html
```

預設管理員密碼：

```text
720725
```

## 正式營運設定

正式上線時請設定環境變數，不要使用預設密碼：

```text
ADMIN_PASSWORD=720725
HOST=0.0.0.0
PORT=平台指定的連接埠
DATA_DIR=./data
```

登記資料會寫入：

```text
data/orders.json
```

這個檔案已加入 `.gitignore`，不會被推到 GitHub。

## 部署注意

GitHub Pages 只能放靜態網頁，不能執行這個營運後端。正式營運請部署到可執行 Node.js 的主機，例如 Render、Railway、Fly.io、VPS、NAS 或自有伺服器。

### Render 部署設定

本專案已提供 `render.yaml`，可用 Render Blueprint 建立正式服務：

- Service name: `dongtai-care-dispatch-platform`
- Branch: `codex/production-backend`
- Region: `singapore`
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Persistent disk: `/var/data`
- Data file: `/var/data/orders.json`

Render 建立服務時請填入：

```text
ADMIN_PASSWORD=你的正式後台密碼
```

Render 的 Web Service 必須綁定 `0.0.0.0`，本專案已透過環境變數 `HOST=0.0.0.0` 設定。Render 也會提供 `PORT` 環境變數，伺服器會自動讀取。

部署後，請把前台 QR Code 的連結設定成正式網址，例如：

```text
https://你的網域/index.html#booking
```

## 常見問題

如果後台顯示「這個網址沒有連接營運後端」，代表目前開到的是 GitHub Pages、`file://` 檔案，或沒有 Node.js API 的網址。正式營運後台必須使用 Render / Node.js 主機提供的網址。

如果密碼正確但登入後又回到登入畫面，請確認主機有使用 HTTPS，或確認反向代理有傳遞 `x-forwarded-proto: https`。本專案會依實際 HTTPS 狀態設定登入 cookie。

## 金流預留

目前已保留欄位：

- `paymentMethod`
- `paymentStatus`
- `paymentProviderStatus`

之後串接 ATM、信用卡、LINE Pay 時，可在 `/api/orders` 建單後導向金流頁，並新增金流 webhook 更新付款狀態。
