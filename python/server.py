from flask import Flask, send_file
import subprocess

app = Flask(__name__)

@app.route("/run_trends")
def run_trends():
    # Exécute ton script principal
    subprocess.run(["python", "ai_trends.py"])
    # Retourne le JSON généré
    return send_file("ai_trends_7days.json", mimetype="application/json")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
