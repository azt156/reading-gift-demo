# 閱讀有禮 Demo

樂寫公益學習網的閱讀活動流程示範。靜態 HTML、CSS、JavaScript，透過 GitHub Pages 提供 HTTPS 網站。

## 試用

- 首頁：`index.html`
- 完整挑戰辦法：`challenge-rules.html`，可返回活動首頁。
- 註冊／登入：`access.html`。使用測試信箱與至少 8 字的測試密碼；驗證碼直接顯示在畫面，不會寄信。
- 閱讀四步：`my-challenge.html`。選書、筆記、反思、五分鐘內口述；可錄音或上傳音檔。
- 管理測試：`admin.html`。調整活動、名額與贊助內容，審核本機測試作品。
- 說明：`about-preview.html`

## 資料與限制

所有測試帳號、草稿、音檔、附件、審核與名額只存在各自瀏覽器的 localStorage／IndexedDB，不會上傳 GitHub 或其他服務。測試密碼只保存加鹽摘要；此機制不能作為正式會員安全驗證。

不同裝置、瀏覽器與網站來源彼此獨立，名額不是所有人共用。清除網站資料會遺失測試內容。管理頁沒有正式角色限制，只能看該瀏覽器保存的資料。請勿填入真實密碼或學員個資。

正式的信箱寄信、樂寫資料庫、音檔自動轉寫、Google Drive 雙份保存、Gem 判定與寄書服務尚未啟用。現在可測試人工審核：依通過先後保留名額，額滿候補，已領取不重複扣。

## 開發

`python3 -m http.server 8765 --bind 127.0.0.1` 後開啟本機網址。麥克風與 WebCrypto 需要 HTTPS 或 localhost。

檢查：`node --test tests/*.test.cjs`。

本儲存庫只含 Demo 程式、必要圖片與測試，不含學員作品、瀏覽器資料、會議逐字稿或服務憑證。
