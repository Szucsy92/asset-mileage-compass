package hu.technikaieszkoz.nyilvantartas;

import android.content.ContentValues;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Teljes képernyős (edge-to-edge) héj: az állapot- és a navigációs sáv átlátszó,
 * a háttér folytatólagosan látszik mögöttük. A sávok méretét (CSS px) a weboldal
 * a window.NativeInsets objektumon keresztül kapja meg.
 */
public class MainActivity extends BridgeActivity {

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
