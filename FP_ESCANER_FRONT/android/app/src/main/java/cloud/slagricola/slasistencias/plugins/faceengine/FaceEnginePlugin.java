package cloud.slagricola.slasistencias.plugins.faceengine;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

@CapacitorPlugin(name = "FaceEngine")
public class FaceEnginePlugin extends Plugin {
    private OnnxRunner runner;   // reconocimiento: se crea en init() tras la descarga del modelo
    private SpoofRunner spoof;   // anti-spoof: asset, listo en load()

    @Override public void load() {
        try {
            if (!org.opencv.android.OpenCVLoader.initLocal())
                Logger.error("FaceEngine", "OpenCV no cargó", null);
            spoof = new SpoofRunner(getContext(), ai.onnxruntime.OrtEnvironment.getEnvironment());
        } catch (Exception e) { Logger.error("FaceEngine", "init anti-spoof falló", e); }
    }

    /** El APK llama esto tras bajar w600k_r50.onnx, con su ruta absoluta (+ sha256 opcional). */
    @PluginMethod
    public void init(final PluginCall call) {
        final String path = call.getString("recognitionPath");
        final String sha  = call.getString("sha256");
        if (path == null) { call.reject("Falta recognitionPath"); return; }
        getBridge().execute(() -> {
            try {
                String p = path.startsWith("file://") ? path.substring(7) : path;
                if (sha != null && !sha.isEmpty()) {
                    if (!sha256Archivo(p).equalsIgnoreCase(sha)) { call.reject("sha256_mismatch"); return; }
                }
                OnnxRunner nuevo = new OnnxRunner(getContext(), p);   // crea ANTES de cerrar la vieja
                if (runner != null) runner.close();                   // no fuga la OrtSession anterior
                runner = nuevo;
                JSObject r = new JSObject(); r.put("ok", true);
                call.resolve(r);
            } catch (Exception e) { call.reject(e.getMessage(), e); }
        });
    }

    @PluginMethod
    public void extractEmbedding(final PluginCall call) {
        if (runner == null) { call.reject("Modelo no inicializado (llama a init primero)"); return; }
        final String path = call.getString("path");
        final JSArray kpsArr = call.getArray("kps");
        if (path == null || kpsArr == null) { call.reject("Faltan path/kps"); return; }
        getBridge().execute(() -> {
            try {
                List<Object> l = kpsArr.toList();
                double[] kps = new double[10];
                for (int i=0;i<10;i++) kps[i]=((Number)l.get(i)).doubleValue();
                String p = path.startsWith("file://") ? path.substring(7) : path;
                float[] emb = runner.extract(p, kps);
                JSArray out = new JSArray();
                for (float v: emb) out.put((double) v);
                JSObject ret = new JSObject(); ret.put("embedding", out);
                call.resolve(ret);
            } catch (Exception e) { call.reject(e.getMessage(), e); }
        });
    }

    @PluginMethod
    public void checkLiveness(final PluginCall call) {
        final String path = call.getString("path");
        final JSArray bboxArr = call.getArray("bbox");
        if (path == null || bboxArr == null) { call.reject("Faltan path/bbox"); return; }
        getBridge().execute(() -> {
            try {
                List<Object> l = bboxArr.toList();
                int[] bbox = new int[4];
                for (int i = 0; i < 4; i++) bbox[i] = ((Number) l.get(i)).intValue();
                String p = path.startsWith("file://") ? path.substring(7) : path;
                float[] r = spoof.check(p, bbox);      // {esReal(0/1), scoreReal, label}
                JSObject ret = new JSObject();
                ret.put("esReal", r[0] == 1f);
                ret.put("scoreReal", (double) r[1]);
                ret.put("label", (int) r[2]);
                call.resolve(ret);
            } catch (Exception e) { call.reject(e.getMessage(), e); }
        });
    }

    private static String sha256Archivo(String path) throws Exception {
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
        try (java.io.InputStream is = new java.io.FileInputStream(path)) {
            byte[] buf = new byte[1 << 16]; int r;
            while ((r = is.read(buf)) > 0) md.update(buf, 0, r);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
