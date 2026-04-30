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
dongtai2026
```

## 正式營運設定

正式上線時請設定環境變數，不要使用預設密碼：

```text
ADMIN_PASSWORD=請改成正式後台密碼
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

部署後，請把前台 QR Code 的連結設定成正式網址，例如：

```text
https://你的網域/index.html#booking
```

## 金流預留

目前已保留欄位：

- `paymentMethod`
- `paymentStatus`
- `paymentProviderStatus`

之後串接 ATM、信用卡、LINE Pay 時，可在 `/api/orders` 建單後導向金流頁，並新增金流 webhook 更新付款狀態。
