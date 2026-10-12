package com.lxuan.ntou_tat;

import java.io.IOException;
import java.net.CookieManager;
import java.net.URI;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** Narrow private transport boundary. Never accept a recipient or URI from JS. */
final class CampusSessionProof {
    static final String ENDPOINT = "https://ntou-campus-api.ntou-campus.workers.dev/api/tat/session";
    private CampusSessionProof() {}
    static String header(CookieManager manager) throws IOException {
        Map<String, List<String>> headers = manager.get(URI.create("https://ais.ntou.edu.tw/MenuTree.aspx"), Collections.emptyMap());
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            if ("Cookie".equalsIgnoreCase(entry.getKey())) return String.join("; ", entry.getValue());
        }
        return "";
    }
}
