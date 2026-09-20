# iOS 1.13.33（83）交接

這是共用 React 介面的原生 Capacitor iOS App，不是網站捷徑。尚未宣稱已上架或通過真機验收。
Android 的套件 ID、資料與發行管道保持獨立；此分支沒有發布 Android Release。

## 環境與建置

- macOS、Xcode 26+、Node.js 24+；iOS 15 起，iPhone／iPad。
- Clone 後在專案根目錄執行 `npm ci`、`npm test`、`npm run ios:sync`。
- `npm run ios:open` 開啟 `ios/App/App.xcodeproj`，選擇 App scheme。
- 原生依賴用 Swift Package Manager，不需 CocoaPods。
- `ios/App/CapApp-SPM/Package.swift` 由 Capacitor 管理，不要手動改；自有功能在 `ios/App/NtouNative`。
- `swift test --package-path ios/App/NtouNative` 測試信件解析、地址及標頭防注入。

GitHub Actions `iOS build and tests` 會做前端測試、原生測試、模擬器編譯、啟動截圖與無簽章實機 archive。
artifact `ios-build-evidence` 裡的 `.xcarchive` **不是可安裝 IPA，也不能直接提交 App Store**。

## 功能與平台差異

- 課表／成績、歴史快取、手動採計、行事曆、自訂課程、課程備註、公告與行政／系網沿用共用功能。
- AIS 使用原生 URLSession、Cookie jar、Keychain；系統頁面在 WKWebView 開啟。
- QR：Apple AVFoundation 掃描、Vision 圖庫辨識，無 Google Play 依賴。
- 信箱：原生 TLS IMAP／SMTP、分頁、資料夾、已讀／星號、移動、純文字與原位圖片、附件分享、寄信／回覆／轉寄。
- iOS 信箱背景檢查使用 BGAppRefreshTask，系統可能延後、暫停；不是即時推播，不保證 15 分鐘一次。強制關閉／低耗電／停用背景重新整理可能不執行。
- 地圖：真正的 MapLibre 向量地圖、拖曳縮放、館樓／教室／教授搜尋、步行路線與前景單次定位；定位拒絕仍可用兩個館樓規劃。
- 更新由 App Store／TestFlight 處理；iOS 不顯示 GitHub APK 安裝提示。
- 不提供新帳號註冊；學校帳號由海大管理。App 信箱登入／AIS 登入互相獨立。

## Apple 簽章與上架（協助上架者執行）

1. Apple Developer / App Store Connect 建立 App。iOS bundle ID 是 `com.lxuan.ntoutat`（不是含底線的 Android ID）。若該 ID 已被占用，首次發行前換成團隊自己的 ID，並同步修改 Info.plist / MailNotifications.swift 的背景 task identifier。
2. Xcode → App → Signing & Capabilities，選擇自己的 Team，自動簽章。不要把憑證、私鑰、profile、Apple 密碼提交到 Git。
3. 接 iPhone 完成以下驗收，再以 Generic iOS Device → Product → Archive → Validate App → Distribute App → App Store Connect 發佈 TestFlight。
4. 版本 1.13.33、build 83；若 Connect 已存在此 build，递增 build number，再更新對應紀錄。
5. 補上 App 描述、支援及隱私網址、螢幕截圖、內容分級、出口合規與 App Privacy 問卷；由帳號持有人依實際資料流確認，不能照抄「不收集」而忽略學校／地圖服務。
6. 審查登入功能需要可合法提供的測試帳號或經 Apple 同意的審查方式。不要提供個人真實學生密碼，不要為過審偽装功能。
7. 校名／校徽／校歌等權利仍屬各權利人，App 說明要維持「非官方」，上架前確認素材授權；ntoumap 作者同意不代表學校素材全部獲授權。

## 真機驗收門檻（不能用 CI 綠燈取代）

- [ ] 真實 AIS 登入、錯誤密碼、到期後恢復、登出再換帳號；不可洩露前一帳號資料。
- [ ] 當學期及歷史／暑修課表成績、離線快取、重新整理、背景切回。
- [ ] iPhone 與 iPad 的瀏海／底部安全區、橫直向、鍵盤、不遮住對話框。
- [ ] QR 相機允許／拒絕／取消、圖庫大圖／旋轉圖／無 QR、匯入後課程資訊。
- [ ] Mail2000 真實帳號收信、Big5／UTF-8、CID 內文圖、外部圖片同意、附件、寄信／回覆／轉寄、寄件備份。
- [ ] 通知預設關閉、啟用、撤銷系統權限、停用、信箱登出後不再收信。
- [ ] 實際校園定位、拒絕定位、兩欄互不干扰、教授→館樓路線、拖曳／縮放及網路中斷提示。
- [ ] 安裝 TestFlight 新 build 後，自訂課程、備註、朋友課表與行事曆仍保存。

在 Windows 完成來源碼與前端測試，不等於已驗證相機、GPS、真實信箱或 Apple 審核；請在勾完上列清單後再公開上架。
