// Endpoint /slowmo
app.post("/slowmo", async (req, res) => {
  const duration = Math.max(1, Math.min(Number(req.body?.duration || 5), 60));
  const fps = Math.max(1, Math.min(Number(req.body?.fps || 30), 60));

  const inputPath = tmpPath("input", "jpg");
  const outputPath = tmpPath("output", "mp4");

  const cleanup = () => {
    try { fs.existsSync(inputPath) && fs.unlinkSync(inputPath); } catch {}
    try { fs.existsSync(outputPath) && fs.unlinkSync(outputPath); } catch {}
  };

  try {
    // Récupération de l'image
    if (req.body?.url) {
      const imgUrl = String(req.body.url);
      if (!/^https?:\/\//i.test(imgUrl)) return res.status(400).send("Invalid URL");
      await downloadFile(imgUrl, inputPath);
    } else if (req.files?.video) {
      await req.files.video.mv(inputPath);
    } else {
      return res.status(400).send("No image provided (use JSON { url } or form-data 'video')");
    }

    // FFmpeg: image -> vidéo MP4 (durée fixe, fps défini)
    const args = [
      "-y",
      "-loop", "1",                    // répéter l'image
      "-i", inputPath,                 // input = image
      "-t", String(duration),          // durée de sortie (s)
      "-r", String(fps),               // fps
      "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputPath
    ];

    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let ffmpegErr = "";
    ff.stderr.on("data", (d) => ffmpegErr += d.toString());

    ff.on("error", (err) => {
      cleanup();
      return res.status(500).send(`FFmpeg spawn error: ${err.message}`);
    });

    ff.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(outputPath)) {
        cleanup();
        return res.status(500).send(`FFmpeg failed (code ${code}). ${ffmpegErr}`);
      }

      res.download(outputPath, "image-video.mp4", (err) => {
        cleanup();
        if (err) console.error("Download error:", err.message);
      });
    });

  } catch (e) {
    cleanup();
    return res.status(500).send(e.message || "Processing error");
  }
});
