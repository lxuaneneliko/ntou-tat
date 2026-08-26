import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Browser } from '@capacitor/browser'
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Bell,
  Download,
  File,
  Forward,
  Image as ImageIcon,
  Inbox,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MailOpen,
  MoreVertical,
  Paperclip,
  PenLine,
  RefreshCw,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import type {
  MailCredentials,
  MailBodyImage,
  MailDetail,
  MailDraft,
  MailFolder,
  MailInbox as MailPage,
  MailOutgoingAttachment,
  MailSummary,
} from './api/mail'
import { mailApi } from './api/mail'
import { mailTextTokens } from './mailLinks'
import { mailCredentialsStore } from './storage/mailCredentialsStorage'

const PAGE_SIZE = 30
const MAX_OUTGOING_BYTES = 20 * 1024 * 1024

type ComposeState = MailDraft & { mode: 'new' | 'reply' | 'forward' }

export type MailScreenHandle = {
  goBack: () => boolean
}

const emptyCompose = (): ComposeState => ({ mode: 'new', to: '', cc: '', bcc: '', subject: '', body: '', attachments: [] })

const formatMailDate = (value: string, detailed = false) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  if (detailed) return date.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

const mailErrorCode = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''

const mailErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) return String((error as { message?: unknown }).message ?? '')
  return 'Mail2000 操作失敗，請稍後重試'
}

const folderIcon = (folder?: MailFolder) => {
  if (folder?.kind === 'trash') return <Trash2 size={18} />
  if (folder?.kind === 'archive') return <Archive size={18} />
  if (folder?.kind === 'sent') return <Send size={18} />
  return <Inbox size={18} />
}

const fileSize = (bytes: number) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const fileToAttachment = (file: globalThis.File): Promise<MailOutgoingAttachment> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error(`無法讀取附件：${file.name}`))
  reader.onload = () => {
    const value = String(reader.result ?? '')
    resolve({ name: file.name, mimeType: file.type || 'application/octet-stream', data: value.split(',', 2)[1] ?? '' })
  }
  reader.readAsDataURL(file)
})

const openMailLink = async (href: string) => {
  if (/^https?:/i.test(href)) {
    await Browser.open({ url: href })
    return
  }
  if (/^(mailto:|tel:)/i.test(href)) window.location.href = href
}

export const MailScreen = forwardRef<MailScreenHandle, { studentId: string }>(function MailScreen({ studentId }, ref) {
  const [account, setAccount] = useState(studentId)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [credentials, setCredentials] = useState<MailCredentials | null>(null)
  const [folders, setFolders] = useState<MailFolder[]>([])
  const [folderId, setFolderId] = useState('INBOX')
  const [page, setPage] = useState<MailPage | null>(null)
  const [detail, setDetail] = useState<MailDetail | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [paging, setPaging] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [detailBusyUid, setDetailBusyUid] = useState<string | null>(null)
  const [failedBodyImages, setFailedBodyImages] = useState<Set<string>>(new Set())
  const [showHeaders, setShowHeaders] = useState(false)
  const [compose, setCompose] = useState<ComposeState | null>(null)
  const [showCopyFields, setShowCopyFields] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const attachmentInput = useRef<HTMLInputElement>(null)

  const currentFolder = folders.find((folder) => folder.id === folderId)

  useImperativeHandle(ref, () => ({
    goBack: () => {
      if (compose) {
        setCompose(null)
        return true
      }
      if (detail) {
        setDetail(null)
        return true
      }
      return false
    },
  }), [compose, detail])

  const handleAuthFailure = useCallback(async (loadError: unknown) => {
    if (mailErrorCode(loadError) !== 'MAIL_AUTH_FAILED') return false
    try {
      await mailApi.setNotifications(false)
    } catch {
      // Credential cleanup below remains authoritative for the signed-out UI.
    }
    await mailCredentialsStore.clear()
    setNotificationsEnabled(false)
    setCredentials(null)
    setPassword('')
    setPage(null)
    setFolders([])
    return true
  }, [])

  const loadMailbox = useCallback(async (activeCredentials: MailCredentials, requestedFolder = 'INBOX') => {
    setBusy(true)
    setError(null)
    try {
      const [{ folders: nextFolders }, nextPage] = await Promise.all([
        mailApi.listFolders(activeCredentials),
        mailApi.listMessages(activeCredentials, requestedFolder, 0, PAGE_SIZE),
      ])
      const validFolder = nextFolders.some((folder) => folder.id === requestedFolder)
      const selectedFolder = validFolder ? requestedFolder : (nextFolders.find((folder) => folder.kind === 'inbox')?.id ?? 'INBOX')
      setFolders(nextFolders)
      setFolderId(selectedFolder)
      setPage(selectedFolder === requestedFolder ? nextPage : await mailApi.listMessages(activeCredentials, selectedFolder, 0, PAGE_SIZE))
      setDetail(null)
      return true
    } catch (loadError) {
      await handleAuthFailure(loadError)
      setError(mailErrorMessage(loadError))
      return false
    } finally {
      setBusy(false)
    }
  }, [handleAuthFailure])

  useEffect(() => {
    let cancelled = false
    void mailCredentialsStore.read().then(async (stored) => {
      if (cancelled || !stored) return
      setAccount(stored.account)
      setCredentials(stored)
      await loadMailbox(stored)
    })
    return () => { cancelled = true }
  }, [loadMailbox])

  useEffect(() => {
    let cancelled = false
    void mailApi.getNotificationSettings()
      .then((settings) => {
        if (!cancelled) setNotificationsEnabled(settings.enabled)
      })
      .catch(() => {
        if (!cancelled) setNotificationsEnabled(false)
      })
    return () => { cancelled = true }
  }, [])

  const login = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextCredentials = { account: account.trim(), password }
    setBusy(true)
    setError(null)
    try {
      const result = await mailApi.login(nextCredentials)
      const normalized = { ...nextCredentials, account: result.account }
      if (remember) await mailCredentialsStore.save(normalized)
      else await mailCredentialsStore.clear()
      setAccount(result.account)
      setCredentials(normalized)
      setBusy(false)
      await loadMailbox(normalized)
    } catch (loginError) {
      setError(mailErrorMessage(loginError))
      setBusy(false)
    }
  }

  const changeFolder = async (nextFolder: string) => {
    if (!credentials || nextFolder === folderId) return
    setFolderId(nextFolder)
    setBusy(true)
    setError(null)
    setQuery('')
    try {
      setPage(await mailApi.listMessages(credentials, nextFolder, 0, PAGE_SIZE))
      setDetail(null)
    } catch (loadError) {
      await handleAuthFailure(loadError)
      setError(mailErrorMessage(loadError))
    } finally {
      setBusy(false)
    }
  }

  const loadMore = async () => {
    if (!credentials || !page?.hasMore || paging) return
    setPaging(true)
    setError(null)
    try {
      const next = await mailApi.listMessages(credentials, folderId, page.nextOffset, PAGE_SIZE)
      setPage({ ...next, messages: [...page.messages, ...next.messages] })
    } catch (loadError) {
      await handleAuthFailure(loadError)
      setError(mailErrorMessage(loadError))
    } finally {
      setPaging(false)
    }
  }

  const updateSummary = (uid: string, changes: Partial<MailSummary>, remove = false) => {
    setPage((current) => current ? {
      ...current,
      messages: remove ? current.messages.filter((message) => message.uid !== uid) : current.messages.map((message) => message.uid === uid ? { ...message, ...changes } : message),
      total: remove ? Math.max(0, current.total - 1) : current.total,
      unread: changes.unread === false ? Math.max(0, current.unread - 1) : current.unread,
    } : current)
  }

  const openMessage = async (message: MailSummary) => {
    if (!credentials || detailBusyUid) return
    setDetailBusyUid(message.uid)
    setError(null)
    try {
      const nextDetail = await mailApi.getMessage(credentials, folderId, message.uid)
      setDetail(nextDetail)
      setFailedBodyImages(new Set())
      setShowHeaders(false)
      if (message.unread) updateSummary(message.uid, { unread: false })
    } catch (loadError) {
      await handleAuthFailure(loadError)
      setError(mailErrorMessage(loadError))
    } finally {
      setDetailBusyUid(null)
    }
  }

  const toggleStar = async (message: MailSummary | MailDetail) => {
    if (!credentials || actionBusy) return
    const nextValue = !message.starred
    setActionBusy(true)
    try {
      await mailApi.setFlag(credentials, folderId, message.uid, 'flagged', nextValue)
      updateSummary(message.uid, { starred: nextValue })
      setDetail((current) => current?.uid === message.uid ? { ...current, starred: nextValue } : current)
    } catch (actionError) {
      setError(mailErrorMessage(actionError))
    } finally {
      setActionBusy(false)
    }
  }

  const markUnread = async () => {
    if (!credentials || !detail || actionBusy) return
    setActionBusy(true)
    try {
      await mailApi.setFlag(credentials, folderId, detail.uid, 'seen', false)
      updateSummary(detail.uid, { unread: true })
      setDetail(null)
    } catch (actionError) {
      setError(mailErrorMessage(actionError))
    } finally {
      setActionBusy(false)
    }
  }

  const moveCurrent = async (targetFolder: string) => {
    if (!credentials || !detail || !targetFolder || targetFolder === folderId || actionBusy) return
    setActionBusy(true)
    try {
      await mailApi.moveMessage(credentials, folderId, detail.uid, targetFolder)
      updateSummary(detail.uid, {}, true)
      setDetail(null)
      setNotice('信件已移動')
    } catch (actionError) {
      setError(mailErrorMessage(actionError))
    } finally {
      setActionBusy(false)
    }
  }

  const trashCurrent = () => {
    const trash = folders.find((folder) => folder.kind === 'trash')
    if (!trash) {
      setError('Mail2000 沒有提供可用的垃圾桶資料夾')
      return
    }
    if (confirm('要將這封信移到垃圾桶嗎？')) void moveCurrent(trash.id)
  }

  const startReply = () => {
    if (!detail) return
    const replyTarget = detail.replyTo[0] || detail.senderAddress
    const subject = /^re:/i.test(detail.subject) ? detail.subject : `Re: ${detail.subject}`
    setCompose({
      mode: 'reply', to: replyTarget, subject, cc: '', bcc: '', body: '', attachments: [],
      inReplyTo: detail.messageId,
      references: `${detail.references} ${detail.messageId}`.trim(),
    })
  }

  const startForward = () => {
    if (!detail) return
    const subject = /^fwd?:/i.test(detail.subject) ? detail.subject : `Fwd: ${detail.subject}`
    const quoted = `\n\n---------- 轉寄的郵件 ----------\n寄件者：${detail.sender} <${detail.senderAddress}>\n日期：${formatMailDate(detail.receivedAt, true)}\n主旨：${detail.subject}\n收件人：${detail.recipients.join('、')}\n\n${detail.body}`
    setCompose({ mode: 'forward', to: '', subject, cc: '', bcc: '', body: quoted, attachments: [] })
  }

  const addAttachments = async (files: FileList | null) => {
    if (!compose || !files?.length) return
    const selected = [...files]
    const existingBytes = (compose.attachments ?? []).reduce((total, item) => total + Math.ceil(item.data.length * 0.75), 0)
    const addedBytes = selected.reduce((total, file) => total + file.size, 0)
    if (existingBytes + addedBytes > MAX_OUTGOING_BYTES) {
      setError('附件總大小不可超過 20 MB')
      return
    }
    try {
      const additions = await Promise.all(selected.map(fileToAttachment))
      setCompose((current) => current ? { ...current, attachments: [...(current.attachments ?? []), ...additions] } : current)
    } catch (attachmentError) {
      setError(mailErrorMessage(attachmentError))
    }
  }

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!credentials || !compose || actionBusy) return
    if (!compose.to.trim()) {
      setError('請輸入收件人')
      return
    }
    setActionBusy(true)
    setError(null)
    try {
      await mailApi.sendMessage(credentials, compose)
      setCompose(null)
      setNotice('信件已寄出')
    } catch (sendError) {
      await handleAuthFailure(sendError)
      setError(mailErrorMessage(sendError))
    } finally {
      setActionBusy(false)
    }
  }

  const toggleNotifications = async () => {
    if (!credentials || notificationBusy) return
    const nextEnabled = !notificationsEnabled
    setNotificationBusy(true)
    setError(null)
    try {
      const settings = await mailApi.setNotifications(nextEnabled, nextEnabled ? credentials : undefined)
      setNotificationsEnabled(settings.enabled)
      if (settings.enabled) {
        await mailCredentialsStore.save(credentials)
        setRemember(true)
        setNotice('新信通知已開啟；背景會定期檢查 Mail2000')
      } else {
        setNotice('新信通知已關閉')
      }
    } catch (notificationError) {
      setNotificationsEnabled(false)
      setError(mailErrorMessage(notificationError))
    } finally {
      setNotificationBusy(false)
    }
  }

  const logoutMail = async () => {
    try {
      await mailApi.setNotifications(false)
    } catch {
      // Signing out still clears the local credentials if background work is unavailable.
    }
    await mailCredentialsStore.clear()
    setNotificationsEnabled(false)
    setCredentials(null)
    setPage(null)
    setFolders([])
    setDetail(null)
    setPassword('')
    setError(null)
  }

  const visibleMessages = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-TW')
    if (!needle) return page?.messages ?? []
    return (page?.messages ?? []).filter((message) => `${message.sender} ${message.senderAddress} ${message.subject}`.toLocaleLowerCase('zh-TW').includes(needle))
  }, [page?.messages, query])

  if (!credentials) {
    return (
      <section className="mail-screen mail-login-screen">
        <div className="mail-account-strip">
          <span className="mail-account-icon"><Mail size={25} /></span>
          <div><strong>登入 Mail2000</strong><span>信箱密碼與 AIS 密碼分開輸入</span></div>
        </div>
        <form className="mail-login-form" onSubmit={(event) => void login(event)}>
          <label><span>信箱帳號</span><div className="mail-account-input">
            <input autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} />
            <span>@mail.ntou.edu.tw</span>
          </div></label>
          <label><span>Mail2000 密碼</span><input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="mail-remember-row"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>加密儲存這組信箱登入</span></label>
          {error ? <div className="error-banner mail-error"><AlertCircle size={18} /><span>{error}</span></div> : null}
          <button className="mail-login-button" type="submit" disabled={busy || !account.trim() || !password}>
            {busy ? <Loader2 className="spin" size={20} /> : <KeyRound size={20} />}<span>{busy ? '登入中' : '登入信箱'}</span>
          </button>
        </form>
        <div className="mail-privacy-row"><ShieldCheck size={18} /><span>信箱帳密獨立存放於本機安全區，不會傳到海大 TAT 伺服器</span></div>
      </section>
    )
  }

  if (compose) {
    return (
      <section className="mail-screen mail-compose-screen">
        <div className="mail-detail-toolbar mail-compose-toolbar">
          <button type="button" aria-label="關閉撰寫" onClick={() => setCompose(null)}><X size={22} /></button>
          <strong>{compose.mode === 'reply' ? '回覆' : compose.mode === 'forward' ? '轉寄' : '新增郵件'}</strong>
          <button className="mail-send-icon" type="submit" form="mail-compose-form" aria-label="寄出" disabled={actionBusy}>
            {actionBusy ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
          </button>
        </div>
        <form id="mail-compose-form" className="mail-compose-form" onSubmit={(event) => void sendMessage(event)}>
          <label className="mail-compose-line"><span>收件人</span><input autoComplete="off" inputMode="email" value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} /><button type="button" aria-label="顯示副本與密件副本" onClick={() => setShowCopyFields(!showCopyFields)}><MoreVertical size={18} /></button></label>
          {showCopyFields || compose.cc || compose.bcc ? <>
            <label className="mail-compose-line"><span>副本</span><input autoComplete="off" inputMode="email" value={compose.cc} onChange={(event) => setCompose({ ...compose, cc: event.target.value })} /></label>
            <label className="mail-compose-line"><span>密件副本</span><input autoComplete="off" inputMode="email" value={compose.bcc} onChange={(event) => setCompose({ ...compose, bcc: event.target.value })} /></label>
          </> : null}
          <label className="mail-compose-line"><span>主旨</span><input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} /></label>
          <textarea aria-label="郵件內容" placeholder="輸入郵件內容" value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} />
          {(compose.attachments ?? []).length ? <div className="mail-compose-attachments">
            {(compose.attachments ?? []).map((attachment, index) => <span key={`${attachment.name}-${index}`}><Paperclip size={15} />{attachment.name}<button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setCompose({ ...compose, attachments: compose.attachments?.filter((_, itemIndex) => itemIndex !== index) })}><X size={15} /></button></span>)}
          </div> : null}
          <input ref={attachmentInput} className="mail-file-input" type="file" multiple onChange={(event) => void addAttachments(event.target.files)} />
          <div className="mail-compose-actions"><button type="button" onClick={() => attachmentInput.current?.click()}><Paperclip size={18} /><span>加入附件</span></button><span>上限 20 MB</span></div>
          {error ? <div className="error-banner mail-error"><AlertCircle size={18} /><span>{error}</span></div> : null}
        </form>
      </section>
    )
  }

  if (detail) {
    return (
      <section className="mail-screen mail-detail-screen">
        <div className="mail-detail-toolbar">
          <button type="button" aria-label="返回信箱" onClick={() => setDetail(null)}><ArrowLeft size={22} /></button>
          <span className="mail-detail-toolbar-title">信件內容</span>
          <button type="button" aria-label={detail.starred ? '取消星號' : '加上星號'} onClick={() => void toggleStar(detail)}><Star className={detail.starred ? 'mail-starred' : ''} fill={detail.starred ? 'currentColor' : 'none'} size={20} /></button>
          <button type="button" aria-label="標示未讀" onClick={() => void markUnread()}><MailOpen size={20} /></button>
          <button type="button" aria-label="移到垃圾桶" onClick={trashCurrent}><Trash2 size={20} /></button>
        </div>
        {error ? <div className="error-banner mail-error"><AlertCircle size={18} /><span>{error}</span></div> : null}
        <article className="mail-detail">
          <h2>{detail.subject || '（無主旨）'}</h2>
          <div className="mail-detail-sender">
            <span className="mail-sender-avatar">{(detail.sender || '?').slice(0, 1).toUpperCase()}</span>
            <button type="button" onClick={() => setShowHeaders(!showHeaders)}>
              <strong>{detail.sender}</strong><span>{detail.senderAddress}</span>
            </button>
            <time>{formatMailDate(detail.receivedAt, true)}</time>
          </div>
          {showHeaders ? <div className="mail-headers">
            <span>收件人：{detail.recipients.join('、') || '未提供'}</span>
            {detail.cc.length ? <span>副本：{detail.cc.join('、')}</span> : null}
            <span>寄件時間：{formatMailDate(detail.receivedAt, true)}</span>
          </div> : null}
          <div className="mail-detail-actions">
            <button type="button" onClick={startReply}><Reply size={17} /><span>回覆</span></button>
            <button type="button" onClick={startForward}><Forward size={17} /><span>轉寄</span></button>
            <label><span className="sr-only">移動郵件</span><select aria-label="移動郵件" value="" onChange={(event) => void moveCurrent(event.target.value)}><option value="">移動到…</option>{folders.filter((folder) => folder.id !== folderId).map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
          </div>
          <div className="mail-body">{mailTextTokens(detail.body || '（這封信沒有可顯示的文字內容）').map((token, index) => token.type === 'link' ? <a href={token.href} key={`${index}-${token.href}`} rel="noreferrer" onClick={(event) => { event.preventDefault(); void openMailLink(token.href) }}>{token.value}</a> : <span key={`${index}-text`}>{token.value}</span>)}</div>
          {detail.bodyImages.length ? <div className="mail-body-images">
            <strong><ImageIcon size={18} />信件圖片（{detail.bodyImages.length}）</strong>
            {detail.bodyImages.map((image: MailBodyImage) => failedBodyImages.has(image.id) ? (
              <button className="mail-body-image-fallback" type="button" key={image.id} onClick={() => image.external && void openMailLink(image.src)}>
                <ImageIcon size={22} /><span><b>{image.name}</b><small>{image.external ? '圖片無法直接載入，點此開啟原始連結' : '圖片資料無法顯示'}</small></span>
              </button>
            ) : (
              <figure key={image.id}>
                <img src={image.src} alt={image.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedBodyImages((current) => new Set(current).add(image.id))} />
                <figcaption>{image.name}</figcaption>
              </figure>
            ))}
          </div> : null}
          {detail.attachments.length ? <div className="mail-attachments"><strong>附件（{detail.attachments.length}）</strong>{detail.attachments.map((attachment) => <button type="button" key={attachment.id} onClick={() => credentials && void mailApi.openAttachment(credentials, folderId, detail.uid, attachment.id).catch((attachmentError) => setError(mailErrorMessage(attachmentError)))}><File size={19} /><span><b>{attachment.name}</b><small>{attachment.mimeType}{attachment.size ? ` · ${fileSize(attachment.size)}` : ''}</small></span><Download size={18} /></button>)}</div> : null}
        </article>
      </section>
    )
  }

  return (
    <section className="mail-screen">
      <div className="mail-account-strip">
        <span className="mail-account-icon"><Mail size={25} /></span>
        <div><strong>Mail2000</strong><span>{page?.account ?? credentials.account}@mail.ntou.edu.tw</span></div>
        <div className="mail-account-actions">
          <button
            className={notificationsEnabled ? 'mail-notification-button active' : 'mail-notification-button'}
            type="button"
            aria-label={notificationsEnabled ? '關閉新信通知' : '開啟新信通知'}
            aria-pressed={notificationsEnabled}
            title={notificationsEnabled ? '新信通知：已開啟' : '新信通知：已關閉'}
            disabled={notificationBusy}
            onClick={() => void toggleNotifications()}
          >
            {notificationBusy ? <Loader2 className="spin" size={19} /> : <Bell fill={notificationsEnabled ? 'currentColor' : 'none'} size={19} />}
          </button>
          <button type="button" aria-label="新增郵件" onClick={() => setCompose(emptyCompose())}><PenLine size={20} /></button>
          <button type="button" aria-label="重新整理" disabled={busy} onClick={() => void loadMailbox(credentials, folderId)}><RefreshCw className={busy ? 'spin' : ''} size={20} /></button>
          <button type="button" aria-label="登出信箱" onClick={() => void logoutMail()}><LogOut size={20} /></button>
        </div>
      </div>
      <div className="mail-folder-bar">
        {folderIcon(currentFolder)}
        <select aria-label="郵件資料夾" value={folderId} onChange={(event) => void changeFolder(event.target.value)}>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}（{folder.unread}/{folder.total}）</option>)}</select>
        <span>{page ? `${page.unread} 未讀 · ${page.total} 封` : ''}</span>
      </div>
      <label className="mail-search"><Search size={17} /><input aria-label="搜尋已載入郵件" placeholder="搜尋已載入的信件" value={query} onChange={(event) => setQuery(event.target.value)} />{query ? <button type="button" aria-label="清除搜尋" onClick={() => setQuery('')}><X size={16} /></button> : null}</label>
      {error ? <div className="error-banner mail-error"><AlertCircle size={18} /><span>{error}</span></div> : null}
      {notice ? <button className="mail-notice" type="button" onClick={() => setNotice(null)}>{notice}</button> : null}
      {busy && !page ? <div className="mail-loading"><Loader2 className="spin" size={28} /><span>正在讀取信箱</span></div> : visibleMessages.length ? <>
        <div className="mail-message-list">{visibleMessages.map((message) => <div className={message.unread ? 'mail-message-row unread' : 'mail-message-row'} key={message.uid}>
          <button className="mail-message-open" type="button" disabled={detailBusyUid !== null} onClick={() => void openMessage(message)}>
            <span className="mail-unread-dot" aria-hidden="true" /><span className="mail-sender-avatar">{(message.sender || '?').slice(0, 1).toUpperCase()}</span><span className="mail-message-copy"><strong>{message.sender}</strong><span>{message.subject || '（無主旨）'}</span></span><time>{detailBusyUid === message.uid ? <Loader2 className="spin" size={16} /> : formatMailDate(message.receivedAt)}</time>
          </button>
          <button className={message.starred ? 'mail-row-star mail-starred' : 'mail-row-star'} type="button" aria-label={message.starred ? '取消星號' : '加上星號'} onClick={() => void toggleStar(message)}><Star fill={message.starred ? 'currentColor' : 'none'} size={18} /></button>
        </div>)}</div>
        {!query && page?.hasMore ? <button className="mail-load-more" type="button" disabled={paging} onClick={() => void loadMore()}>{paging ? <Loader2 className="spin" size={18} /> : null}<span>{paging ? '載入中' : `載入更早郵件（已顯示 ${page.messages.length} 封）`}</span></button> : null}
      </> : page ? <div className="mail-empty"><Inbox size={36} /><span>{query ? '找不到相符郵件' : '這個資料夾沒有信件'}</span></div> : null}
      <button className="mail-compose-fab" type="button" aria-label="新增郵件" onClick={() => setCompose(emptyCompose())}><PenLine size={22} /></button>
    </section>
  )
})
