# Notion Timeline Exporter

把 Notion 資料庫 CSV 還原成可分享的甘特圖（Gantt / Timeline）。

Notion 原生 Timeline 匯出只有 CSV，會失去顏色、view 設定與視覺排程。這個工具用 CSV 裡仍存在的任務、日期、階段與負責人，重建一份客戶可看的時間軸，並可下載單檔 HTML 或列印成 PDF。

## 能還原什麼

- 任務名稱、開始/結束日期、工期
- Phase 分組與配色
- Type（Milestone / Task / Payment）
- Project 篩選
- 負責人（Person / Category）
- Parent item 階層縮排

無法 100% 複製 Notion 畫面（CSV 沒有 view 顏色、bar 上顯示哪些欄位、dependency 箭頭樣式）。這是「客戶可交付」的甘特圖，不是 Notion 截圖。

## 使用

1. 用瀏覽器開啟 `index.html`（不需安裝、不需伺服器）
2. 在 Notion 資料庫按 `⋯` → Export → CSV
3. 把 CSV 拖進頁面（內部欄位都進來沒關係）
4. 勾選「給客戶看的標籤」；取消勾「客戶預覽」後，點左側 👁 排除不想給客戶的任務
5. 輸出請用：
   - **完整長圖 PNG**（推薦，一整張不會斬開）
   - **長圖 → PDF**（用完整圖再開列印另存 PDF）
   - **客戶 HTML**（互動瀏覽，已套用排除清單）

設定（顯示欄位、排除任務、篩選、欄位對應）會存進瀏覽器 localStorage；換新 CSV 後會自動還原。

也可把整個資料夾放到 GitHub Pages / Netlify，讓別人用同一個網頁上傳自己的 CSV。

## 為什麼不要直接「瀏覽器列印」寬 Timeline

瀏覽器會把超寬內容硬拆成多頁，所以會看起來像被斬開。本工具改成先畫出**完整長圖**再存 PDF，避開這個死症。

## Notion 欄位對應

工具會自動猜欄位，也可在畫面上手動指定：

| 用途 | 常見 Notion 欄位 |
|------|------------------|
| 任務名稱 | Task Name, Name, Title |
| 日期區間 | Urgent, Date, Timeline, Normal Schedule |
| 階段 | Phase |
| 類型 | Type |
| 專案 | Project |
| 負責人 | Person, Assignee, Category |
| 工期 | Day |
| 上層 | Parent item |

日期支援 `2026/09/07 → 2026/09/11`、單一日期、以及 `YYYY-MM-DD`。

## 授權

MIT
