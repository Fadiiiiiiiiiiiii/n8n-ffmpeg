import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const ffmpeg = createFFmpeg({ log: true });
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    // Récupérer le fichier envoyé
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(buffer));

    // Ici on applique le ralentissement 2x
    await ffmpeg.run("-i", "input.mp4", "-filter:v", "setpts=2.0*PTS", "output.mp4");

    const data = ffmpeg.FS("readFile", "output.mp4");

    res.setHeader("Content-Type", "video/mp4");
    res.send(Buffer.from(data.buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
