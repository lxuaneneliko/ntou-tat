import { useEffect, useState } from 'react'
import { CalendarDays, RefreshCw, ShieldCheck } from 'lucide-react'
import { defaultWidgetDisplay, getLockTimetableSettings, openTimetableNotificationSettings, readWidgetDisplay, requestTimetableWidget, saveWidgetDisplay, setLockTimetableNotifications, type WidgetDisplay, type LockTimetableSettings } from './timetableWidget'

export function WidgetSettings() {
  const [display, setDisplay] = useState(readWidgetDisplay), [lock, setLock] = useState<LockTimetableSettings>({ enabled: false, supported: false, permissionGranted: false })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { let active = true; void getLockTimetableSettings().then((value) => { if (active) setLock(value) }).catch(() => {}); return () => { active = false } }, [])
  const change = async (next: WidgetDisplay) => { setDisplay(next); setError(''); try { await saveWidgetDisplay(next) } catch { setError('小工具外觀更新失敗，請重試') } }
  const toggleLock = async () => {
    if (busy) return
    if (!lock.enabled && !confirm('開啟後，課名、上課時間與教室可在未解鎖時顯示，拿到手機的人也可能看見。要開啟鎖定畫面課表通知嗎？')) return
    setBusy(true); setError('')
    try { const result = await setLockTimetableNotifications(!lock.enabled); setLock(result); if (!result.permissionGranted && !lock.enabled) setError('請先允許通知，再開啟鎖定畫面課表通知') } catch (cause) { setError(cause instanceof Error ? cause.message : '請先允許通知權限') }
    finally { setBusy(false) }
  }
  return <section className="widget-settings">
    <div className="section-label">桌面與鎖定畫面課表</div>
    <p className="settings-caption">顯示今日課程與下一堂課。</p>
    <div className="widget-preview-stage" aria-label="小工具外觀示意">
      <div className={`widget-preview ${display.tone === 'dark' || (display.tone === 'app' && document.documentElement.dataset.mode === 'dark') ? 'dark' : ''} ${display.style}`} style={{ '--widget-opacity': display.style === 'solid' ? 1 : display.opacity / 100 } as React.CSSProperties}>
        <div className="widget-preview-heading"><CalendarDays size={17} /><strong>今日課表</strong><RefreshCw size={16} /></div><small>海大 TAT · 外觀示意</small>
        <div className="widget-preview-course"><i /><div><strong>課程名稱</strong><span>上課時間 · 教室</span></div></div><div className="widget-preview-course alternate"><i /><div><strong>下一堂課程</strong><span>上課時間 · 教室</span></div></div>
        <div className="widget-preview-next">下一堂課與上課倒數</div>
      </div>
    </div>
    <label className="settings-row"><span>小工具背景</span><select aria-label="小工具背景" value={display.style} onChange={(e) => void change({ ...display, style: e.target.value as WidgetDisplay['style'] })}><option value="glass">半透明卡片</option><option value="solid">實色卡片</option><option value="transparent">透明背景</option></select></label>
    <label className="settings-row"><span>小工具配色</span><select aria-label="小工具配色" value={display.tone} onChange={(e) => void change({ ...display, tone: e.target.value as WidgetDisplay['tone'] })}><option value="light">白色卡片</option><option value="dark">黑色卡片</option><option value="app">跟隨 App</option></select></label>
    {display.style === 'glass' ? <label className="settings-row"><span>背景不透明度 {display.opacity}%</span><input aria-label="小工具背景不透明度" type="range" min="35" max="100" value={display.opacity} onChange={(e) => void change({ ...display, opacity: Number(e.target.value) })} /></label> : null}
    <button className="theme-reset" type="button" onClick={() => void requestTimetableWidget().then((result) => { if (!result.requested) alert('請長按手機桌面 → 小工具 → 海大 TAT 3.0 測試 → 今日課表。') }).catch(() => setError('請從手機桌面的小工具選單加入'))}>加入桌面課表小工具</button>
    <details className="widget-lock-help"><summary>鎖定畫面設定</summary><p>從手機的鎖定畫面小工具選單加入。若只有內建項目，可使用課表通知；支援項目由手機系統決定。</p>{lock.device ? <p className="widget-device-info">{lock.device} · Android {lock.androidVersion}（API {lock.sdk}）</p> : null}</details>
    <div className="settings-row"><span>鎖定畫面課表通知</span><button className="widget-notification-toggle" type="button" disabled={busy || !lock.supported} aria-pressed={lock.enabled} onClick={() => void toggleLock()}>{busy ? '處理中…' : lock.enabled ? '已開啟 · 點此關閉' : '開啟'}</button></div>
    <p className="settings-caption"><ShieldCheck size={15} />預設關閉；開啟後可在未解鎖時顯示課名、時間與教室。</p>
    {lock.supported ? <button className="theme-detail-back" type="button" onClick={() => void openTimetableNotificationSettings().catch(() => setError('請到手機設定 → 應用程式 → TAT → 通知'))}>開啟手機通知設定</button> : <p className="settings-caption">通知選項請在 Android App 內操作。</p>}
    {error ? <p className="error-banner" role="alert">{error}</p> : null}
    <button className="theme-detail-back" type="button" onClick={() => void change(defaultWidgetDisplay)}>恢復小工具預設外觀</button>
  </section>
}
