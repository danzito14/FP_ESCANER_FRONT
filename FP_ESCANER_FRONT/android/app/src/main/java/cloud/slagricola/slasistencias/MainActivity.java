package cloud.slagricola.slasistencias;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import cloud.slagricola.slasistencias.plugins.faceengine.FaceEnginePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FaceEnginePlugin.class);   // debe ir ANTES de super.onCreate
        super.onCreate(savedInstanceState);
        // Kiosko de escaneo: mantén la pantalla SIEMPRE encendida mientras el APK
        // esté en primer plano, ignorando el timeout de inactividad de la tablet
        // (algunas se apagan a los 20 min). El flag se libera solo al pasar a
        // segundo plano / cerrar, así que no consume batería con el APK cerrado.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Sobrevivir a la muerte del proceso RENDERER del WebView. Con la cámara abierta
        // mucho rato, Android puede matar el renderer ("Render process kill (OOM or
        // update)"). Por defecto Capacitor NO lo maneja y Chromium cierra TODA la app.
        // Aquí lo interceptamos y RECARGAMOS el WebView en vez de morir (el kiosko se
        // recupera solo en vez de quedarse cerrado).
        getBridge().getWebView().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != null) view.reload();
                return true; // manejado → la app NO se cierra
            }
        });
    }
}
