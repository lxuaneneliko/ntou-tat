# 海大 TAT

海大 TAT 是以 React、TypeScript、Vite 與 Capacitor 製作的非官方 Android
學生工具，將國立臺灣海洋大學 AIS 的課表、成績與校務資訊整理成行動版介面。

> 本專案不是海大官方 App，也未受海大委託或背書。AIS 網頁結構或登入流程變更時，
> 部分功能可能暫時失效。

## 下載 APK

[直接下載最新版海大 TAT APK](https://github.com/lxuaneneliko/ntou-tat/releases/latest/download/app-release.apk)

目前提供 Android Debug APK。首次安裝時，Android 可能會要求允許瀏覽器或檔案管理器
安裝未知來源 App。

## 功能

- 海大 AIS 驗證碼登入與本機 Session 保存
- 學期課表格狀／條列顯示
- 分學期成績、4.0 GPA 與學分統計
- 海大官方行事曆與月份滑動切換
- 海大校務系統功能樹與 App 內頁面
- 校務公告、校園連結、交通與緊急聯絡
- 本機自訂課程、模擬成績、鬧鐘與個人頭像

## 隱私

- 帳號、密碼與驗證碼只送往 `https://ais.ntou.edu.tw`。
- App 不保存密碼，也沒有自建資料後端、分析 SDK 或廣告追蹤。
- AIS Cookie 與課表／成績快取使用 Android App 私有儲存空間。
- 頭像和自訂資料只保存在使用者裝置。
- Git 歷史不包含真實帳號、Cookie、Token、手機截圖、APK 或簽章金鑰。
- GitHub Release 只提供經過隱私掃描的 APK 安裝檔。

完整說明請見 [PRIVACY.md](PRIVACY.md)。

## 開發

需求：

- Node.js 20+
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

## Mock 模式

瀏覽器開發時可用 mock 資料，不必登入 AIS：

```powershell
$env:VITE_NTOU_AUTH_MODE='mock'
npm run dev
```

所有 mock 身分與資料均為合成測試資料。
