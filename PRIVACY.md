# 隱私說明

## 資料流

Android App 使用者主動登入時，App 會將學號、密碼與驗證碼直接送至國立臺灣海洋
大學 AIS 網站 `https://ais.ntou.edu.tw`，並使用 AIS 回傳的 Session Cookie 讀取使用者
要求的校務資料。

校園連結或交通功能可能開啟第三方網站；除非使用者主動操作該網站，App 不會把 AIS
帳號、Cookie、課表或成績傳送給第三方。

## 本機保存

- 驗證碼不會保存；只有 Android 使用者選擇「記住我」時，登入資料才會存入 Android Keystore。
- AIS Session Cookie 使用 Android Keystore 保護。
- 課表、成績與學分快取使用 Android App 私有加密儲存空間。
- 自訂課程、模擬成績、鬧鐘與使用者選擇的頭像只保存在 App 本機儲存空間。
- 登出會清除 AIS Session；清除 App 資料或解除安裝會移除所有本機資料。

## 不收集的資料

本專案沒有分析、廣告、遙測或錯誤回報 SDK，也沒有保存個人資料的應用程式資料庫。
海大 AIS 仍可能依其政策處理必要的連線中繼資料，例如 IP 位址、時間、HTTP 狀態與流量
資訊。應用程式程式碼不會主動集中保存：

- AIS 帳號或密碼
- Session Cookie
- 課表、成績或個人資料
- 使用者選擇的頭像
- 裝置識別碼或精確位置

## Repository

版本庫只包含原始碼、合成測試資料與公開 App 素材。以下內容由 `.gitignore` 排除：

- 本機環境檔與 Android SDK 路徑
- APK、AAB、建置產物與簽章金鑰
- 手機截圖、螢幕錄影與 Codex 附件
- 真實 Cookie、Token、帳密與其他本機機密

## 注意事項

此 App 為非官方學生工具。使用者應自行確認符合學校資訊系統的使用規範；AIS 的網站
流程、Cookie 規則或頁面結構變更時，App 可能無法正常運作。
