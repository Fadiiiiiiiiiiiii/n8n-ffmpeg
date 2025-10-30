from flask import Flask, send_file
import subprocess

app = Flask(__name__)

@app.route("/run_trends", methods=["GET"])
def run_trends():
    # Lance ton script Python
    subprocess.run(["python", "ai_trends.py"])
    # Renvoie le JSON généré
    return send_file("ai_trends_7days.json", mimetype="application/json")

if __name__ == "__main__":
    # 🔥 Obligatoire : Railway te donne le port via la variable d’environnement PORT
    import os
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
