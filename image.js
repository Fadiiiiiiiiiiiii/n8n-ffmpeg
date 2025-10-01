import express from "express";
import fileUpload from "express-fileupload";
import sharp from "sharp";

const app = express();
app.use(fileUpload());

// Endpoint /check pour vérifier si l’image est valide
app.post("/check", async (req, res) => {
  if (!req.files || !req.files.image) {
    return res.status(400).json({ ok: false, message: "Aucune image fournie (form-data: image)" });
  }

  const imageFile = req.files.image;
  try {
    // Lire les métadonnées avec sharp
    const metadata = await sharp(imageFile.data).metadata();
    const { width, height } = metadata;

    if (!width || !height) {
      return res.status(400).json({ ok: false, message: "Impossible de lire la taille de l'image" });
    }

    const ratio = width / height;

    // Vérification : ratio entre 1.3 et 2.5
    if (ratio >= 1.3 && ratio <= 2.5) {
      return res.json({ ok: true, width, height, ratio: ratio.toFixed(2), valid: true });
    } else {
      return res.json({ ok: true, width, height, ratio: ratio.toFixed(2), valid: false });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Erreur lors de l'analyse de l'image" });
  }
});

// Lancer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Image service running on port ${PORT}`));
