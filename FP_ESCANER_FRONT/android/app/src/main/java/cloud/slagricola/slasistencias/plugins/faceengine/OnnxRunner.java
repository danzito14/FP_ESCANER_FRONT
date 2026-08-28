package cloud.slagricola.slasistencias.plugins.faceengine;

import android.content.Context;
import org.opencv.core.*;
import org.opencv.calib3d.Calib3d;
import org.opencv.imgproc.Imgproc;
import org.opencv.imgcodecs.Imgcodecs;
import ai.onnxruntime.*;

import java.io.*;
import java.nio.FloatBuffer;
import java.util.Collections;

/** Reconocimiento facial (buffalo_l w600k_r50). El modelo se BAJA (167MB) y se pasa su
 *  ruta absoluta en el constructor — ya no se hornea como asset. */
public class OnnxRunner {
    // Plantilla ArcFace (idénticos valores del spike de paridad).
    private static final float[][] DST = {
        {38.2946f,51.6963f},{73.5318f,51.5014f},{56.0252f,71.7366f},
        {41.5493f,92.3655f},{70.7299f,92.2041f}
    };
    /** true = intentar NNAPI. Ver nota en el constructor: en gama baja suele ser contraproducente. */
    private static final boolean USAR_NNAPI = false;
    private final OrtEnvironment env;
    private final OrtSession session;
    private final String inputName;

    public OnnxRunner(Context ctx, String modelPath) throws Exception {
        env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions opt = new OrtSession.SessionOptions();
        // NNAPI: en SoCs sin NPU (p.ej. Snapdragon 429 de la Tab A 8.0) NNAPI cae a una
        // implementación de referencia en CPU que suele ser MÁS LENTA que el EP de CPU de
        // ONNX Runtime, y además cambia la numérica (riesgo de paridad del embedding).
        // Se deja apagado por defecto y se activa solo si el device lo justifica.
        if (USAR_NNAPI) { try { opt.addNnapi(); } catch (Throwable ignore) {} }
        try {
            opt.setIntraOpNumThreads(Math.max(1, Runtime.getRuntime().availableProcessors()));
            opt.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        } catch (Throwable ignore) {}
        session = env.createSession(modelPath, opt);
        inputName = session.getInputNames().iterator().next();
    }

    public void close() {
        try { if (session != null) session.close(); } catch (Exception ignore) {}
    }

    /** kps = [x0,y0,...,x4,y4] px, orden img-izq→der (ojo, ojo, nariz, boca, boca). L2-norm. */
    public float[] extract(String path, double[] kps) throws Exception {
        Mat img = Imgcodecs.imread(path);              // BGR
        if (img.empty()) throw new RuntimeException("No se pudo leer " + path);

        Mat src = new Mat(5,2,CvType.CV_32F), dst = new Mat(5,2,CvType.CV_32F);
        Mat M = null, al = new Mat();
        OnnxTensor t = null; OrtSession.Result res = null;
        try {
            for (int i=0;i<5;i++){
                src.put(i,0,(float)kps[i*2],(float)kps[i*2+1]);
                dst.put(i,0,DST[i][0],DST[i][1]);
            }
            M = Calib3d.estimateAffinePartial2D(src, dst);   // similitud: rot+escala+trasl
            Imgproc.warpAffine(img, al, M, new Size(112,112));   // BGR 112×112

            // Lectura EN BLOQUE: 1 sola llamada JNI en vez de 112*112 = 12.544.
            // El Mat de warpAffine es continuo y CV_8UC3, así que sale entero de un tirón.
            // Numéricamente idéntico al bucle por-pixel: NO afecta la paridad del embedding.
            int hw = 112*112;
            float[] chw = new float[3*hw];
            byte[] buf = new byte[hw*3];
            al.get(0, 0, buf);                                // BGR entrelazado
            for (int i=0;i<hw;i++){
                int o = i*3;
                float b=buf[o]&0xFF, g=buf[o+1]&0xFF, r=buf[o+2]&0xFF;
                chw[i]        = (r-127.5f)/127.5f;            // R (swapRB)
                chw[hw+i]     = (g-127.5f)/127.5f;            // G
                chw[2*hw+i]   = (b-127.5f)/127.5f;            // B
            }

            t = OnnxTensor.createTensor(env, FloatBuffer.wrap(chw), new long[]{1,3,112,112});
            res = session.run(Collections.singletonMap(inputName, t));
            float[] emb = ((float[][]) res.get(0).getValue())[0];

            double n=0; for (float v:emb) n+=(double)v*v; n=Math.sqrt(n);   // L2-norm
            if (n>0) for (int i=0;i<emb.length;i++) emb[i]=(float)(emb[i]/n);

            return emb;
        } finally {   // liberar SIEMPRE (antes se fugaban Mat/tensores si algo lanzaba)
            if (t != null) t.close();
            if (res != null) res.close();
            img.release(); al.release(); src.release(); dst.release();
            if (M != null) M.release();
        }
    }

    /** Copia un asset a filesDir (lo usa SpoofRunner para el anti-spoof, que SÍ va empacado). */
    static String copiarAsset(Context ctx, String nombre) throws IOException {
        File out = new File(ctx.getFilesDir(), nombre.replace('/','_'));
        if (!out.exists() || out.length()==0) {
            try (InputStream is=ctx.getAssets().open(nombre); OutputStream os=new FileOutputStream(out)) {
                byte[] buf=new byte[1<<16]; int r; while((r=is.read(buf))>0) os.write(buf,0,r);
            }
        }
        return out.getAbsolutePath();
    }
}
