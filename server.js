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

// Servir les fichiers statiques depuis le dossier public
app.use('/public', express.static('public'));

// Utils
const TMP_DIR = "/tmp";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const MAX_REDIRECTS = 5;

// Créer le dossier public s'il n'existe pas
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Répertoire des musiques
const AUDIO_DIR = path.join(process.cwd(), "audios");
const AUDIO_FILES = ["1(15).mp3", "2(15).mp3", "3(15).mp3", "4(15).mp3"];

function tmpPath(prefix, ext) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return path.join(TMP_DIR, `${prefix}-${id}.${ext}`);
}

function publicPath(prefix, ext) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return path.join(PUBLIC_DIR, `${prefix}-${id}.${ext}`);
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
  const duration = Math.max(1, Math.min(Number(req.body?.duration || 15), 15)); // Max 15s
  const fps = Math.max(10, Math.min(Number(req.body?.fps || 15), 15)); // FPS réduit = moins de charge
  const returnUrl = req.body?.returnUrl === true; // Nouveau paramètre

  const inputPath = tmpPath("input", "jpg");
  const outputPath = returnUrl ? publicPath("video", "mp4") : tmpPath("output", "mp4");

  // Cleanup immédiat en cas d'erreur, différé sinon
  const cleanup = () => {
    setTimeout(() => {
      try { fs.existsSync(inputPath) && fs.unlinkSync(inputPath); } catch {}
      if (!returnUrl) {
        try { fs.existsSync(outputPath) && fs.unlinkSync(outputPath); } catch {}
      }
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

    // Choisir un fichier audio aléatoire
    const randomAudio = AUDIO_FILES[Math.floor(Math.random() * AUDIO_FILES.length)];
    const audioPath = path.join(AUDIO_DIR, randomAudio);
    console.log("Audio choisi:", randomAudio);

    // 🚀 VERSION ULTRA-OPTIMISÉE pour Railway avec AUDIO
    const args = [
      "-y",                                    // overwrite
      "-loop", "1",                            // répéter l'image
      "-framerate", "1",                       // ⚡ 1 fps d'entrée
      "-i", inputPath,                         // image
      "-i", audioPath,                         // 🎵 audio
      "-t", String(duration),                  // durée max
      "-r", String(fps),                       // fps sortie
      "-vf", "scale=720:1280",                 // résolution réduite
      "-c:v", "libx264",                       // codec vidéo
      "-preset", "ultrafast",                  // preset rapide
      "-crf", "28",                            // qualité réduite
      "-pix_fmt", "yuv420p",                   // compatibilité
      "-c:a", "aac",                           // codec audio
      "-shortest",                             // stop quand audio ou vidéo finit
      "-movflags", "+faststart",               // streaming
      "-threads", "2",                         // limite CPU
      outputPath
    ];

    console.log("FFmpeg optimized command:", args.join(" "));

    // Timeout manuel pour éviter que Railway tue le processus
    const ffmpegTimeout = setTimeout(() => {
      console.error("FFmpeg timeout - killing process");
      ff.kill('SIGKILL');
    }, 30000); // 30 secondes max

    const ff = spawn("ffmpeg", args, { 
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 12000 // Timeout Node.js backup
    });

    let ffmpegOut = "";
    let ffmpegErr = "";
    ff.stdout.on("data", (d) => ffmpegOut += d.toString());
    ff.stderr.on("data", (d) => {
      ffmpegErr += d.toString();
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
        
        if (stats.size < 1000) {
          cleanup();
          return res.status(500).send(`Generated video too small: ${stats.size} bytes`);
        }
      }

      if (!fs.existsSync(outputPath)) {
        cleanup();
        return res.status(500).send(`FFmpeg failed - no output file. Code: ${code}, Signal: ${signal}`);
      }

      // Nouveau: retourner URL ou téléchargement selon le paramètre
      if (returnUrl) {
        const filename = path.basename(outputPath);
        const publicUrl = `https://${req.get('host')}/public/${filename}`;
        cleanup();
        return res.json({ 
          success: true,
          url: publicUrl,
          size: fs.statSync(outputPath).size,
          duration: duration
        });
      } else {
        res.download(outputPath, "image-video.mp4", (err) => {
          cleanup();
          if (err) {
            console.error("Download error:", err.message);
          } else {
            console.log("Video sent successfully");
          }
        });
      }
    });

  } catch (e) {
    console.error("Processing error:", e);
    cleanup();
    return res.status(500).send(e.message || "Processing error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
