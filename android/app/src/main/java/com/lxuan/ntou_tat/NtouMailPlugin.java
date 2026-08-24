package com.lxuan.ntou_tat;

import android.os.Build;
import android.text.Html;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.URLSpan;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
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
import jakarta.mail.UIDFolder;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeUtility;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.Properties;
import java.util.TimeZone;

@CapacitorPlugin(name = "NtouMail")
public class NtouMailPlugin extends Plugin {

    private static final String HOST = "mail.ntou.edu.tw";
    private static final int PORT = 993;
    private static final int MAX_MESSAGES = 50;
    private static final int MAX_BODY_CHARACTERS = 250_000;

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
    public void listMessages(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        int limit = Math.max(1, Math.min(MAX_MESSAGES, call.getInt("limit", 30)));

        getBridge().execute(() -> {
            Store store = null;
            Folder inbox = null;
            try {
                store = connect(credentials);
                inbox = store.getFolder("INBOX");
                inbox.open(Folder.READ_ONLY);

                int total = inbox.getMessageCount();
                int start = Math.max(1, total - limit + 1);
                Message[] messages = total == 0 ? new Message[0] : inbox.getMessages(start, total);
                FetchProfile profile = new FetchProfile();
                profile.add(FetchProfile.Item.ENVELOPE);
                profile.add(FetchProfile.Item.FLAGS);
                profile.add(UIDFolder.FetchProfileItem.UID);
                inbox.fetch(messages, profile);

                JSArray items = new JSArray();
                UIDFolder uidFolder = (UIDFolder) inbox;
                for (int index = messages.length - 1; index >= 0; index--) {
                    Message message = messages[index];
                    items.put(summaryJson(message, uidFolder.getUID(message)));
                }

                JSObject result = new JSObject();
                result.put("account", credentials.account);
                result.put("total", total);
                result.put("unread", Math.max(0, inbox.getUnreadMessageCount()));
                result.put("messages", items);
                call.resolve(result);
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeFolder(inbox);
                closeStore(store);
            }
        });
    }

    @PluginMethod
    public void getMessage(PluginCall call) {
        Credentials credentials = readCredentials(call);
        if (credentials == null) return;
        String uidValue = call.getString("uid");
        long uid;
        try {
            uid = Long.parseLong(uidValue == null ? "" : uidValue);
        } catch (NumberFormatException exception) {
            call.reject("信件識別碼無效", "MAIL_MESSAGE_INVALID");
            return;
        }

        getBridge().execute(() -> {
            Store store = null;
            Folder inbox = null;
            try {
                store = connect(credentials);
                inbox = store.getFolder("INBOX");
                inbox.open(Folder.READ_ONLY);
                UIDFolder uidFolder = (UIDFolder) inbox;
                Message message = uidFolder.getMessageByUID(uid);
                if (message == null) {
                    call.reject("找不到這封信，可能已被移動或刪除", "MAIL_MESSAGE_NOT_FOUND");
                    return;
                }

                JSObject result = summaryJson(message, uid);
                result.put("recipients", addressesJson(message.getRecipients(Message.RecipientType.TO)));
                result.put("body", trimBody(readBody(message)));
                result.put("attachments", attachmentNames(message));
                call.resolve(result);
            } catch (Exception exception) {
                reject(call, exception);
            } finally {
                closeFolder(inbox);
                closeStore(store);
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

    private Store connect(Credentials credentials) throws MessagingException {
        Properties properties = new Properties();
        properties.setProperty("mail.store.protocol", "imaps");
        properties.setProperty("mail.imaps.host", HOST);
        properties.setProperty("mail.imaps.port", String.valueOf(PORT));
        properties.setProperty("mail.imaps.auth", "true");
        properties.setProperty("mail.imaps.ssl.enable", "true");
        properties.setProperty("mail.imaps.ssl.checkserveridentity", "true");
        properties.setProperty("mail.imaps.connectiontimeout", "20000");
        properties.setProperty("mail.imaps.timeout", "30000");
        properties.setProperty("mail.imaps.writetimeout", "30000");
        properties.setProperty("mail.debug", "false");
        properties.setProperty("mail.mime.address.strict", "false");

        Session session = Session.getInstance(properties);
        session.setDebug(false);
        Store store = session.getStore("imaps");
        store.connect(HOST, PORT, credentials.account, credentials.password);
        return store;
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
        return result;
    }

    private String readBody(Part part) throws MessagingException, IOException {
        if (isAttachment(part)) return "";
        if (part.isMimeType("text/plain")) {
            Object content = part.getContent();
            return content instanceof String ? (String) content : "";
        }
        if (part.isMimeType("text/html")) {
            Object content = part.getContent();
            return content instanceof String ? htmlToText((String) content) : "";
        }
        if (part.isMimeType("multipart/alternative")) {
            Multipart multipart = (Multipart) part.getContent();
            String htmlFallback = "";
            for (int index = 0; index < multipart.getCount(); index++) {
                Part child = multipart.getBodyPart(index);
                if (child.isMimeType("text/plain") && !isAttachment(child)) return readBody(child);
                if (child.isMimeType("text/html") && htmlFallback.isEmpty()) htmlFallback = readBody(child);
            }
            return htmlFallback;
        }
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            StringBuilder body = new StringBuilder();
            for (int index = 0; index < multipart.getCount(); index++) {
                String value = readBody(multipart.getBodyPart(index));
                if (!value.trim().isEmpty()) {
                    if (body.length() > 0) body.append("\n\n");
                    body.append(value);
                }
                if (body.length() >= MAX_BODY_CHARACTERS) break;
            }
            return body.toString();
        }
        if (part.isMimeType("message/rfc822")) {
            Object content = part.getContent();
            return content instanceof Part ? readBody((Part) content) : "";
        }
        return "";
    }

    private JSArray attachmentNames(Part part) throws MessagingException, IOException {
        JSArray names = new JSArray();
        collectAttachmentNames(part, names);
        return names;
    }

    private void collectAttachmentNames(Part part, JSArray names) throws MessagingException, IOException {
        String fileName = part.getFileName();
        if (isAttachment(part)) {
            names.put(decodeHeader(fileName, "附件"));
            return;
        }
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int index = 0; index < multipart.getCount(); index++) {
                collectAttachmentNames(multipart.getBodyPart(index), names);
            }
        }
    }

    private boolean isAttachment(Part part) throws MessagingException {
        String disposition = part.getDisposition();
        return Part.ATTACHMENT.equalsIgnoreCase(disposition)
            || (part.getFileName() != null && !part.getFileName().trim().isEmpty());
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
        if (addresses == null || addresses.length == 0) return new AddressInfo("（未知寄件者）", "");
        return addressInfo(addresses[0]);
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

    private String decodeHeader(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) return fallback;
        try {
            return MimeUtility.decodeText(value).trim();
        } catch (Exception ignored) {
            return value.trim();
        }
    }

    private String htmlToText(String html) {
        Spanned parsed;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            parsed = Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY);
        } else {
            parsed = Html.fromHtml(html);
        }

        SpannableStringBuilder text = new SpannableStringBuilder(parsed);
        URLSpan[] links = text.getSpans(0, text.length(), URLSpan.class);
        Arrays.sort(links, (left, right) -> Integer.compare(text.getSpanStart(left), text.getSpanStart(right)));
        for (int index = links.length - 1; index >= 0; index--) {
            URLSpan link = links[index];
            int start = text.getSpanStart(link);
            int end = text.getSpanEnd(link);
            String url = safeMailLink(link.getURL());
            if (start < 0 || end <= start || url.isEmpty()) continue;
            String label = text.subSequence(start, end).toString().trim();
            if (!label.equalsIgnoreCase(url)) {
                text.replace(start, end, label + "\n" + url);
            }
        }
        return text.toString();
    }

    private String safeMailLink(String value) {
        if (value == null) return "";
        String url = value.trim();
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("https://")
            || lower.startsWith("http://")
            || lower.startsWith("mailto:")
            || lower.startsWith("tel:")
            ? url
            : "";
    }

    private String trimBody(String body) {
        String value = body == null ? "" : body.trim();
        return value.length() <= MAX_BODY_CHARACTERS ? value : value.substring(0, MAX_BODY_CHARACTERS) + "\n\n（內容過長，已截斷）";
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
        if (exception instanceof AuthenticationFailedException) {
            call.reject("Mail2000 帳號或密碼錯誤，請重新輸入", "MAIL_AUTH_FAILED");
            return;
        }
        if (exception instanceof MessagingException && exception.getCause() instanceof AuthenticationFailedException) {
            call.reject("Mail2000 帳號或密碼錯誤，請重新輸入", "MAIL_AUTH_FAILED");
            return;
        }
        call.reject("無法連線海大 Mail2000，請確認網路或信箱服務設定", "MAIL_CONNECTION_FAILED", exception);
    }

    private void closeFolder(Folder folder) {
        if (folder == null || !folder.isOpen()) return;
        try {
            folder.close(false);
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
}
