import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

function getConnectedDevices() {
  try {
    const output = execSync('adb devices', { encoding: 'utf8' })
    const lines = output.split('\n').map((line) => line.trim())
    const devices = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      const parts = line.split(/\s+/)
      if (parts.length >= 2 && parts[1] === 'device') {
        devices.push(parts[0])
      }
    }
    return devices
  } catch {
    console.error('❌ 無法執行 adb 命令。請確認 Android SDK platform-tools 已正確設定。')
    process.exit(1)
  }
}

async function main() {
  console.log('📱 正在偵測連接的 Android 裝置與模擬器...')
  const devices = getConnectedDevices()

  if (devices.length === 0) {
    console.error('\n❌ 未偵測到已連接且已授權的 Android 裝置。')
    console.error('💡 請確認：')
    console.error('  1. 手機已開啟「USB 偵錯」(USB Debugging)')
    console.error('  2. 已在手機畫面上允許「此電腦的 USB 偵錯」授權')
    console.error('  3. 或 Android 模擬器 (AVD) 已啟動並連線\n')
    process.exit(1)
  }

  console.log(`✅ 偵測到 ${devices.length} 台目標裝置: ${devices.join(', ')}`)

  console.log('\n🔨 開始編譯 Android APK (npm run android:debug)...')
  run('npm run android:debug')

  const apkPath = path.resolve('android/app/build/outputs/apk/debug/app-debug.apk')
  if (!fs.existsSync(apkPath)) {
    console.error(`\n❌ 找不到 APK 檔案: ${apkPath}`)
    process.exit(1)
  }

  for (const device of devices) {
    console.log(`\n🚀 正在安裝 APK 至裝置 [${device}]...`)
    run(`adb -s ${device} install -r "${apkPath}"`)

    console.log(`▶️ 正在裝置 [${device}] 啟動 App...`)
    try {
      execSync(`adb -s ${device} shell am start -n com.lxuan.ntou_tat/.MainActivity`, { stdio: 'inherit' })
    } catch {
      console.log('💡 無法自動啟動 App，請手動在裝置上點擊開啟。')
    }
  }

  console.log('\n🎉 所有 Android 裝置安裝與啟動完成！')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
