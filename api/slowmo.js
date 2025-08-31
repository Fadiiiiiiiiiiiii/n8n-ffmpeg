import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

export default async function handler(req, res) {
  // Vérifie que c'est bien une requête POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    // Récupération du binaire de la vidéo
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "Aucun fichier vidéo reçu" });
    }

    // Crée et charge FFmpeg **uniquement maintenant**
    const ffmpeg = createFFmpeg({ log: true });
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    // Écriture de la vidéo dans le FS de FFmpeg
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(buffer));

    // Applique le ralentissement 2x
    await ffmpeg.run("-i", "input.mp4", "-filter:v", "setpts=2.0*PTS", "output.mp4");

    // Lecture du résultat
    const data = ffmpeg.FS("readFile", "output.mp4");

    res.setHeader("Content-Type", "video/mp4");
    res.send(Buffer.from(data.buffer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
