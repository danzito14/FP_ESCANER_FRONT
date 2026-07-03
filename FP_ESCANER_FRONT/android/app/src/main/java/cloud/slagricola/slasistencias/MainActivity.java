package cloud.slagricola.slasistencias;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import cloud.slagricola.slasistencias.plugins.faceengine.FaceEnginePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FaceEnginePlugin.class);   // debe ir ANTES de super.onCreate
        super.onCreate(savedInstanceState);
    }
}
