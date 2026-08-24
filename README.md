# 海大 TAT

海大 TAT 是以 React、TypeScript、Vite 與 Capacitor 製作的非官方 Android 學生工具，
將國立臺灣海洋大學 AIS 的課表、成績與校務資訊整理成行動版介面。

> 本專案不是海大官方 App，也未受海大委託或背書。AIS 網頁結構或登入流程變更時，
> 部分功能可能暫時失效。

## 下載 App

[下載最新版 Android APK](https://github.com/lxuaneneliko/ntou-tat/releases/latest/download/NTOUTAT.apk)

APK 使用 debug key 簽章，可直接安裝；Android 如顯示未知來源提示，請允許瀏覽器或
檔案管理器安裝此 App。

## 功能

- 海大 AIS 自動辨識驗證碼登入與 Session 保存
- 學期課表格狀／條列顯示
- 分學期成績、4.0 GPA 與學分統計
- 海大官方行事曆、月份滑動切換與本機個人事件
- 海大校務系統功能樹與 App 內頁面
- 校務公告、校園連結、交通與緊急聯絡
- 本機自訂課程、模擬成績、鬧鐘與個人頭像

## 隱私

- Android App 將帳號、密碼與驗證碼直接送往 `https://ais.ntou.edu.tw`。
- App 可在使用者選擇「記住我」時，將登入資料存放於 Android Keystore；沒有分析 SDK 或廣告追蹤。
- AIS Cookie 與課表／成績快取使用 Android App 私有加密儲存空間。
- 頭像和自訂資料只保存在使用者裝置。
- Git 歷史不包含真實帳號、Cookie、Token、手機截圖、APK 或簽章金鑰。
- GitHub Release 只提供經過隱私掃描的 Android APK。

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

App 圖示使用[海大官方校徽](https://www.ntou.edu.tw/motto)，來源檔取自海大 AIS
官方網站；本專案仍為非官方學生工具。

## Mock 模式

瀏覽器開發時可用 mock 資料，不必登入 AIS：

```powershell
$env:VITE_NTOU_AUTH_MODE='mock'
npm run dev
```

所有 mock 身分與資料均為合成測試資料。
