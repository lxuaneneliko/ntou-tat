import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, LockKeyhole, Palette, RotateCcw, Sun, Moon } from 'lucide-react'
import { appearancePresets, defaultAppearance, navigationLabels, presetAppearance, type Appearance, type NavigationKey } from './appearance'
export function AppearanceSettings({ value, onChange }: { value: Appearance; onChange: (value: Appearance) => void }) {
  const [details, setDetails] = useState(false)
  const changeNavigation = (index: number, key: NavigationKey) => {
    if (index >= 4 || key === 'more') return
    const next = [...value.navigation]
    const existing = next.indexOf(key)
    if (existing >= 0) [next[index], next[existing]] = [next[existing], next[index]]
    else next[index] = key
    onChange({ ...value, navigation: next })
  }
  const move = (index: number, offset: number) => { if (index + offset < 0 || index + offset >= 4) return; const next = [...value.navigation]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange({ ...value, navigation: next }) }
  const setMode = (mode: Appearance['mode']) => onChange(value.preset === 'custom'
    ? { ...value, mode, background: mode === 'dark' ? '#111b23' : '#f7f9fc', text: mode === 'dark' ? '#e8eff2' : '#20313d' }
    : presetAppearance(value.preset || 'harbor', mode, value))
  return <section className="appearance-settings">
    <div className="section-label">外觀與版面</div>
    <div className="theme-mode-switch" aria-label="明暗模式"><button type="button" aria-pressed={value.mode === 'light'} onClick={() => setMode('light')}><Sun size={17} />白天模式</button><button type="button" aria-pressed={value.mode === 'dark'} onClick={() => setMode('dark')}><Moon size={17} />夜間模式</button></div>
    {details ? <div className="theme-detail-panel"><button className="theme-detail-back" type="button" onClick={() => setDetails(false)}><ArrowLeft size={17} />返回預設配色</button><h3>詳細顏色設定</h3>
      {([['brand', '主題與頂部列'], ['background', '頁面背景'], ['text', '文字'], ['button', '按鈕與選取狀態']] as const).map(([key, label]) => <label className="settings-row" key={key}><span>{label}</span><span className="color-control"><input aria-label={label} type="color" value={value[key]} onChange={(e) => onChange({ ...value, preset: 'custom', [key]: e.target.value })} /><code>{value[key]}</code></span></label>)}
    </div> : <><div className="theme-presets">{appearancePresets.map((preset) => <button className={value.preset === preset.id ? 'selected' : ''} aria-pressed={value.preset === preset.id} key={preset.id} type="button" onClick={() => onChange(presetAppearance(preset.id, value.mode, value))}><span className="theme-swatch"><i style={{ background: value.mode === 'dark' ? '#111b23' : '#ffffff' }} /><i style={{ background: preset[value.mode] }} /></span><strong>{preset.label}</strong>{value.preset === preset.id ? <Check size={20} /> : null}</button>)}</div><button className="theme-details-entry" type="button" onClick={() => setDetails(true)}><Palette size={23} /><span><strong>進入詳細顏色設定</strong><small>自訂背景、文字與按鈕配色</small></span><ChevronRight size={20} /></button></>}
    <label className="settings-row"><span>版面風格</span><select value={value.layout} onChange={(e) => onChange({ ...value, layout: e.target.value as Appearance['layout'] })}><option value="classic">清晰線條</option><option value="soft">柔和圓角</option><option value="compact">緊湊簡約</option></select></label>
    <label className="settings-row"><span>快報自動輪播</span><input type="checkbox" aria-label="快報自動輪播" checked={value.bulletinAutoRotate !== false} onChange={(e) => onChange({ ...value, bulletinAutoRotate: e.target.checked })} /></label>
    <div className="section-label">底部功能替換與排序</div><p className="settings-caption">自訂前四個功能；「其他」固定。</p>
    <div className="navigation-editor">{value.navigation.slice(0, 4).map((key, index) => <div className="navigation-editor-row" key={index}><b>{index + 1}</b><select aria-label={`底部第 ${index + 1} 格`} value={key} onChange={(e) => changeNavigation(index, e.target.value as NavigationKey)}>{Object.entries(navigationLabels).filter(([candidate]) => candidate !== 'more').map(([candidate, label]) => <option key={candidate} value={candidate}>{label}</option>)}</select><button type="button" aria-label={`將${navigationLabels[key]}往前移`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={18} /></button><button type="button" aria-label={`將${navigationLabels[key]}往後移`} disabled={index === 3} onClick={() => move(index, 1)}><ArrowDown size={18} /></button></div>)}<div className="navigation-editor-fixed"><b>5</b><span>其他</span><LockKeyhole size={15} /><small>固定</small></div></div>
    <button className="theme-reset" type="button" onClick={() => onChange({ ...defaultAppearance, navigation: [...defaultAppearance.navigation] })}><RotateCcw size={17} />恢復預設外觀與導覽列</button>
  </section>
}
