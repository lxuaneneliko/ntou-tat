package com.lxuan.ntou_tat;

import static org.junit.Assert.*;
import java.net.CookieManager;
import java.net.HttpCookie;
import java.net.URI;
import org.junit.Test;

public class CampusSessionProofTest {
    private HttpCookie add(CookieManager jar, String domain, String name, String value, String path) {
        HttpCookie cookie = new HttpCookie(name, value); cookie.setDomain(domain); cookie.setPath(path); cookie.setSecure(true); cookie.setVersion(0);
        jar.getCookieStore().add(URI.create("https://" + domain + path), cookie); return cookie;
    }
    @Test public void proofIsScopedToSecureAisMenuOnly() throws Exception {
        CookieManager jar = new CookieManager(); add(jar, "ais.ntou.edu.tw", ".ASPXAUTH", "SCHOOL_TEST_ONLY", "/");
        add(jar, "evil.test", ".ASPXAUTH", "EXTERNAL_TEST_ONLY", "/"); add(jar, "ais.ntou.edu.tw", "otherPath", "PRIVATE_PATH_ONLY", "/Other/");
        String proof = CampusSessionProof.header(jar); assertTrue(proof.contains(".ASPXAUTH=SCHOOL_TEST_ONLY")); assertFalse(proof.contains("EXTERNAL_TEST_ONLY")); assertFalse(proof.contains("PRIVATE_PATH_ONLY"));
    }
    @Test public void expiredAuthIsNotIncluded() throws Exception {
        CookieManager jar = new CookieManager(); add(jar, "ais.ntou.edu.tw", ".ASPXAUTH", "EXPIRED_TEST_ONLY", "/").setMaxAge(0);
        assertFalse(CampusSessionProof.header(jar).contains("EXPIRED_TEST_ONLY"));
    }
    @Test public void emptyJarHasNoProof() throws Exception { assertEquals("", CampusSessionProof.header(new CookieManager())); }
    @Test public void proofRecipientCannotBeChosenByTheCaller() {
        URI endpoint = URI.create(CampusSessionProof.ENDPOINT); assertEquals("https", endpoint.getScheme()); assertEquals("ntou-campus-api.ntou-campus.workers.dev", endpoint.getHost()); assertEquals("/api/tat/session", endpoint.getPath()); assertNull(endpoint.getQuery()); assertNull(endpoint.getUserInfo());
    }
}
