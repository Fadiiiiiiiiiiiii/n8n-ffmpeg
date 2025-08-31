import express from "express";
import fileUpload from "express-fileupload";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

const app = express();
app.use(fileUpload());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // pour n8n web
  next();
});

app.post("/slowmo", async (req, res) => {
  if (!req.files || !req.files.video) return res.status(400).send("No video uploaded");

  const video = req.files.video;
  const tmpDir = "/tmp";
  const inputPath = path.join(tmpDir, "input.mp4");
  const outputPath = path.join(tmpDir, "output.mp4");

  await video.mv(inputPath);

  exec(`ffmpeg -y -i ${inputPath} -filter:v setpts=2.0*PTS ${outputPath}`, (err) => {
    if (err) return res.status(500).send(err.message);

    res.download(outputPath, "slowmo.mp4", (err) => {
      // Supprime les fichiers temporaires après envoi
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
