import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import http from "http";
import https from "https";

const app = express();

// Middlewares
app.use(cors());
app.use(fileUpload());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Utils
const TMP_DIR = "/tmp";
const MAX_REDIRECTS = 5;

function tmpPath(prefix, ext) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return path.join(TMP_DIR, `${prefix}-${id}.${ext}`);
}

function followRedirect(location) {
  try {
    return new URL(location).toString();
  } catch {
    return null;
  }
}

// Télécharge un fichier (HTTP/HTTPS) avec suivi des redirections
function downloadFile(url, destPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) return reject(new Error("Too many redirects"));
    const client = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(() => fs.existsSync(destPath) && fs.unlinkSync(destPath));
        const next = followRedirect(res.headers.location);
        if (!next) return reject(new Error("Bad redirect URL"));
        return resolve(downloadFile(next, destPath, redirects + 1));
      }
      if (res.statusCode !== 200) {
        file.close(() => fs.existsSync(destPath) && fs.unlinkSync(destPath));
        return reject(new Error(`Failed to download (${res.statusCode})`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    req.on("error", (err) => {
      file.close(() => fs.existsSync(destPath) && fs.unlinkSync(destPath));
      reject(err);
    });
  });
}

// Health-check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "n8n-ffmpeg-api", uptime: process.uptime() });
});

// Endpoint /slowmo
app.post("/slowmo", async (req, res) => {
  const duration = Math.max(1, Math.min(Number(req.body?.duration || 5), 60));
  const fps = Math.max(1, Math.min(Number(req.body?.fps || 30), 60));

  const inputPath = tmpPath("input", "jpg");
  const outputPath = tmpPath("output", "mp4");

  // Nettoyage différé pour éviter les race conditions
  const cleanup = () => {
    setTimeout(() => {
      try { fs.existsSync(inputPath) && fs.unlinkSync(inputPath); } catch {}
      try { fs.existsSync(outputPath) && fs.unlinkSync(outputPath); } catch {}
    }, 2000);
  };

  try {
    // Récupération de l'image
    if (req.body?.url) {
      const imgUrl = String(req.body.url);
      if (!/^https?:\/\//i.test(imgUrl)) return res.status(400).send("Invalid URL");
      console.log("Downloading image from:", imgUrl);
      await downloadFile(imgUrl, inputPath);
    } else if (req.files?.video) {
      await req.files.video.mv(inputPath);
    } else {
      return res.status(400).send("No image provided (use JSON { url } or form-data 'video')");
    }

    // 🔥 ORDRE CORRIGÉ: options d'input AVANT -i pour dupliquer l'image
    const args = [
      "-y",                           // overwrite output
      "-loop", "1",                   // ✅ AVANT -i : répéter l'image indéfiniment
      "-framerate", String(fps),      // ✅ AVANT -i : framerate d'entrée (30 fps = 30 copies/sec)
      "-i", inputPath,                // fichier d'entrée (ton image unique)
      "-t", String(duration),         // durée de sortie (5s = arrêter après 5 secondes)
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      "-c:v", "libx264",              // codec vidéo H.264
      "-pix_fmt", "yuv420p",          // format pixel pour compatibilité Instagram/TikTok
      "-movflags", "+faststart",      // optimisation streaming
      outputPath
    ];

    console.log("FFmpeg command:", args.join(" "));

    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let ffmpegOut = "";
    let ffmpegErr = "";
    ff.stdout.on("data", (d) => ffmpegOut += d.toString());
    ff.stderr.on("data", (d) => ffmpegErr += d.toString());

    ff.on("error", (err) => {
      console.error("FFmpeg spawn error:", err);
      cleanup();
      return res.status(500).send(`FFmpeg spawn error: ${err.message}`);
    });

    ff.on("close", (code) => {
      console.log("FFmpeg exit code:", code);
      console.log("FFmpeg stdout:", ffmpegOut);
      console.error("FFmpeg stderr:", ffmpegErr);
      console.log("Output file exists:", fs.existsSync(outputPath));
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log("Output file size:", stats.size, "bytes");
        
        // Vérifier que le fichier n'est pas vide
        if (stats.size === 0) {
          cleanup();
          return res.status(500).send("Generated video file is empty");
        }
      }

      if (code !== 0 || !fs.existsSync(outputPath)) {
        cleanup();
        return res.status(500).send(`FFmpeg failed (code ${code}). ${ffmpegErr}`);
      }

      res.download(outputPath, "image-video.mp4", (err) => {
        cleanup();
        if (err) console.error("Download error:", err.message);
        else console.log("Video sent successfully");
      });
    });

  } catch (e) {
    console.error("Processing error:", e);
    cleanup();
    return res.status(500).send(e.message || "Processing error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
