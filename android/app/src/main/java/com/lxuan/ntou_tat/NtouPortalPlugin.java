package com.lxuan.ntou_tat;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.CookieStore;
import java.net.HttpURLConnection;
import java.net.HttpCookie;
import java.net.URI;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "NtouPortal")
public class NtouPortalPlugin extends Plugin {

    private static final int MAX_REDIRECTS = 5;
    private static final int NETWORK_TIMEOUT_MS = 20000;
    private static final int COOKIE_LOAD_TIMEOUT_SECONDS = 4;
    private static final Object COOKIE_STORAGE_LOCK = new Object();
    private static final ExecutorService COOKIE_STORAGE_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Pattern CHARSET_PATTERN = Pattern.compile("charset=([\\w-]+)", Pattern.CASE_INSENSITIVE);
    private static final String SECURE_PREFS = "ntou_portal_secure_store";
    private static final String COOKIE_KEY = "cookie_jar_v1";
    private static final String CACHE_PREFIX = "cache_";
    private static final String KEYSTORE_ALIAS = "ntou_portal_aes_key";
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final int GCM_IV_BYTES = 12;
    private static final String USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

    private final CookieManager cookieManager = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    private final Object cookieJarLock = new Object();
    private final Object cookieLoadLock = new Object();
    private final AtomicLong cookieGeneration = new AtomicLong();
    private volatile boolean cookiesLoaded = false;

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        String method = call.getString("method", "GET");
        JSObject headers = call.getObject("headers", new JSObject());
        String data = call.getString("data");
        int timeoutMs = clampTimeout(call.getInt("timeoutMs", NETWORK_TIMEOUT_MS));

        if (url == null || url.isEmpty()) {
            call.reject("A URL is required");
            return;
        }

        getBridge().execute(() -> {
            try {
                android.util.Log.d("NtouPortal", "request start method=" + method + " url=" + safeUrl(url));
                NativeResponse response = execute(url, method, headers, data, timeoutMs);
                JSObject result = new JSObject();
                result.put("status", response.status);
                result.put("url", response.url);
                result.put("headers", response.headers);
                result.put("data", decodeText(response.body, response.contentType));
                result.put("cookieNames", response.cookieNames);
                call.resolve(result);
            } catch (Exception exception) {
                android.util.Log.w("NtouPortal", "request failed url=" + safeUrl(url) + " type=" + exception.getClass().getSimpleName());
                call.reject("NTOU portal request failed", exception);
            }
        });
    }

    @PluginMethod
    public void image(PluginCall call) {
        String url = call.getString("url");
        JSObject headers = call.getObject("headers", new JSObject());

        if (url == null || url.isEmpty()) {
            call.reject("A URL is required");
            return;
        }

        getBridge().execute(() -> {
            try {
                android.util.Log.d("NtouPortal", "captcha start url=" + safeUrl(url));
                NativeResponse response = execute(url, "GET", headers, null, NETWORK_TIMEOUT_MS);
                JSObject result = new JSObject();
                result.put("status", response.status);
                result.put("url", response.url);
                result.put("headers", response.headers);
                if (
                    response.status >= 200 &&
                    response.status < 400 &&
                    response.body.length > 0 &&
                    response.contentType != null &&
                    response.contentType.toLowerCase(Locale.ROOT).startsWith("image/")
                ) {
                    String contentType = response.contentType == null ? "image/png" : response.contentType.split(";")[0];
                    result.put(
                        "dataUrl",
                        "data:" + contentType + ";base64," + Base64.encodeToString(response.body, Base64.NO_WRAP)
                    );
                }
                call.resolve(result);
            } catch (Exception exception) {
                android.util.Log.w("NtouPortal", "captcha failed url=" + safeUrl(url) + " type=" + exception.getClass().getSimpleName());
                call.reject("NTOU captcha request failed", exception);
            }
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        getBridge().execute(() -> {
            android.util.Log.d("NtouPortal", "cookie clear start");
            try {
                cookieGeneration.incrementAndGet();
                synchronized (cookieJarLock) {
                    cookieManager.getCookieStore().removeAll();
                    cookiesLoaded = true;
                }
                synchronized (COOKIE_STORAGE_LOCK) {
                    securePreferences().edit().remove(COOKIE_KEY).commit();
                }
            } catch (Exception exception) {
                android.util.Log.w("NtouPortal", "cookie clear recovered type=" + exception.getClass().getSimpleName());
            } finally {
                android.util.Log.d("NtouPortal", "cookie clear complete");
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void cacheGet(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("A cache key is required");
            return;
        }

        getBridge().execute(() -> {
            JSObject result = new JSObject();
            String preferenceKey;
            try {
                preferenceKey = cachePreferenceKey(key);
                String encrypted = securePreferences().getString(preferenceKey, null);
                result.put("value", encrypted == null ? JSONObject.NULL : decrypt(encrypted));
                call.resolve(result);
            } catch (Exception exception) {
                result.put("value", JSONObject.NULL);
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void cacheSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.isEmpty() || value == null) {
            call.reject("A cache key and value are required");
            return;
        }

        getBridge().execute(() -> {
            try {
                securePreferences().edit().putString(cachePreferenceKey(key), encrypt(value)).apply();
                call.resolve();
            } catch (Exception exception) {
                call.reject("Unable to save encrypted cache", exception);
            }
        });
    }

    @PluginMethod
    public void cacheClear(PluginCall call) {
        SharedPreferences preferences = securePreferences();
        SharedPreferences.Editor editor = preferences.edit();
        for (String key : preferences.getAll().keySet()) {
            if (key.startsWith(CACHE_PREFIX)) {
                editor.remove(key);
            }
        }
        editor.apply();
        call.resolve();
    }

    @PluginMethod
    public void openSystemPage(PluginCall call) {
        String url = call.getString("url");
        if (!isAllowedSystemUrl(url)) {
            call.reject("The AIS system URL is not allowed");
            return;
        }

        getBridge().execute(() -> {
            try {
                ensureCookiesLoaded();
                syncPrivateCookiesToWebView(url);
                getActivity().runOnUiThread(() -> {
                    Intent intent = new Intent(getContext(), PortalWebActivity.class);
                    intent.putExtra(PortalWebActivity.EXTRA_URL, url);
                    getActivity().startActivity(intent);
                    call.resolve();
                });
            } catch (Exception exception) {
                call.reject("Unable to open the AIS system page", exception);
            }
        });
    }

    private NativeResponse execute(
        String initialUrl,
        String initialMethod,
        JSObject headers,
        String data,
        int timeoutMs
    ) throws Exception {
        ensureCookiesLoaded();
        long requestGeneration = cookieGeneration.get();
        return executeWithPrivateCookies(initialUrl, initialMethod, headers, data, requestGeneration, timeoutMs);
    }

    private NativeResponse executeWithPrivateCookies(
        String initialUrl,
        String initialMethod,
        JSObject headers,
        String data,
        long requestGeneration,
        int timeoutMs
    ) throws Exception {
        String currentUrl = initialUrl;
        String method = initialMethod.toUpperCase(Locale.ROOT);
        byte[] requestBody = data == null ? null : data.getBytes(StandardCharsets.UTF_8);

        for (int redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
            assertCurrentGeneration(requestGeneration);
            URI uri = new URI(currentUrl);
            HttpURLConnection connection = (HttpURLConnection) new URL(currentUrl).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(Math.min(timeoutMs, NETWORK_TIMEOUT_MS));
            connection.setReadTimeout(timeoutMs);
            connection.setRequestMethod(method);
            connection.setRequestProperty("User-Agent", USER_AGENT);
            connection.setRequestProperty("Accept-Language", "zh-TW,zh;q=0.9,en;q=0.8");
            applyHeaders(connection, headers);
            applyCookies(connection, uri);

            if (requestBody != null && allowsRequestBody(method)) {
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(requestBody.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(requestBody);
                }
            }

            int status = connection.getResponseCode();
            Map<String, List<String>> responseHeaderFields = connection.getHeaderFields();
            synchronized (cookieJarLock) {
                assertCurrentGeneration(requestGeneration);
                cookieManager.put(uri, responseHeaderFields);
            }
            persistCookiesAsync(requestGeneration);

            String location = connection.getHeaderField("Location");
            if (isRedirect(status) && location != null && redirectCount < MAX_REDIRECTS) {
                currentUrl = new URL(new URL(currentUrl), location).toString();
                if (status == HttpURLConnection.HTTP_SEE_OTHER ||
                    ((status == HttpURLConnection.HTTP_MOVED_TEMP || status == HttpURLConnection.HTTP_MOVED_PERM) &&
                        !"GET".equals(method) && !"HEAD".equals(method))) {
                    method = "GET";
                    requestBody = null;
                }
                connection.disconnect();
                continue;
            }

            byte[] body = readResponseBody(connection, status);
            JSObject responseHeaders = toJsHeaders(responseHeaderFields);
            String contentType = connection.getContentType();
            String responseCookieNames = cookieNames();
            connection.disconnect();

            android.util.Log.d(
                "NtouPortal",
                "response url=" + safeUrl(currentUrl) +
                " status=" + status +
                " bytes=" + body.length +
                " type=" + safeContentType(contentType) +
                " cookies=" + responseCookieNames
            );

            return new NativeResponse(status, currentUrl, responseHeaders, body, contentType, responseCookieNames);
        }

        throw new IllegalStateException("Too many redirects");
    }

    private void applyHeaders(HttpURLConnection connection, JSObject headers) {
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if ("cookie".equalsIgnoreCase(key) || "content-length".equalsIgnoreCase(key) || "host".equalsIgnoreCase(key)) {
                continue;
            }
            String value = headers.optString(key, "");
            if (!value.isEmpty()) {
                connection.setRequestProperty(key, value);
            }
        }
    }

    private void applyCookies(HttpURLConnection connection, URI uri) throws Exception {
        Map<String, List<String>> cookieHeaders;
        synchronized (cookieJarLock) {
            cookieHeaders = cookieManager.get(uri, Collections.emptyMap());
        }
        for (Map.Entry<String, List<String>> entry : cookieHeaders.entrySet()) {
            if (!entry.getValue().isEmpty()) {
                String value = String.join("; ", entry.getValue());
                connection.setRequestProperty(entry.getKey(), value);
            }
        }
    }

    private void syncPrivateCookiesToWebView(String url) throws Exception {
        URI target = new URI(url);
        android.webkit.CookieManager webCookies = android.webkit.CookieManager.getInstance();
        webCookies.setAcceptCookie(true);

        synchronized (cookieJarLock) {
            for (HttpCookie cookie : cookieManager.getCookieStore().getCookies()) {
                if (cookie.hasExpired() || !cookieMatchesHost(cookie, target.getHost())) {
                    continue;
                }

                StringBuilder value = new StringBuilder(cookie.getName())
                    .append("=")
                    .append(cookie.getValue());
                String path = cookie.getPath();
                value.append("; Path=").append(path == null || path.isEmpty() ? "/" : path);
                if (cookie.getDomain() != null && !cookie.getDomain().isEmpty()) {
                    value.append("; Domain=").append(cookie.getDomain());
                }
                if (cookie.getSecure()) {
                    value.append("; Secure");
                }
                if (cookie.isHttpOnly()) {
                    value.append("; HttpOnly");
                }
                webCookies.setCookie(url, value.toString());
            }
        }
        webCookies.flush();
    }

    private static boolean cookieMatchesHost(HttpCookie cookie, String host) {
        if (host == null) {
            return false;
        }
        String domain = cookie.getDomain();
        if (domain == null || domain.isEmpty()) {
            return true;
        }
        String normalized = domain.startsWith(".") ? domain.substring(1) : domain;
        return host.equalsIgnoreCase(normalized) ||
            host.toLowerCase(Locale.ROOT).endsWith("." + normalized.toLowerCase(Locale.ROOT));
    }

    private static boolean isAllowedSystemUrl(String url) {
        if (url == null || url.isEmpty()) {
            return false;
        }
        try {
            URL parsed = new URL(url);
            return "https".equalsIgnoreCase(parsed.getProtocol()) &&
                "ais.ntou.edu.tw".equalsIgnoreCase(parsed.getHost());
        } catch (Exception exception) {
            return false;
        }
    }

    private static boolean allowsRequestBody(String method) {
        return "POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method) || "DELETE".equals(method);
    }

    private static int clampTimeout(Integer timeoutMs) {
        if (timeoutMs == null) {
            return NETWORK_TIMEOUT_MS;
        }
        return Math.max(5000, Math.min(timeoutMs, 90000));
    }

    private static boolean isRedirect(int status) {
        return status == HttpURLConnection.HTTP_MOVED_PERM ||
            status == HttpURLConnection.HTTP_MOVED_TEMP ||
            status == HttpURLConnection.HTTP_SEE_OTHER ||
            status == 307 ||
            status == 308;
    }

    private String cookieNames() {
        StringBuilder names = new StringBuilder();
        synchronized (cookieJarLock) {
            cookieManager.getCookieStore().getCookies().forEach(cookie -> {
                if (names.length() > 0) {
                    names.append(",");
                }
                names.append(cookie.getName());
            });
        }
        return names.toString();
    }

    private SharedPreferences securePreferences() {
        return getContext().getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE);
    }

    private void ensureCookiesLoaded() {
        if (cookiesLoaded) {
            return;
        }

        synchronized (cookieLoadLock) {
            if (cookiesLoaded) {
                return;
            }
            cookiesLoaded = true;
            long loadGeneration = cookieGeneration.get();

            String encrypted = securePreferences().getString(COOKIE_KEY, null);
            if (encrypted == null || encrypted.isEmpty()) {
                return;
            }

            try {
                Future<String> decryptTask = COOKIE_STORAGE_EXECUTOR.submit(() -> decrypt(encrypted));
                String decrypted = decryptTask.get(COOKIE_LOAD_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                if (loadGeneration != cookieGeneration.get()) {
                    return;
                }
                restoreCookies(decrypted, loadGeneration);
                android.util.Log.d("NtouPortal", "cookie restore complete names=" + cookieNames());
            } catch (Exception exception) {
                android.util.Log.w("NtouPortal", "cookie restore skipped type=" + exception.getClass().getSimpleName());
                synchronized (cookieJarLock) {
                    cookieManager.getCookieStore().removeAll();
                }
                synchronized (COOKIE_STORAGE_LOCK) {
                    securePreferences().edit().remove(COOKIE_KEY).apply();
                }
            }
        }
    }

    private void restoreCookies(String decrypted, long loadGeneration) throws Exception {
        JSONArray storedCookies = new JSONArray(decrypted);
        long now = System.currentTimeMillis();
        synchronized (cookieJarLock) {
            assertCurrentGeneration(loadGeneration);
            CookieStore store = cookieManager.getCookieStore();
            for (int index = 0; index < storedCookies.length(); index++) {
                JSONObject stored = storedCookies.getJSONObject(index);
                long maxAge = stored.optLong("maxAge", -1);
                if (maxAge > 0) {
                    long elapsedSeconds = Math.max(0, (now - stored.optLong("savedAt", now)) / 1000);
                    maxAge -= elapsedSeconds;
                    if (maxAge <= 0) {
                        continue;
                    }
                }

                HttpCookie cookie = new HttpCookie(stored.getString("name"), stored.getString("value"));
                String domain = stored.optString("domain", "");
                String path = stored.optString("path", "");
                if (!domain.isEmpty()) cookie.setDomain(domain);
                if (!path.isEmpty()) cookie.setPath(path);
                cookie.setSecure(stored.optBoolean("secure", false));
                cookie.setHttpOnly(stored.optBoolean("httpOnly", false));
                cookie.setVersion(stored.optInt("version", 0));
                cookie.setMaxAge(maxAge);
                store.add(URI.create(stored.optString("uri", "https://ais.ntou.edu.tw/")), cookie);
            }
        }
    }

    private void persistCookiesAsync(long persistGeneration) {
        final String snapshot;
        try {
            synchronized (cookieJarLock) {
                if (persistGeneration != cookieGeneration.get()) {
                    return;
                }
                snapshot = snapshotCookiesLocked();
            }
        } catch (Exception exception) {
            return;
        }

        COOKIE_STORAGE_EXECUTOR.execute(() -> {
            try {
                String encrypted = encrypt(snapshot);
                synchronized (COOKIE_STORAGE_LOCK) {
                    if (persistGeneration == cookieGeneration.get()) {
                        securePreferences().edit().putString(COOKIE_KEY, encrypted).apply();
                    }
                }
            } catch (Exception exception) {
                android.util.Log.w("NtouPortal", "cookie persist skipped type=" + exception.getClass().getSimpleName());
            }
        });
    }

    private String snapshotCookiesLocked() throws Exception {
        JSONArray storedCookies = new JSONArray();
        CookieStore store = cookieManager.getCookieStore();
        Set<String> seen = new HashSet<>();
        long savedAt = System.currentTimeMillis();

        for (URI uri : store.getURIs()) {
            for (HttpCookie cookie : store.get(uri)) {
                String identity = cookie.getName() + "|" + cookie.getDomain() + "|" + cookie.getPath();
                if (!seen.add(identity) || cookie.getMaxAge() == 0) {
                    continue;
                }
                JSONObject stored = new JSONObject();
                stored.put("name", cookie.getName());
                stored.put("value", cookie.getValue());
                stored.put("domain", cookie.getDomain() == null ? "" : cookie.getDomain());
                stored.put("path", cookie.getPath() == null ? "/" : cookie.getPath());
                stored.put("secure", cookie.getSecure());
                stored.put("httpOnly", cookie.isHttpOnly());
                stored.put("version", cookie.getVersion());
                stored.put("maxAge", cookie.getMaxAge());
                stored.put("savedAt", savedAt);
                stored.put("uri", uri.toString());
                storedCookies.put(stored);
            }
        }
        return storedCookies.toString();
    }

    private void assertCurrentGeneration(long expectedGeneration) {
        if (expectedGeneration != cookieGeneration.get()) {
            throw new IllegalStateException("Portal session was refreshed");
        }
    }

    private static String safeUrl(String value) {
        try {
            URL url = new URL(value);
            return url.getProtocol() + "://" + url.getHost() + url.getPath();
        } catch (Exception exception) {
            return "invalid-url";
        }
    }

    private static String safeContentType(String value) {
        if (value == null || value.isEmpty()) {
            return "unknown";
        }
        return value.split(";")[0];
    }

    private String cachePreferenceKey(String key) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
        return CACHE_PREFIX + Base64.encodeToString(digest, Base64.NO_WRAP | Base64.URL_SAFE);
    }

    private SecretKey encryptionKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        if (keyStore.containsAlias(KEYSTORE_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEYSTORE_ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        );
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] packed = new byte[GCM_IV_BYTES + encrypted.length];
        System.arraycopy(cipher.getIV(), 0, packed, 0, GCM_IV_BYTES);
        System.arraycopy(encrypted, 0, packed, GCM_IV_BYTES, encrypted.length);
        return Base64.encodeToString(packed, Base64.NO_WRAP);
    }

    private String decrypt(String value) throws Exception {
        byte[] packed = Base64.decode(value, Base64.NO_WRAP);
        if (packed.length <= GCM_IV_BYTES) {
            throw new IllegalArgumentException("Invalid encrypted payload");
        }
        byte[] iv = new byte[GCM_IV_BYTES];
        byte[] encrypted = new byte[packed.length - GCM_IV_BYTES];
        System.arraycopy(packed, 0, iv, 0, GCM_IV_BYTES);
        System.arraycopy(packed, GCM_IV_BYTES, encrypted, 0, encrypted.length);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private static byte[] readResponseBody(HttpURLConnection connection, int status) throws Exception {
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream == null) {
            return new byte[0];
        }

        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private static JSObject toJsHeaders(Map<String, List<String>> fields) {
        JSObject headers = new JSObject();
        for (Map.Entry<String, List<String>> entry : fields.entrySet()) {
            if (entry.getKey() != null) {
                headers.put(entry.getKey(), String.join(", ", entry.getValue()));
            }
        }
        return headers;
    }

    private static boolean isValidUtf8(byte[] bytes) {
        int expectedLength = 0;
        for (byte b : bytes) {
            int value = b & 0xFF;
            if (expectedLength > 0) {
                if ((value & 0xC0) != 0x80) {
                    return false;
                }
                expectedLength--;
            } else if ((value & 0x80) != 0) {
                if ((value & 0xE0) == 0xC0) {
                    expectedLength = 1;
                } else if ((value & 0xF0) == 0xE0) {
                    expectedLength = 2;
                } else if ((value & 0xF8) == 0xF0) {
                    expectedLength = 3;
                } else {
                    return false;
                }
            }
        }
        return expectedLength == 0;
    }

    private static String decodeText(byte[] body, String contentType) {
        if (!isValidUtf8(body)) {
            try {
                return new String(body, "Big5");
            } catch (Exception ignored) {}
        }
        Charset charset = StandardCharsets.UTF_8;
        if (contentType != null) {
            Matcher matcher = CHARSET_PATTERN.matcher(contentType);
            if (matcher.find()) {
                try {
                    charset = Charset.forName(matcher.group(1));
                } catch (Exception ignored) {}
            }
        }
        return new String(body, charset);
    }

    private static class NativeResponse {

        final int status;
        final String url;
        final JSObject headers;
        final byte[] body;
        final String contentType;
        final String cookieNames;

        NativeResponse(
            int status,
            String url,
            JSObject headers,
            byte[] body,
            String contentType,
            String cookieNames
        ) {
            this.status = status;
            this.url = url;
            this.headers = headers;
            this.body = body;
            this.contentType = contentType;
            this.cookieNames = cookieNames;
        }
    }
}
