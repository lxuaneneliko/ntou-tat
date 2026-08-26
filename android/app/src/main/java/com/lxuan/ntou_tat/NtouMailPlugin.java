package com.lxuan.ntou_tat;

import android.Manifest;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.text.Spanned;
import android.text.style.ImageSpan;
import android.text.style.URLSpan;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import jakarta.activation.DataHandler;
import jakarta.mail.Address;
import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.FetchProfile;
import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.Transport;
import jakarta.mail.UIDFolder;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import jakarta.mail.internet.MimeUtility;
import jakarta.mail.util.ByteArrayDataSource;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "NtouMail",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class NtouMailPlugin extends Plugin {

    private static final String HOST = "mail.ntou.edu.tw";
    private static final int IMAP_PORT = 993;
    private static final int SMTP_PORT = 465;
    private static final int MAX_PAGE_SIZE = 50;
    private static final int MAX_BODY_CHARACTERS = 2_000_000;
    private static final int MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
    private static final int MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
    private static final int MAX_OUTGOING_BYTES = 20 * 1024 * 1024;

    @PluginMethod
    public void login(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        getBridge().execute(() -> {
            Store store = null;
            try {
                store = connect(credentials);
                JSObject result = new JSObject();
                result.put("account", credentials.account);
                call.resolve(result);
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeStore(store);
            }
        });
    }

    @PluginMethod
    public void getNotificationSettings(PluginCall call) {
        call.resolve(notificationSettingsJson());
    }

    @PluginMethod
    public void setNotifications(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (!enabled) {
            MailNotificationWorker.disable(getContext());
            call.resolve(notificationSettingsJson());
            return;
        }

        if (readCredentials(call) == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && !MailNotificationWorker.canPostNotifications(getContext())) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        enableNotifications(call);
    }

    @PermissionCallback
    public void notificationPermissionCallback(PluginCall call) {
        if (!MailNotificationWorker.canPostNotifications(getContext())) {
            MailNotificationWorker.disable(getContext());
            call.reject("未允許通知權限，Mail2000 新信通知仍為關閉", "MAIL_NOTIFICATION_PERMISSION_DENIED");
            return;
        }
        enableNotifications(call);
    }

    @PluginMethod
    public void listFolders(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        getBridge().execute(() -> {
            Store store = null;
            try {
                store = connect(credentials);
                Folder[] folders = store.getDefaultFolder().list("*");
                Arrays.sort(folders, Comparator.comparingInt(this::folderOrder).thenComparing(Folder::getFullName));
                JSArray items = new JSArray();
                for (Folder folder : folders) {
                    if ((folder.getType() & Folder.HOLDS_MESSAGES) == 0) continue;
                    JSObject item = new JSObject();
                    item.put("id", folder.getFullName());
                    item.put("name", folderLabel(folder));
                    item.put("kind", folderKind(folder.getFullName()));
                    item.put("unread", Math.max(0, folder.getUnreadMessageCount()));
                    item.put("total", Math.max(0, folder.getMessageCount()));
                    items.put(item);
                }
                JSObject result = new JSObject();
                result.put("folders", items);
                call.resolve(result);
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeStore(store);
            }
        });
    }

    @PluginMethod
    public void listMessages(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        String folderName = readFolderName(call);
        int limit = Math.max(1, Math.min(MAX_PAGE_SIZE, call.getInt("limit", 30)));
        int offset = Math.max(0, call.getInt("offset", 0));

        getBridge().execute(() -> {
            Store store = null;
            Folder folder = null;
            try {
                store = connect(credentials);
                folder = openFolder(store, folderName, Folder.READ_ONLY);
                int total = folder.getMessageCount();
                int end = total - offset;
                int start = Math.max(1, end - limit + 1);
                Message[] messages = end < 1 ? new Message[0] : folder.getMessages(start, end);
                FetchProfile profile = new FetchProfile();
                profile.add(FetchProfile.Item.ENVELOPE);
                profile.add(FetchProfile.Item.FLAGS);
                profile.add(UIDFolder.FetchProfileItem.UID);
                folder.fetch(messages, profile);

                JSArray items = new JSArray();
                UIDFolder uidFolder = asUidFolder(folder);
                for (int index = messages.length - 1; index >= 0; index--) {
                    items.put(summaryJson(messages[index], uidFolder.getUID(messages[index])));
                }

                JSObject result = new JSObject();
                result.put("account", credentials.account);
                result.put("folder", folderName);
                result.put("total", total);
                result.put("unread", Math.max(0, folder.getUnreadMessageCount()));
                result.put("offset", offset);
                result.put("nextOffset", offset + messages.length);
                result.put("hasMore", start > 1);
                result.put("messages", items);
                call.resolve(result);
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeFolder(folder, false);
                closeStore(store);
            }
        });
    }

    @PluginMethod
    public void getMessage(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        String folderName = readFolderName(call);
        Long uid = readUid(call);
        if (uid == null) return;

        getBridge().execute(() -> {
            Store store = null;
            Folder folder = null;
            try {
                store = connect(credentials);
                folder = openFolder(store, folderName, Folder.READ_WRITE);
                Message message = findMessage(folder, uid);
                message.setFlag(Flags.Flag.SEEN, true);
                BodyContent content = readContent(message);
                JSObject result = summaryJson(message, uid);
                result.put("unread", false);
                result.put("recipients", addressesJson(message.getRecipients(Message.RecipientType.TO)));
                result.put("cc", addressesJson(message.getRecipients(Message.RecipientType.CC)));
                result.put("replyTo", addressesJson(message.getReplyTo()));
                result.put("messageId", firstHeader(message, "Message-ID"));
                result.put("references", firstHeader(message, "References"));
                result.put("body", trimBody(content.text));
                BodyPresentation presentation = bodyPresentation(message, content.html, content.text);
                result.put("bodyImages", presentation.images);
                result.put("bodyBlocks", presentation.blocks);
                result.put("attachments", attachmentMetadata(message));
                call.resolve(result);
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeFolder(folder, false);
                closeStore(store);
            }
        });
    }

    @PluginMethod
    public void setFlag(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        String folderName = readFolderName(call);
        Long uid = readUid(call);
        if (uid == null) return;
        String flagName = call.getString("flag", "");
        boolean value = Boolean.TRUE.equals(call.getBoolean("value", false));
        Flags.Flag flag = "seen".equals(flagName) ? Flags.Flag.SEEN : "flagged".equals(flagName) ? Flags.Flag.FLAGGED : null;
        if (flag == null) {
            call.reject("不支援的信件狀態", "MAIL_FLAG_INVALID");
            return;
        }

        getBridge().execute(() -> {
            Store store = null;
            Folder folder = null;
            try {
                store = connect(credentials);
                folder = openFolder(store, folderName, Folder.READ_WRITE);
                Message message = findMessage(folder, uid);
                message.setFlag(flag, value);
                call.resolve(summaryJson(message, uid));
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeFolder(folder, false);
                closeStore(store);
            }
        });
    }

    @PluginMethod
    public void moveMessage(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        String sourceName = readFolderName(call);
        String targetName = normalizeFolderName(call.getString("targetFolder"));
        Long uid = readUid(call);
        if (uid == null) return;
        if (targetName.isEmpty() || sourceName.equals(targetName)) {
            call.reject("請選擇其他郵件資料夾", "MAIL_FOLDER_INVALID");
            return;
        }

        getBridge().execute(() -> {
            Store store = null;
            Folder source = null;
            try {
                store = connect(credentials);
                source = openFolder(store, sourceName, Folder.READ_WRITE);
                Folder target = store.getFolder(targetName);
                if (!target.exists() || (target.getType() & Folder.HOLDS_MESSAGES) == 0) throw new MessagingException("Target folder does not exist");
                Message message = findMessage(source, uid);
                source.copyMessages(new Message[] { message }, target);
                message.setFlag(Flags.Flag.DELETED, true);
                source.close(true);
                source = null;
                call.resolve();
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeFolder(source, false);
                closeStore(store);
            }
        });
    }

    @PluginMethod
    public void openAttachment(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        String folderName = readFolderName(call);
        Long uid = readUid(call);
        if (uid == null) return;
        String partId = call.getString("partId", "");
        if (!partId.matches("\\d+(\\.\\d+)*")) {
            call.reject("附件識別碼無效", "MAIL_ATTACHMENT_INVALID");
            return;
        }

        getBridge().execute(() -> {
            Store store = null;
            Folder folder = null;
            try {
                store = connect(credentials);
                folder = openFolder(store, folderName, Folder.READ_ONLY);
                Part part = findPart(findMessage(folder, uid), partId);
                if (part == null || !isDownloadablePart(part)) {
                    call.reject("找不到這個附件", "MAIL_ATTACHMENT_NOT_FOUND");
                    return;
                }
                byte[] bytes = readBytes(part.getInputStream(), MAX_ATTACHMENT_BYTES);
                String fileName = safeFileName(decodeHeader(part.getFileName(), "attachment"));
                String mimeType = baseMimeType(part.getContentType());
                File directory = new File(getContext().getCacheDir(), "mail_attachments");
                if (!directory.exists() && !directory.mkdirs()) throw new IOException("Unable to create attachment directory");
                File file = new File(directory, System.currentTimeMillis() + "-" + fileName);
                try (FileOutputStream output = new FileOutputStream(file)) {
                    output.write(bytes);
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, mimeType);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(Intent.createChooser(intent, "開啟附件"));
                        call.resolve();
                    } catch (Exception exception) {
                        call.reject("手機沒有可以開啟此附件的 App", "MAIL_ATTACHMENT_APP_MISSING", exception);
                    }
                });
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeFolder(folder, false);
                closeStore(store);
            }
        });
    }

    @PluginMethod
    public void sendMessage(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        String to = call.getString("to", "").trim();
        String cc = call.getString("cc", "").trim();
        String bcc = call.getString("bcc", "").trim();
        String subject = call.getString("subject", "").trim();
        String body = call.getString("body", "");
        String inReplyTo = call.getString("inReplyTo", "").trim();
        String references = call.getString("references", "").trim();
        JSArray attachments = call.getArray("attachments", new JSArray());
        if (to.isEmpty()) {
            call.reject("請輸入收件人", "MAIL_RECIPIENT_REQUIRED");
            return;
        }

        getBridge().execute(() -> {
            Transport transport = null;
            try {
                Session session = createSession();
                MimeMessage message = new MimeMessage(session);
                message.setFrom(new InternetAddress(credentials.account + "@mail.ntou.edu.tw"));
                addRecipients(message, Message.RecipientType.TO, to);
                addRecipients(message, Message.RecipientType.CC, cc);
                addRecipients(message, Message.RecipientType.BCC, bcc);
                message.setSubject(subject.isEmpty() ? "（無主旨）" : subject, "UTF-8");
                message.setSentDate(new Date());
                if (!inReplyTo.isEmpty()) message.setHeader("In-Reply-To", inReplyTo);
                if (!references.isEmpty()) message.setHeader("References", references);
                setOutgoingContent(message, body, attachments);
                message.saveChanges();
                transport = session.getTransport("smtps");
                transport.connect(HOST, SMTP_PORT, credentials.account, credentials.password);
                transport.sendMessage(message, message.getAllRecipients());
                appendSentCopy(credentials, message);
                call.resolve();
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                if (transport != null && transport.isConnected()) {
                    try {
                        transport.close();
                    } catch (MessagingException ignored) {
                    }
                }
            }
        });
    }

    private Credentials readCredentials(PluginCall call) {
        String account = normalizeAccount(call.getString("account"));
        String password = call.getString("password");
        if (account.isEmpty() || password == null || password.isEmpty()) {
            call.reject("請輸入 Mail2000 帳號與密碼", "MAIL_CREDENTIALS_REQUIRED");
            return null;
        }
        if (!account.matches("[A-Za-z0-9._-]+")) {
            call.reject("Mail2000 帳號格式不正確", "MAIL_ACCOUNT_INVALID");
            return null;
        }
        return new Credentials(account, password);
    }

    private void enableNotifications(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        getBridge().execute(() -> {
            Store store = null;
            Folder folder = null;
            try {
                store = connect(credentials);
                folder = openFolder(store, "INBOX", Folder.READ_ONLY);
                UIDFolder uidFolder = asUidFolder(folder);
                int count = folder.getMessageCount();
                long latestUid = count > 0 ? uidFolder.getUID(folder.getMessage(count)) : 0L;
                long uidValidity = uidFolder.getUIDValidity();
                MailNotificationWorker.enable(
                    getContext(),
                    credentials.account,
                    credentials.password,
                    latestUid,
                    uidValidity
                );
                call.resolve(notificationSettingsJson());
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeFolder(folder, false);
                closeStore(store);
            }
        });
    }

    private JSObject notificationSettingsJson() {
        boolean permissionGranted = MailNotificationWorker.canPostNotifications(getContext());
        if (!permissionGranted && MailNotificationWorker.isEnabled(getContext())) {
            MailNotificationWorker.disable(getContext());
        }
        JSObject result = new JSObject();
        result.put("enabled", MailNotificationWorker.isEnabled(getContext()) && permissionGranted);
        result.put("permissionGranted", permissionGranted);
        return result;
    }

    private Session createSession() {
        Properties properties = new Properties();
        properties.setProperty("mail.imaps.host", HOST);
        properties.setProperty("mail.imaps.port", String.valueOf(IMAP_PORT));
        properties.setProperty("mail.imaps.auth", "true");
        properties.setProperty("mail.imaps.ssl.enable", "true");
        properties.setProperty("mail.imaps.ssl.checkserveridentity", "true");
        properties.setProperty("mail.imaps.connectiontimeout", "20000");
        properties.setProperty("mail.imaps.timeout", "30000");
        properties.setProperty("mail.imaps.writetimeout", "30000");
        properties.setProperty("mail.smtps.host", HOST);
        properties.setProperty("mail.smtps.port", String.valueOf(SMTP_PORT));
        properties.setProperty("mail.smtps.auth", "true");
        properties.setProperty("mail.smtps.ssl.enable", "true");
        properties.setProperty("mail.smtps.ssl.checkserveridentity", "true");
        properties.setProperty("mail.smtps.connectiontimeout", "20000");
        properties.setProperty("mail.smtps.timeout", "30000");
        properties.setProperty("mail.smtps.writetimeout", "30000");
        properties.setProperty("mail.mime.address.strict", "false");
        properties.setProperty("mail.debug", "false");
        Session session = Session.getInstance(properties);
        session.setDebug(false);
        return session;
    }

    private Store connect(Credentials credentials) throws MessagingException {
        Store store = createSession().getStore("imaps");
        store.connect(HOST, IMAP_PORT, credentials.account, credentials.password);
        return store;
    }

    private void appendSentCopy(Credentials credentials, MimeMessage message) {
        Store store = null;
        Folder sentFolder = null;
        try {
            store = connect(credentials);
            for (Folder folder : store.getDefaultFolder().list("*")) {
                if ((folder.getType() & Folder.HOLDS_MESSAGES) != 0 && "sent".equals(folderKind(folder.getFullName()))) {
                    sentFolder = folder;
                    break;
                }
            }
            if (sentFolder == null) return;
            sentFolder.open(Folder.READ_WRITE);
            message.setFlag(Flags.Flag.SEEN, true);
            sentFolder.appendMessages(new Message[] { message });
        } catch (Exception ignored) {
            // SMTP delivery succeeded; a server without a writable Sent folder must not report a false send failure.
        } finally {
            closeFolder(sentFolder, false);
            closeStore(store);
        }
    }

    private Folder openFolder(Store store, String folderName, int mode) throws MessagingException {
        Folder folder = store.getFolder(folderName);
        if (!folder.exists() || (folder.getType() & Folder.HOLDS_MESSAGES) == 0) throw new MessagingException("Mailbox folder does not exist");
        folder.open(mode);
        return folder;
    }

    private UIDFolder asUidFolder(Folder folder) throws MessagingException {
        if (!(folder instanceof UIDFolder)) throw new MessagingException("Mailbox does not support stable message identifiers");
        return (UIDFolder) folder;
    }

    private Message findMessage(Folder folder, long uid) throws MessagingException {
        Message message = asUidFolder(folder).getMessageByUID(uid);
        if (message == null) throw new MessagingException("Message not found");
        return message;
    }

    private String readFolderName(PluginCall call) {
        String value = normalizeFolderName(call.getString("folder"));
        return value.isEmpty() ? "INBOX" : value;
    }

    private String normalizeFolderName(String value) {
        if (value == null) return "";
        String folder = value.trim();
        return folder.length() <= 240 && folder.indexOf('\0') < 0 ? folder : "";
    }

    private Long readUid(PluginCall call) {
        try {
            return Long.parseLong(call.getString("uid", ""));
        } catch (NumberFormatException exception) {
            call.reject("信件識別碼無效", "MAIL_MESSAGE_INVALID");
            return null;
        }
    }

    private JSObject summaryJson(Message message, long uid) throws MessagingException {
        AddressInfo sender = firstAddress(message.getFrom());
        JSObject result = new JSObject();
        result.put("uid", String.valueOf(uid));
        result.put("subject", decodeHeader(message.getSubject(), "（無主旨）"));
        result.put("sender", sender.name);
        result.put("senderAddress", sender.address);
        result.put("receivedAt", formatDate(message.getReceivedDate() != null ? message.getReceivedDate() : message.getSentDate()));
        result.put("unread", !message.getFlags().contains(Flags.Flag.SEEN));
        result.put("starred", message.getFlags().contains(Flags.Flag.FLAGGED));
        return result;
    }

    private BodyContent readContent(Part part) throws MessagingException, IOException {
        if (isDownloadablePart(part)) return new BodyContent();
        if (part.isMimeType("text/plain")) {
            Object content = part.getContent();
            return new BodyContent(content instanceof String ? (String) content : "", "");
        }
        if (part.isMimeType("text/html")) {
            Object content = part.getContent();
            String html = content instanceof String ? (String) content : "";
            return new BodyContent(htmlToText(html), html);
        }
        if (part.isMimeType("multipart/alternative")) {
            Multipart multipart = (Multipart) part.getContent();
            BodyContent merged = new BodyContent();
            for (int index = 0; index < multipart.getCount(); index++) {
                BodyContent child = readContent(multipart.getBodyPart(index));
                if (!child.text.trim().isEmpty()) merged.text = child.text;
                if (!child.html.trim().isEmpty()) merged.html = child.html;
            }
            return merged;
        }
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            BodyContent merged = new BodyContent();
            for (int index = 0; index < multipart.getCount(); index++) {
                merged.append(readContent(multipart.getBodyPart(index)));
                if (merged.text.length() >= MAX_BODY_CHARACTERS && merged.html.length() >= MAX_BODY_CHARACTERS) break;
            }
            return merged;
        }
        if (part.isMimeType("message/rfc822")) {
            Object content = part.getContent();
            return content instanceof Part ? readContent((Part) content) : new BodyContent();
        }
        return new BodyContent();
    }

    private JSArray attachmentMetadata(Part root) throws MessagingException, IOException {
        JSArray items = new JSArray();
        collectAttachments(root, "", items);
        return items;
    }

    private void collectAttachments(Part part, String partId, JSArray items) throws MessagingException, IOException {
        boolean inlineBodyImage = part.isMimeType("image/*") && (
            Part.INLINE.equalsIgnoreCase(part.getDisposition())
                || !firstHeader(part, "Content-ID").isEmpty()
                || !firstHeader(part, "Content-Location").isEmpty()
        );
        if (isDownloadablePart(part) && !inlineBodyImage && !partId.isEmpty()) {
            JSObject item = new JSObject();
            item.put("id", partId);
            item.put("name", decodeHeader(part.getFileName(), "附件"));
            item.put("mimeType", baseMimeType(part.getContentType()));
            item.put("size", Math.max(0, part.getSize()));
            item.put("inline", Part.INLINE.equalsIgnoreCase(part.getDisposition()));
            items.put(item);
            return;
        }
        if (inlineBodyImage) return;
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int index = 0; index < multipart.getCount(); index++) {
                collectAttachments(multipart.getBodyPart(index), partId.isEmpty() ? String.valueOf(index) : partId + "." + index, items);
            }
        }
    }

    private BodyPresentation bodyPresentation(Part root, String html, String fallbackText)
        throws MessagingException, IOException {
        BodyPresentation presentation = new BodyPresentation();
        Set<String> seen = new HashSet<>();
        Map<String, String> sourceToId = new HashMap<>();
        Map<String, String> contentToId = new HashMap<>();
        Map<String, JSObject> imageById = new HashMap<>();
        collectInlineBodyImages(root, "", presentation.images, seen, sourceToId, contentToId, imageById);
        collectHtmlBodyImages(html, presentation.images, seen, sourceToId, imageById);
        presentation.blocks = contentBlocks(html, fallbackText, sourceToId, imageById);
        return presentation;
    }

    private void collectInlineBodyImages(
        Part part,
        String partId,
        JSArray images,
        Set<String> seen,
        Map<String, String> sourceToId,
        Map<String, String> contentToId,
        Map<String, JSObject> imageById
    ) throws MessagingException, IOException {
        String contentId = firstHeader(part, "Content-ID");
        String contentLocation = firstHeader(part, "Content-Location");
        boolean inline = Part.INLINE.equalsIgnoreCase(part.getDisposition())
            || !contentId.isEmpty()
            || !contentLocation.isEmpty();
        if (part.isMimeType("image/*") && inline) {
            int size = part.getSize();
            if (size > MAX_INLINE_IMAGE_BYTES) return;
            byte[] bytes;
            try {
                bytes = readBytes(part.getInputStream(), MAX_INLINE_IMAGE_BYTES);
            } catch (IOException ignored) {
                return;
            }
            String sourceId = !contentId.isEmpty() ? contentId.replaceAll("^<|>$", "") : partId;
            String mimeType = baseMimeType(part.getContentType());
            String fileName = decodeHeader(part.getFileName(), "信件內嵌圖片");
            BitmapFactory.Options dimensions = new BitmapFactory.Options();
            dimensions.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, dimensions);
            int width = Math.max(0, dimensions.outWidth);
            int height = Math.max(0, dimensions.outHeight);
            if (isTrackingImage(width, height)) return;

            String contentKey = mimeType + ":" + Arrays.hashCode(bytes);
            String existingId = contentToId.get(contentKey);
            if (existingId != null) {
                registerImageAliases(sourceToId, sourceId, partId, fileName, contentLocation, existingId);
                return;
            }

            String id = "inline-" + (sourceId.isEmpty() ? images.length() : sourceId);
            if (!seen.add(id)) return;
            JSObject image = new JSObject();
            image.put("id", id);
            image.put("name", fileName);
            image.put("mimeType", mimeType);
            image.put("src", "data:" + mimeType + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            image.put("external", false);
            image.put("width", width);
            image.put("height", height);
            image.put("referenced", false);
            images.put(image);
            imageById.put(id, image);
            contentToId.put(contentKey, id);
            registerImageAliases(sourceToId, sourceId, partId, fileName, contentLocation, id);
            return;
        }
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int index = 0; index < multipart.getCount(); index++) {
                String childId = partId.isEmpty() ? String.valueOf(index) : partId + "." + index;
                collectInlineBodyImages(
                    multipart.getBodyPart(index), childId, images, seen, sourceToId, contentToId, imageById
                );
            }
        }
    }

    private void collectHtmlBodyImages(
        String html,
        JSArray images,
        Set<String> seen,
        Map<String, String> sourceToId,
        Map<String, JSObject> imageById
    ) {
        if (html == null || html.trim().isEmpty()) return;
        Spanned rich = android.text.Html.fromHtml(html, android.text.Html.FROM_HTML_MODE_LEGACY);

        for (ImageSpan span : rich.getSpans(0, rich.length(), ImageSpan.class)) {
            String source = span.getSource() == null ? "" : span.getSource().trim();
            if (isSafeRemoteImageUrl(source)) {
                addRemoteBodyImage(images, seen, source, imageNameFromUrl(source), sourceToId, imageById);
            } else if (source.regionMatches(true, 0, "data:image/", 0, "data:image/".length())
                && source.length() <= MAX_INLINE_IMAGE_BYTES * 2) {
                String id = "embedded-" + Integer.toHexString(source.hashCode());
                if (!seen.add(id)) {
                    sourceToId.put(imageSourceKey(source), id);
                    continue;
                }
                int separator = source.indexOf(';');
                JSObject image = new JSObject();
                image.put("id", id);
                image.put("name", "信件內嵌圖片");
                image.put("mimeType", separator > 5 ? source.substring(5, separator) : "image/*");
                image.put("src", source);
                image.put("external", false);
                image.put("width", 0);
                image.put("height", 0);
                image.put("referenced", false);
                images.put(image);
                imageById.put(id, image);
                sourceToId.put(imageSourceKey(source), id);
            }
        }
    }

    private void addRemoteBodyImage(
        JSArray images,
        Set<String> seen,
        String url,
        String name,
        Map<String, String> sourceToId,
        Map<String, JSObject> imageById
    ) {
        String id = "remote-" + Integer.toHexString(url.hashCode());
        if (!seen.add(id)) {
            sourceToId.put(imageSourceKey(url), id);
            return;
        }
        JSObject image = new JSObject();
        image.put("id", id);
        image.put("name", name);
        image.put("mimeType", imageMimeType(name + " " + url));
        image.put("src", url);
        image.put("external", true);
        image.put("width", 0);
        image.put("height", 0);
        image.put("referenced", false);
        images.put(image);
        imageById.put(id, image);
        sourceToId.put(imageSourceKey(url), id);
    }

    private void registerImageAliases(
        Map<String, String> sourceToId,
        String contentId,
        String partId,
        String fileName,
        String contentLocation,
        String imageId
    ) {
        if (contentId != null && !contentId.trim().isEmpty()) {
            sourceToId.put(imageSourceKey("cid:" + contentId), imageId);
            sourceToId.put(imageSourceKey(contentId), imageId);
        }
        if (partId != null && !partId.trim().isEmpty()) sourceToId.put(imageSourceKey(partId), imageId);
        if (fileName != null && !fileName.trim().isEmpty()) sourceToId.put(imageSourceKey(fileName), imageId);
        if (contentLocation != null && !contentLocation.trim().isEmpty()) {
            sourceToId.put(imageSourceKey(contentLocation), imageId);
        }
    }

    private JSArray contentBlocks(
        String html,
        String fallbackText,
        Map<String, String> sourceToId,
        Map<String, JSObject> imageById
    ) {
        JSArray blocks = new JSArray();
        if (html == null || html.trim().isEmpty()) {
            addTextBlock(blocks, trimBody(fallbackText));
            return blocks;
        }

        Spanned rich = android.text.Html.fromHtml(html, android.text.Html.FROM_HTML_MODE_LEGACY);
        ImageSpan[] spans = rich.getSpans(0, rich.length(), ImageSpan.class);
        Arrays.sort(spans, Comparator.comparingInt(rich::getSpanStart));
        int cursor = 0;
        Set<String> placed = new HashSet<>();
        for (ImageSpan span : spans) {
            int start = Math.max(cursor, rich.getSpanStart(span));
            int end = Math.max(start, rich.getSpanEnd(span));
            addTextBlock(blocks, richTextSlice(rich, cursor, start));
            String source = span.getSource() == null ? "" : span.getSource().trim();
            String imageId = sourceToId.get(imageSourceKey(source));
            if (imageId != null && placed.add(imageId)) {
                JSObject block = new JSObject();
                block.put("type", "image");
                block.put("imageId", imageId);
                blocks.put(block);
                JSObject image = imageById.get(imageId);
                if (image != null) image.put("referenced", true);
            }
            cursor = end;
        }
        addTextBlock(blocks, richTextSlice(rich, cursor, rich.length()));
        if (blocks.length() == 0) addTextBlock(blocks, trimBody(fallbackText));
        return blocks;
    }

    private String richTextSlice(Spanned rich, int start, int end) {
        if (end <= start) return "";
        StringBuilder text = new StringBuilder(rich.subSequence(start, end).toString());
        URLSpan[] links = rich.getSpans(start, end, URLSpan.class);
        Arrays.sort(links, (left, right) -> Integer.compare(rich.getSpanEnd(right), rich.getSpanEnd(left)));
        for (URLSpan link : links) {
            int linkStart = rich.getSpanStart(link);
            int linkEnd = rich.getSpanEnd(link);
            if (linkStart < start || linkEnd > end || linkEnd < linkStart) continue;
            String url = link.getURL() == null ? "" : link.getURL().trim();
            String label = rich.subSequence(linkStart, linkEnd).toString().trim();
            int insertion = linkEnd - start;
            if (!url.isEmpty() && !label.equalsIgnoreCase(url) && insertion >= 0 && insertion <= text.length()) {
                text.insert(insertion, "：" + url);
            }
        }
        return text.toString()
            .replace("\uFFFC", "")
            .replace('\u00A0', ' ')
            .replaceAll("[ \\t]+\\n", "\n")
            .replaceAll("\\n{3,}", "\n\n")
            .trim();
    }

    private void addTextBlock(JSArray blocks, String value) {
        String text = trimBody(value);
        if (text.isEmpty()) return;
        JSObject block = new JSObject();
        block.put("type", "text");
        block.put("text", text);
        blocks.put(block);
    }

    private String imageSourceKey(String value) {
        if (value == null) return "";
        String source = value.trim().replaceAll("^<|>$", "");
        return source.regionMatches(true, 0, "cid:", 0, 4)
            ? "cid:" + source.substring(4).replaceAll("^<|>$", "").toLowerCase(Locale.ROOT)
            : source;
    }

    private boolean isTrackingImage(int width, int height) {
        return width > 0 && height > 0 && (width <= 4 || height <= 4 || (long) width * height <= 64);
    }

    private boolean isSafeRemoteImageUrl(String value) {
        try {
            Uri url = Uri.parse(value);
            return "https".equalsIgnoreCase(url.getScheme()) && url.getHost() != null && !url.getHost().isEmpty();
        } catch (Exception ignored) {
            return false;
        }
    }

    private String imageNameFromUrl(String value) {
        String segment = Uri.parse(value).getLastPathSegment();
        return segment == null || segment.trim().isEmpty() ? "信件圖片" : segment;
    }

    private String imageMimeType(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.contains(".png")) return "image/png";
        if (lower.contains(".gif")) return "image/gif";
        if (lower.contains(".webp")) return "image/webp";
        if (lower.contains(".bmp")) return "image/bmp";
        return "image/jpeg";
    }

    private Part findPart(Part root, String partId) throws MessagingException, IOException {
        Part current = root;
        for (String segment : partId.split("\\.")) {
            Object content = current.getContent();
            if (!(content instanceof Multipart)) return null;
            Multipart multipart = (Multipart) content;
            int index = Integer.parseInt(segment);
            if (index < 0 || index >= multipart.getCount()) return null;
            current = multipart.getBodyPart(index);
        }
        return current;
    }

    private boolean isDownloadablePart(Part part) throws MessagingException {
        String disposition = part.getDisposition();
        return Part.ATTACHMENT.equalsIgnoreCase(disposition)
            || (part.getFileName() != null && !part.getFileName().trim().isEmpty());
    }

    private void addRecipients(MimeMessage message, Message.RecipientType type, String value) throws MessagingException {
        if (!value.isEmpty()) message.addRecipients(type, InternetAddress.parse(value.replace(';', ','), false));
    }

    private void setOutgoingContent(MimeMessage message, String body, JSArray attachments) throws Exception {
        if (attachments.length() == 0) {
            message.setText(body, "UTF-8");
            return;
        }
        MimeMultipart multipart = new MimeMultipart("mixed");
        MimeBodyPart textPart = new MimeBodyPart();
        textPart.setText(body, "UTF-8");
        multipart.addBodyPart(textPart);
        int totalBytes = 0;
        for (int index = 0; index < attachments.length(); index++) {
            JSObject item = JSObject.fromJSONObject(attachments.getJSONObject(index));
            String name = safeFileName(item.getString("name", "attachment"));
            String mimeType = item.getString("mimeType", "application/octet-stream");
            byte[] bytes = Base64.decode(item.getString("data", ""), Base64.DEFAULT);
            totalBytes += bytes.length;
            if (totalBytes > MAX_OUTGOING_BYTES) throw new MessagingException("Outgoing attachments are too large");
            MimeBodyPart attachment = new MimeBodyPart();
            attachment.setDataHandler(new DataHandler(new ByteArrayDataSource(bytes, mimeType)));
            attachment.setFileName(MimeUtility.encodeText(name, "UTF-8", null));
            attachment.setDisposition(Part.ATTACHMENT);
            multipart.addBodyPart(attachment);
        }
        message.setContent(multipart);
    }

    private JSArray addressesJson(Address[] addresses) {
        JSArray values = new JSArray();
        if (addresses == null) return values;
        for (Address address : addresses) {
            AddressInfo info = addressInfo(address);
            values.put(info.name.equals(info.address) ? info.address : info.name + " <" + info.address + ">");
        }
        return values;
    }

    private AddressInfo firstAddress(Address[] addresses) {
        return addresses == null || addresses.length == 0 ? new AddressInfo("（未知寄件者）", "") : addressInfo(addresses[0]);
    }

    private AddressInfo addressInfo(Address value) {
        if (value instanceof InternetAddress) {
            InternetAddress address = (InternetAddress) value;
            String email = address.getAddress() == null ? "" : address.getAddress();
            return new AddressInfo(decodeHeader(address.getPersonal(), email.isEmpty() ? "（未知寄件者）" : email), email);
        }
        String text = decodeHeader(value == null ? null : value.toString(), "（未知寄件者）");
        return new AddressInfo(text, text);
    }

    private String firstHeader(Part part, String name) throws MessagingException {
        String[] values = part.getHeader(name);
        return values == null || values.length == 0 || values[0] == null ? "" : values[0].trim();
    }

    private String decodeHeader(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) return fallback;
        try {
            return decodeMimeHeader(value);
        } catch (Exception ignored) {
            return value.trim();
        }
    }

    static String decodeMimeHeader(String value) throws Exception {
        return MimeUtility.decodeText(value.replace("?==?", "?= =?"))
            .replace("\uFFFD", "")
            .replaceAll("×(?=\\S)", "× ")
            .trim();
    }

    private String htmlToText(String html) {
        Spanned rich = android.text.Html.fromHtml(html, android.text.Html.FROM_HTML_MODE_LEGACY);
        StringBuilder text = new StringBuilder(rich.toString());
        URLSpan[] links = rich.getSpans(0, rich.length(), URLSpan.class);
        Arrays.sort(links, (left, right) -> Integer.compare(rich.getSpanEnd(right), rich.getSpanEnd(left)));
        for (URLSpan link : links) {
            String url = link.getURL() == null ? "" : link.getURL().trim();
            int start = rich.getSpanStart(link);
            int end = rich.getSpanEnd(link);
            if (url.isEmpty() || start < 0 || end < start) continue;
            String label = rich.subSequence(start, end).toString().trim();
            if (!label.equalsIgnoreCase(url)) text.insert(end, "：" + url);
        }
        return text.toString();
    }

    private String trimBody(String body) {
        String value = body == null ? "" : body.trim();
        return value.length() <= MAX_BODY_CHARACTERS ? value : value.substring(0, MAX_BODY_CHARACTERS) + "\n\n（內容過長，已截斷）";
    }

    private byte[] readBytes(InputStream input, int maximum) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int count;
            while ((count = source.read(buffer)) != -1) {
                total += count;
                if (total > maximum) throw new IOException("Attachment exceeds the supported size");
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    private int folderOrder(Folder folder) {
        String kind = folderKind(folder.getFullName());
        if ("inbox".equals(kind)) return 0;
        if ("starred".equals(kind)) return 1;
        if ("sent".equals(kind)) return 2;
        if ("drafts".equals(kind)) return 3;
        if ("archive".equals(kind)) return 4;
        if ("trash".equals(kind)) return 8;
        if ("spam".equals(kind)) return 9;
        return 5;
    }

    private String folderKind(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if ("inbox".equals(lower)) return "inbox";
        if (lower.contains("trash") || lower.contains("deleted") || lower.contains("垃圾") || lower.contains("刪除")) return "trash";
        if (lower.contains("sent") || lower.contains("寄件") || lower.contains("已寄")) return "sent";
        if (lower.contains("draft") || lower.contains("草稿")) return "drafts";
        if (lower.contains("spam") || lower.contains("junk") || lower.contains("垃圾信")) return "spam";
        if (lower.contains("archive") || lower.contains("封存")) return "archive";
        if (lower.contains("star") || lower.contains("重要")) return "starred";
        return "custom";
    }

    private String folderLabel(Folder folder) {
        String name = folder.getName();
        return name == null || name.trim().isEmpty() ? folder.getFullName() : name;
    }

    private String baseMimeType(String contentType) {
        if (contentType == null || contentType.trim().isEmpty()) return "application/octet-stream";
        return contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
    }

    private String safeFileName(String value) {
        String name = value == null ? "attachment" : value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return name.isEmpty() ? "attachment" : name.substring(0, Math.min(name.length(), 120));
    }

    private String formatDate(Date date) {
        if (date == null) return "";
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US);
        format.setTimeZone(TimeZone.getDefault());
        return format.format(date);
    }

    private String normalizeAccount(String value) {
        if (value == null) return "";
        String account = value.trim().toLowerCase(Locale.ROOT);
        String suffix = "@mail.ntou.edu.tw";
        return account.endsWith(suffix) ? account.substring(0, account.length() - suffix.length()) : account;
    }

    private void reject(PluginCall call, Exception exception) {
        if (exception instanceof AuthenticationFailedException
            || (exception instanceof MessagingException && exception.getCause() instanceof AuthenticationFailedException)) {
            call.reject("Mail2000 帳號或密碼錯誤，請重新輸入", "MAIL_AUTH_FAILED");
            return;
        }
        String message = exception.getMessage() == null ? "" : exception.getMessage().toLowerCase(Locale.ROOT);
        if (message.contains("too large") || message.contains("exceeds")) {
            call.reject("附件大小超過目前支援的上限", "MAIL_ATTACHMENT_TOO_LARGE", exception);
            return;
        }
        if (message.contains("message not found")) {
            call.reject("找不到這封信，可能已被移動或刪除", "MAIL_MESSAGE_NOT_FOUND", exception);
            return;
        }
        call.reject("Mail2000 操作失敗，請確認網路與信箱服務設定", "MAIL_OPERATION_FAILED", exception);
    }

    private void closeFolder(Folder folder, boolean expunge) {
        if (folder == null || !folder.isOpen()) return;
        try {
            folder.close(expunge);
        } catch (MessagingException ignored) {
        }
    }

    private void closeStore(Store store) {
        if (store == null || !store.isConnected()) return;
        try {
            store.close();
        } catch (MessagingException ignored) {
        }
    }

    private static class Credentials {
        final String account;
        final String password;
        Credentials(String account, String password) {
            this.account = account;
            this.password = password;
        }
    }

    private static class AddressInfo {
        final String name;
        final String address;
        AddressInfo(String name, String address) {
            this.name = name;
            this.address = address;
        }
    }

    private static class BodyContent {
        String text;
        String html;
        BodyContent() {
            this("", "");
        }
        BodyContent(String text, String html) {
            this.text = text == null ? "" : text;
            this.html = html == null ? "" : html;
        }
        void append(BodyContent other) {
            if (other == null) return;
            if (!other.text.trim().isEmpty()) text = text.isEmpty() ? other.text : text + "\n\n" + other.text;
            if (!other.html.trim().isEmpty()) html = html.isEmpty() ? other.html : html + "<hr>" + other.html;
        }
    }

    private static class BodyPresentation {
        final JSArray images = new JSArray();
        JSArray blocks = new JSArray();
    }
}
