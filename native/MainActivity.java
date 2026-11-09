package hu.technikaieszkoz.nyilvantartas;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
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
