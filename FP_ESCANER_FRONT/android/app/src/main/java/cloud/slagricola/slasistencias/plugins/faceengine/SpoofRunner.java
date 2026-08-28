package cloud.slagricola.slasistencias.plugins.faceengine;

import android.content.Context;
import org.opencv.core.*;
import org.opencv.imgproc.Imgproc;
import org.opencv.imgcodecs.Imgcodecs;
import ai.onnxruntime.*;

import java.nio.FloatBuffer;
import java.util.Collections;

/** Anti-spoof pasivo (Silent-Face / MiniFASNet), MISMO modelo que el server.
 *  Réplica de recognition/antispoof.py: crop escala 2.7 → 80×80 → BGR /255 NCHW → softmax. */
public class SpoofRunner {
    private static final float SCALE = 2.7f;   // prefijo del nombre 2.7_80x80_
    private static final int   IN    = 80;     // 80x80
    private static final int   REAL_INDEX = 1; // = ANTISPOOF_REAL_INDEX del server

    private final OrtEnvironment env;
    private final OrtSession session;
    private final String inputName;

    public SpoofRunner(Context ctx, OrtEnvironment env) throws Exception {
        this.env = env;
        String modelo = OnnxRunner.copiarAsset(ctx, "models/2.7_80x80_MiniFASNetV2.onnx");
        session = env.createSession(modelo, new OrtSession.SessionOptions());
        inputName = session.getInputNames().iterator().next();
    }

    /** bbox = [x1,y1,x2,y2] px. Devuelve {esReal(0/1), scoreReal, label}. */
    public float[] check(String path, int[] bbox) throws Exception {
        Mat img = Imgcodecs.imread(path);              // BGR (anti-spoof NO hace swapRB)
        if (img.empty()) throw new RuntimeException("No se pudo leer " + path);
        Mat crop = null;
        OnnxTensor t = null; OrtSession.Result res = null;
        try {
            crop = recortar(img, bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]);

            // Lectura EN BLOQUE: 1 llamada JNI en vez de IN*IN = 6.400 (ver OnnxRunner).
            int hw = IN * IN;
            float[] chw = new float[3 * hw];
            byte[] buf = new byte[hw * 3];
            crop.get(0, 0, buf);                           // BGR entrelazado (sin swapRB)
            for (int i = 0; i < hw; i++) {
                int o = i * 3;
                chw[i]        = (buf[o]     & 0xFF) / 255f;  // B
                chw[hw + i]   = (buf[o + 1] & 0xFF) / 255f;  // G
                chw[2*hw + i] = (buf[o + 2] & 0xFF) / 255f;  // R
            }
            t = OnnxTensor.createTensor(env, FloatBuffer.wrap(chw), new long[]{1,3,IN,IN});
            res = session.run(Collections.singletonMap(inputName, t));
            float[] prob = softmax(((float[][]) res.get(0).getValue())[0]);
            int label = argmax(prob);
            float scoreReal = prob.length > REAL_INDEX ? prob[REAL_INDEX] : 0f;
            return new float[]{ label == REAL_INDEX ? 1f : 0f, scoreReal, label };
        } finally {   // liberar SIEMPRE
            if (t != null) t.close();
            if (res != null) res.close();
            img.release();
            if (crop != null) crop.release();
        }
    }

    // Recorte con escala (idéntico a AntiSpoofService._recortar).
    private Mat recortar(Mat img, float x, float y, float bw, float bh) {
        int srcW = img.cols(), srcH = img.rows();
        float s = Math.min(Math.min((srcH - 1) / bh, (srcW - 1) / bw), SCALE);
        float newW = bw * s, newH = bh * s;
        float cx = x + bw / 2f, cy = y + bh / 2f;
        float ltx = cx - newW/2f, lty = cy - newH/2f, rbx = cx + newW/2f, rby = cy + newH/2f;
        if (ltx < 0)      { rbx -= ltx; ltx = 0; }
        if (lty < 0)      { rby -= lty; lty = 0; }
        if (rbx > srcW-1) { ltx -= (rbx - (srcW-1)); rbx = srcW-1; }
        if (rby > srcH-1) { lty -= (rby - (srcH-1)); rby = srcH-1; }
        // Réplica EXACTA del slice de Silent-Face: img[y0:y1+1, x0:x1+1]
        // (endpoints truncados a int por separado, e inclusivo → +1). Antes: (int)(rbx-ltx) sin +1.
        int x0 = (int) ltx, y0 = (int) lty, x1 = (int) rbx, y1 = (int) rby;
        Rect roi = new Rect(x0, y0, Math.max(1, x1 - x0 + 1), Math.max(1, y1 - y0 + 1));
        Mat sub = img.submat(roi);
        Mat out = new Mat();
        Imgproc.resize(sub, out, new Size(IN, IN));
        sub.release();                                // el header del submat también se libera
        return out;
    }

    private static float[] softmax(float[] x) {
        float mx = Float.NEGATIVE_INFINITY; for (float v : x) mx = Math.max(mx, v);
        float[] e = new float[x.length]; float sum = 0;
        for (int i = 0; i < x.length; i++) { e[i] = (float)Math.exp(x[i]-mx); sum += e[i]; }
        for (int i = 0; i < x.length; i++) e[i] /= sum;
        return e;
    }
    private static int argmax(float[] x) { int m=0; for (int i=1;i<x.length;i++) if (x[i]>x[m]) m=i; return m; }
}
