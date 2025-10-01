import express from "express";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import fetch from "node-fetch"; // npm install node-fetch

const app = express();
app.use(fileUpload());
app.use(express.json());

app.post("/check", async (req, res) => {
  let imageBuffer;

  try {
    if (req.files?.image) {
      // Cas upload direct
      imageBuffer = req.files.image.data;
    } else if (req.body?.url) {
      // Cas JSON avec { url }
      const response = await fetch(req.body.url);
      if (!response.ok) throw new Error("Impossible de télécharger l'image");
      imageBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      return res.status(400).json({ ok: false, message: "Aucune image fournie (upload ou url)" });
    }

    // Lire dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    if (!width || !height) {
      return res.status(400).json({ ok: false, message: "Impossible de lire la taille de l'image" });
    }

    const ratio = width / height;
    const valid = ratio >= 1.3 && ratio <= 2.5;

    return res.json({ ok: true, width, height, ratio: ratio.toFixed(2), valid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Image service running on port ${PORT}`));
