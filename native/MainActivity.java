package hu.technikaieszkoz.nyilvantartas;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.common.Scopes;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

import org.json.JSONObject;

/**
 * Teljes képernyős (edge-to-edge) héj: az állapot- és a navigációs sáv átlátszó,
 * a háttér folytatólagosan látszik mögöttük. A sávok méretét (CSS px) a weboldal
 * a window.NativeInsets objektumon keresztül kapja meg.
 */
public class MainActivity extends BridgeActivity {

    private static final int AUTH_REQUEST = 9047;
    private static final int CHOOSE_ACCOUNT_REQUEST = 9048;

    /** A repó, amelynek a release-eiből frissíthet az app (a build tölti ki a GITHUB_REPOSITORY-ból). */
    private static final String RELEASE_REPO = "__RELEASE_REPO__";

    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private volatile File pendingApk;

    private volatile float insetTop, insetBottom, insetLeft, insetRight;

    public class NativeInsets {
        @JavascriptInterface public float top() { return insetTop; }
        @JavascriptInterface public float bottom() { return insetBottom; }
        @JavascriptInterface public float left() { return insetLeft; }
        @JavascriptInterface public float right() { return insetRight; }
    }

    /** window.NativeDownloads.save(fájlnév, base64): a fájlt a telefon Letöltések mappájába menti. */
    public class NativeDownloads {
        @JavascriptInterface
        public String save(String fileName, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String safe = fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
                if (!safe.toLowerCase().endsWith(".xlsx")) safe += ".xlsx";
                String mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "err:nem hozható létre a fájl";
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os == null) return "err:nem írható a fájl";
                        os.write(data);
                    }
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) return "err:nincs elérhető tárhely";
                    dir.mkdirs();
                    try (FileOutputStream os = new FileOutputStream(new File(dir, safe))) { os.write(data); }
                }
                return "ok:" + safe;
            } catch (Exception e) {
                return "err:" + e.getMessage();
            }
        }
    }

    /**
     * Alkalmazáson belüli (OTA) frissítés: a letöltés és a telepítés natív, a weboldal csak elindítja
     * (window.AndroidUpdater) és a window.__onUpdateEvent(állapot, százalék, üzenet) hívást kapja vissza.
     */
    public class AndroidUpdater {
        @JavascriptInterface public int currentBuild() {
            try {
                return (int) PackageInfoCompat.getLongVersionCode(getPackageManager().getPackageInfo(getPackageName(), 0));
            } catch (Exception e) { return 0; }
        }
        @JavascriptInterface public String repo() { return RELEASE_REPO; }
        @JavascriptInterface public void download(final String url) {
            if (!isTrustedUpdateUrl(url)) { notifyUpdate("ERROR", 0, "nem megbízható letöltési cím"); return; }
            if (!downloading.compareAndSet(false, true)) return;
            new Thread(() -> {
                try { downloadAndInstall(url); } finally { downloading.set(false); }
            }).start();
        }
    }

    /** Csak a saját repó release-fájljai tölthetők le, https-en. */
    private static boolean isTrustedUpdateUrl(String url) {
        if (url == null) return false;
        try {
            URL u = new URL(url);
            return "https".equals(u.getProtocol()) && "github.com".equals(u.getHost())
                && u.getPath().startsWith("/" + RELEASE_REPO + "/releases/download/");
        } catch (Exception e) { return false; }
    }

    private void notifyUpdate(String state, int percent, String message) {
        final String js = "window.__onUpdateEvent&&window.__onUpdateEvent(" + JSONObject.quote(state) + "," + percent
            + "," + JSONObject.quote(message == null ? "" : message) + ")";
        runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(js, null));
    }

    private boolean mayInstall() {
        return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
    }

    private void launchInstall(File apk) {
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
        Intent install = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(install);
        notifyUpdate("INSTALLING", 100, "");
    }

    /** Visszatérés az „ismeretlen források” képernyőről: a letöltött APK telepítése folytatódik. */
    @Override
    public void onResume() {
        super.onResume();
        final File apk = pendingApk;
        if (apk != null && mayInstall()) {
            pendingApk = null;
            try { launchInstall(apk); } catch (Exception e) { notifyUpdate("ERROR", 0, String.valueOf(e.getMessage())); }
        }
    }

    private void downloadAndInstall(String url) {
        File dir = new File(getCacheDir(), "updates");
        dir.mkdirs();
        File part = new File(dir, "update.apk.part");
        File apk = new File(dir, "update.apk");
        try {
            notifyUpdate("PROGRESS", 0, "");
            String current = url;
            HttpURLConnection conn = null;
            // A GitHub másik hosztra irányít át: az átirányításokat kézzel követjük
            for (int hop = 0; hop < 8; hop++) {
                HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(15000); c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "TechnikaiEszkoz");
                // Tömörítés nélkül, hogy a Content-Length alapján ellenőrizhető legyen a letöltés
                c.setRequestProperty("Accept-Encoding", "identity");
                int code = c.getResponseCode();
                if (code >= 300 && code <= 399) {
                    String next = c.getHeaderField("Location");
                    c.disconnect();
                    if (next == null) throw new Exception("átirányítás cél nélkül");
                    URL target = new URL(new URL(current), next);
                    if (!"https".equals(target.getProtocol())) throw new Exception("nem biztonságos átirányítás");
                    current = target.toString();
                    continue;
                }
                if (code != 200) { c.disconnect(); throw new Exception("HTTP " + code); }
                conn = c;
                break;
            }
            if (conn == null) throw new Exception("túl sok átirányítás");
            long total = conn.getContentLengthLong();
            long done = 0;
            int lastPct = -1;
            try (java.io.InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    if (total > 0) {
                        int pct = (int) (done * 100 / total);
                        if (pct != lastPct) { lastPct = pct; notifyUpdate("PROGRESS", pct, ""); }
                    }
                }
            }
            conn.disconnect();
            if (total > 0 && done != total) throw new Exception("megszakadt letöltés");
            if (apk.exists()) apk.delete();
            if (!part.renameTo(apk)) throw new Exception("a fájl nem menthető");
            if (!mayInstall()) {
                pendingApk = apk;
                notifyUpdate("PERMISSION", 100, "");
                final Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                runOnUiThread(() -> startActivity(settings));
                return;
            }
            final File ready = apk;
            runOnUiThread(() -> {
                try { launchInstall(ready); } catch (Exception e) { notifyUpdate("ERROR", 0, String.valueOf(e.getMessage())); }
            });
        } catch (Exception e) {
            part.delete();
            notifyUpdate("ERROR", 0, String.valueOf(e.getMessage()));
        }
    }

    /**
     * Google-bejelentkezés az alkalmazáson belül (Google Play-szolgáltatások engedélykérő ablaka, böngésző nélkül).
     * window.GoogleAuth.authorize(interaktív) → window.__onGoogleAuth(siker, token, e-mail, hiba)
     */
    public class GoogleAuthBridge {
        /** account: a már ismert fiók e-mail címe (csendes megújításhoz); üresen a felhasználó fiókot választ. */
        @JavascriptInterface public void authorize(final boolean interactive, final String account) {
            runOnUiThread(() -> {
                if (interactive && (account == null || account.isEmpty())) chooseAccount();
                else startAuthorization(interactive, account);
            });
        }
    }

    private void notifyAuth(boolean ok, String token, String email, String error) {
        final String js = "window.__onGoogleAuth&&window.__onGoogleAuth(" + ok + "," + JSONObject.quote(token) + ","
            + JSONObject.quote(email) + "," + JSONObject.quote(error) + ")";
        runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(js, null));
    }

    /**
     * Fiókválasztó a telefonon lévő Google-fiókokból. A Google saját választója nyílik meg (profilképekkel);
     * ha az nem érhető el, a rendszer általános fiókválasztója. A listát az Android az appoknak nem adja ki,
     * ezért a választás eredménye (az e-mail cím) kerül vissza.
     */
    private void chooseAccount() {
        Intent chooser = null;
        try {
            Class<?> optionsClass = Class.forName("com.google.android.gms.common.AccountPicker$AccountChooserOptions");
            Class<?> builderClass = Class.forName("com.google.android.gms.common.AccountPicker$AccountChooserOptions$Builder");
            Object builder = builderClass.getDeclaredConstructor().newInstance();
            builderClass.getMethod("setAllowableAccountsTypes", java.util.List.class).invoke(builder, Arrays.asList("com.google"));
            Object options = builderClass.getMethod("build").invoke(builder);
            chooser = (Intent) Class.forName("com.google.android.gms.common.AccountPicker")
                .getMethod("newChooseAccountIntent", optionsClass).invoke(null, options);
        } catch (Throwable ignored) { chooser = null; }
        try {
            if (chooser == null) {
                chooser = Build.VERSION.SDK_INT >= 26
                    ? AccountManager.newChooseAccountIntent(null, null, new String[]{"com.google"}, null, null, null, null)
                    : AccountManager.newChooseAccountIntent(null, null, new String[]{"com.google"}, false, null, null, null, null);
            }
            startActivityForResult(chooser, CHOOSE_ACCOUNT_REQUEST);
        } catch (Exception e) {
            startAuthorization(true, ""); // tartalék: a Google engedélykérő ablaka
        }
    }

    private void startAuthorization(final boolean interactive, final String account) {
        try {
            AuthorizationRequest.Builder builder = AuthorizationRequest.builder()
                .setRequestedScopes(Arrays.asList(new Scope("https://www.googleapis.com/auth/drive"), new Scope(Scopes.EMAIL)));
            if (account != null && !account.isEmpty()) builder.setAccount(new Account(account, "com.google"));
            AuthorizationRequest req = builder.build();
            Identity.getAuthorizationClient(this).authorize(req)
                .addOnSuccessListener(result -> {
                    if (result.hasResolution()) {
                        // Első engedélyezés vagy fiókválasztás: a rendszer saját ablaka nyílik meg az app fölött
                        if (!interactive) { notifyAuth(false, "", "", "UI_REQUIRED"); return; }
                        PendingIntent pi = result.getPendingIntent();
                        if (pi == null) { notifyAuth(false, "", "", "nincs engedélykérő ablak"); return; }
                        try {
                            startIntentSenderForResult(pi.getIntentSender(), AUTH_REQUEST, null, 0, 0, 0);
                        } catch (Exception e) {
                            notifyAuth(false, "", "", String.valueOf(e.getMessage()));
                        }
                    } else {
                        deliverAuth(result);
                    }
                })
                .addOnFailureListener(e -> notifyAuth(false, "", "", String.valueOf(e.getMessage())));
        } catch (Exception e) {
            notifyAuth(false, "", "", String.valueOf(e.getMessage()));
        }
    }

    private void deliverAuth(AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) { notifyAuth(false, "", "", "nincs hozzáférési token"); return; }
        String email = "";
        try {
            GoogleSignInAccount acc = result.toGoogleSignInAccount();
            if (acc != null && acc.getEmail() != null) email = acc.getEmail();
        } catch (Exception ignored) { }
        notifyAuth(true, token, email, "");
    }

    /** A Google engedélykérő ablak eredménye */
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CHOOSE_ACCOUNT_REQUEST) {
            String name = (resultCode == RESULT_OK && data != null) ? data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME) : null;
            if (name == null || name.isEmpty()) notifyAuth(false, "", "", "CANCELED");
            else startAuthorization(true, name);
            return;
        }
        if (requestCode != AUTH_REQUEST) return;
        // Ha a Google ablak adatot adott vissza (siker vagy hibakód), azt feldolgozzuk; adat nélkül a felhasználó bezárta
        if (data == null) { notifyAuth(false, "", "", resultCode == RESULT_CANCELED ? "CANCELED" : "RESULT_" + resultCode); return; }
        try {
            deliverAuth(Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data));
        } catch (ApiException e) {
            notifyAuth(false, "", "", "API " + e.getStatusCode() + ": " + e.getMessage());
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            window.getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // Sötét háttér -> világos ikonok az állapot- és a navigációs sávban
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        final WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new NativeInsets(), "NativeInsets");
        webView.addJavascriptInterface(new NativeDownloads(), "NativeDownloads");
        webView.addJavascriptInterface(new AndroidUpdater(), "AndroidUpdater");
        webView.addJavascriptInterface(new GoogleAuthBridge(), "GoogleAuth");

        final float density = getResources().getDisplayMetrics().density;
        final View content = findViewById(android.R.id.content);

        ViewCompat.setOnApplyWindowInsetsListener(window.getDecorView(), (v, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            int imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;

            insetTop = bars.top / density;
            insetLeft = bars.left / density;
            insetRight = bars.right / density;
            // Billentyűzet nyitva: az ablakot a billentyűzet fölé szűkítjük, a navigációs sáv helye így nem kell
            insetBottom = imeVisible ? 0f : bars.bottom / density;
            content.setPadding(0, 0, 0, imeVisible ? imeBottom : 0);

            webView.post(() -> webView.evaluateJavascript(
                "window.__applyInsets && window.__applyInsets()", null));
            return insets;
        });
        ViewCompat.requestApplyInsets(window.getDecorView());
    }
}
