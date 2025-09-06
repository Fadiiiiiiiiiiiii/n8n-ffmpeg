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

// Endpoint /slowmo - VERSION OPTIMISÉE RAILWAY
app.post("/slowmo", async (req, res) => {
  const duration = Math.max(1, Math.min(Number(req.body?.duration || 5), 15)); // Max 15s
  const fps = Math.max(10, Math.min(Number(req.body?.fps || 15), 15)); // FPS réduit = moins de charge

  const inputPath = tmpPath("input", "jpg");
  const outputPath = tmpPath("output", "mp4");

  // Cleanup immédiat en cas d'erreur, différé sinon
  const cleanup = () => {
    setTimeout(() => {
      try { fs.existsSync(inputPath) && fs.unlinkSync(inputPath); } catch {}
      try { fs.existsSync(outputPath) && fs.unlinkSync(outputPath); } catch {}
    }, 1000);
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

    // 🚀 VERSION ULTRA-OPTIMISÉE pour Railway
    const args = [
      "-y",                                    // overwrite
      "-loop", "1",                            // répéter l'image
      "-framerate", "1",                       // ⚡ 1 fps d'entrée = moins de charge
      "-i", inputPath,                         // input
      "-t", String(duration),                  // durée
      "-r", String(fps),                       // ⚡ fps de sortie réduit
      "-vf", "scale=720:1280",                // ⚡ résolution réduite = plus rapide
      "-c:v", "libx264",                       // codec H.264
      "-preset", "ultrafast",                  // ⚡ preset le plus rapide
      "-crf", "28",                           // ⚡ qualité réduite = plus rapide  
      "-pix_fmt", "yuv420p",                  // format compatible
      "-movflags", "+faststart",              // streaming optimisé
      "-threads", "2",                        // ⚡ limite les threads
      outputPath
    ];

    console.log("FFmpeg optimized command:", args.join(" "));

    // Timeout manuel pour éviter que Railway tue le processus
    const ffmpegTimeout = setTimeout(() => {
      console.error("FFmpeg timeout - killing process");
      ff.kill('SIGKILL');
    }, 30000); // 15 secondes max

    const ff = spawn("ffmpeg", args, { 
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 12000 // Timeout Node.js backup
    });

    let ffmpegOut = "";
    let ffmpegErr = "";
    ff.stdout.on("data", (d) => ffmpegOut += d.toString());
    ff.stderr.on("data", (d) => {
      ffmpegErr += d.toString();
      // Log en temps réel pour voir où ça bloque
      if (d.toString().includes("frame=")) {
        console.log("FFmpeg progress:", d.toString().trim().split('\n').pop());
      }
    });

    ff.on("error", (err) => {
      console.error("FFmpeg spawn error:", err);
      clearTimeout(ffmpegTimeout);
      cleanup();
      return res.status(500).send(`FFmpeg spawn error: ${err.message}`);
    });

    ff.on("close", (code, signal) => {
      clearTimeout(ffmpegTimeout);
      
      console.log("FFmpeg exit code:", code);
      console.log("FFmpeg exit signal:", signal);
      console.log("FFmpeg stderr (last 500 chars):", ffmpegErr.slice(-500));
      console.log("Output file exists:", fs.existsSync(outputPath));
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log("Output file size:", stats.size, "bytes");
        
        // Vérifier que le fichier fait au moins 1KB
        if (stats.size < 1000) {
          cleanup();
          return res.status(500).send(`Generated video too small: ${stats.size} bytes`);
        }
      }

      // Accepter même si code !== 0 SI le fichier existe et fait > 1KB
      if (!fs.existsSync(outputPath)) {
        cleanup();
        return res.status(500).send(`FFmpeg failed - no output file. Code: ${code}, Signal: ${signal}`);
      }

      res.download(outputPath, "image-video.mp4", (err) => {
        cleanup();
        if (err) {
          console.error("Download error:", err.message);
        } else {
          console.log("Video sent successfully");
        }
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
