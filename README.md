# 海大 TAT

海大 TAT 是以 React、TypeScript、Vite 與 Capacitor 製作的非官方 Android／iOS
學生工具，將國立臺灣海洋大學 AIS 的課表、成績與校務資訊整理成行動版介面。

> 本專案不是海大官方 App，也未受海大委託或背書。AIS 網頁結構或登入流程變更時，
> 部分功能可能暫時失效。

## 下載 App

| 平台 | 下載 | 安裝說明 |
| --- | --- | --- |
| Android | [下載最新版 APK](https://github.com/lxuaneneliko/ntou-tat/releases/latest/download/app-release.apk) | 允許瀏覽器或檔案管理器安裝未知來源 App |
| iPhone／iPad | [下載最新版未簽章 IPA](https://github.com/lxuaneneliko/ntou-tat/releases/latest/download/ntou-tat-ios-unsigned.ipa) | 需先使用自己的 Apple 帳號或開發者憑證簽章 |

Android APK 可以直接安裝。基於 Apple 的安全限制，未簽章 IPA 不能直接安裝到一般
iPhone；請在 macOS 使用 Xcode 設定 Apple Team 後安裝，或先用自己的憑證重新簽章。

## 功能

- 海大 AIS 自動辨識驗證碼登入與本機 Session 保存
- 學期課表格狀／條列顯示
- 分學期成績、4.0 GPA 與學分統計
- 海大官方行事曆、月份滑動切換與本機個人事件
- 海大校務系統功能樹與 App 內頁面
- 校務公告、校園連結、交通與緊急聯絡
- 本機自訂課程、模擬成績、鬧鐘與個人頭像

## 隱私

- 帳號、密碼與驗證碼只送往 `https://ais.ntou.edu.tw`。
- App 可在使用者選擇「記住我」時，將登入資料存放於 Android Keystore 或 iOS Keychain；沒有自建資料後端、分析 SDK 或廣告追蹤。
- AIS Cookie 與課表／成績快取使用 Android App 私有加密儲存空間或 iOS Keychain。
- 頭像和自訂資料只保存在使用者裝置。
- Git 歷史不包含真實帳號、Cookie、Token、手機截圖、APK 或簽章金鑰。
- GitHub Release 只提供經過隱私掃描的 APK 與未簽章 IPA。

完整說明請見 [PRIVACY.md](PRIVACY.md)。

## 開發

需求：

- Node.js 20+
- Java 21
- Android SDK
- macOS、Xcode 26+（只在建置或安裝 iOS App 時需要）

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

產生及同步 iOS 專案：

```powershell
npm run ios:sync
```

接著在 macOS 使用 Xcode 開啟 `ios/App/App.xcodeproj`，設定 Apple Team 與簽章後，
即可安裝至 iPhone 或封存送往 TestFlight。iOS 15 以上版本受支援。

GitHub Actions 的 `iOS Build` 會另外產生 Simulator App 與未簽章 IPA。未簽章 IPA
必須先用自己的 Apple 帳號或開發者憑證重新簽章，不能直接安裝到一般 iPhone。

## Mock 模式

瀏覽器開發時可用 mock 資料，不必登入 AIS：

```powershell
$env:VITE_NTOU_AUTH_MODE='mock'
npm run dev
```

所有 mock 身分與資料均為合成測試資料。
