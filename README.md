# 海大 TAT｜海洋黑客松增修進度

本分支記錄截至 2026 年 10 月 12 日的海洋黑客松功能增修與測試進度，不代表正式版本發布或 Google Play 更新。

新增與調整內容包含外觀／導覽客製化、行事曆跨日事件、課程資訊、進階英文抵免選項、Mail2000 快取與捲動位置、Android 課表小工具，以及校園活動快報、圖片與 App 內揪團。

本次上傳前已重新執行 300 項測試及網頁建置。真實 AIS 身分交換、兩人揪團流程與背景通知仍需實機確認；保留原有 iOS 程式，不表示本次 Android 增修已在 iOS 驗收。

完整紀錄請見 [海洋黑客松增修進度](docs/HACKATHON_PROGRESS.md)。安裝套件中的既有測試識別與版本值維持不變，本次不建立正式 Release、不上傳 APK／AAB，也不改動其他分支。

海大 TAT 是以 React、TypeScript、Vite 與 Capacitor 製作的非官方 Android／iOS 學生工具，
將國立臺灣海洋大學 AIS 的課表、成績與校務資訊整理成行動版介面。

> 本專案不是海大官方 App，也未受海大委託或背書。AIS 網頁結構或登入流程變更時，
> 部分功能可能暫時失效。

## 已公開版本下載

以下連結是原有公開版本，不是本分支的黑客松增修測試套件。

[下載最新版 Android APK](https://github.com/lxuaneneliko/ntou-tat/releases/latest/download/NTOUTAT.apk)

APK 使用 debug key 簽章，可直接安裝；Android 如顯示未知來源提示，請允許瀏覽器或
檔案管理器安裝此 App。

### 新版通知

Android App 啟動及回到前景時會定期查詢本儲存庫的最新正式 GitHub Release。當
Release 標籤版本高於已安裝版本時，App 會顯示更新內容與「下載新版 APK」按鈕；
App 不會在背景下載或自動安裝。

發布新版時只需確認：

1. `package.json` 的版本、Android `versionName` 與 Release 標籤一致，例如 `1.13.0`／`v1.13.0`。
2. Android `versionCode` 比上一版大。
3. 建立非草稿、非 prerelease 的 GitHub Release，並上傳固定名稱 `NTOUTAT.apk`。
4. APK 使用與舊版相同的簽章金鑰，使用者才能直接覆蓋安裝並保留資料。

本分支使用「海洋黑客松增修進度」記錄實際功能與驗證範圍，不以籠統修復說明代替進度。

本機測試 APK 可用 Gradle 的 `-PtatVersionName`、`-PtatVersionCode` 指定獨立版本，
例如 PowerShell 使用 `'-PtatVersionName=1.13.29.5-test' '-PtatVersionCode=72'`（參數需加引號）。
測試版不建立 GitHub Release；下一個正式版須使用更高的版本名稱與 versionCode
（接續此測試版至少 `1.13.30`、`73`），才能通知測試版使用者並覆蓋安裝。

## 功能

- 海大 AIS 自動辨識驗證碼登入與 Session 保存
- 學期課表格狀／條列顯示
- 分學期成績、4.0 GPA 與學分統計
- 海大官方行事曆、月份滑動切換與本機個人事件
- 海大校務系統功能樹與 App 內頁面
- 海大首頁校務公告、20 個行政單位與 45 個所屬單位官方消息
- 校園常用連結、交通與緊急聯絡
- APK 內完整 Mail2000 信箱：資料夾、全部郵件分頁、純文字內容、內文圖片、附件、星號、移動、寄信、回覆與轉寄
- 本機自訂課程、模擬成績與個人頭像

## 隱私

- Android App 將帳號、密碼與驗證碼直接送往 `https://ais.ntou.edu.tw`。
- App 可在使用者選擇「記住我」時，將登入資料存放於 Android Keystore；沒有分析 SDK 或廣告追蹤。
- AIS Cookie 與課表／成績快取使用 Android App 私有加密儲存空間。揪團功能另會將現有 AIS Cookie 暫時交給固定的活動後端核對學號；不傳 AIS 密碼，後端不保存收到的 Cookie。
- 活動後端保存揪團會員識別、名稱、揪團／參加／檢舉紀錄及短效登入 token 雜湊；公開清單不顯示學號，參加名單只提供發起人查看。
- Mail2000 密碼與 AIS 密碼完全分開；App 只把使用者在信箱頁輸入的帳密送往 `mail.ntou.edu.tw` 的 IMAP `993` 與 SMTP `465` 加密連線。
- 使用者可選擇是否將 Mail2000 帳密加密儲存在 Android 本機安全區，信箱登出時會清除。
- 郵件內容由 APK 直接透過加密 IMAP 讀取，不經海大 TAT 自有伺服器；信件文字一律轉為純文字顯示，內嵌圖片及圖片型雲端連結則整理至信件圖片區。
- 頭像和自訂資料只保存在使用者裝置。
- Git 歷史不包含真實帳號、Cookie、Token、手機截圖、APK 或簽章金鑰。
- GitHub Release 只提供經過隱私掃描的 Android APK。

完整說明請見 [PRIVACY.md](PRIVACY.md)。

## 開發

iOS 原始碼、原生信箱與掃碼、建置方式和上架交接請見 [iOS 交接文件](docs/IOS_HANDOFF.md)。
iOS 透過 App Store／TestFlight 發行，不下載 Android APK。原生編譯與模擬器檢查由
GitHub Actions 的 `iOS build and tests` 執行；綠燈不代表已完成真機驗收或 Apple 審核。

需求：

- Node.js 24+
- Java 21
- Android SDK

```powershell
npm install
npm test
npm run lint
npm run android:debug
```

Debug APK 會輸出到：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

App 圖示、啟動畫面與登入頁使用專案的 T 圖示，不使用海大校徽；
本專案仍為非官方學生工具。

## Mock 模式

瀏覽器開發時可用 mock 資料，不必登入 AIS：

```powershell
$env:VITE_NTOU_AUTH_MODE='mock'
npm run dev
```

所有 mock 身分與資料均為合成測試資料。
