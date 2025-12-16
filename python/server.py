from flask import Flask, send_file, jsonify
import subprocess
import threading
import os

app = Flask(__name__)


def run_trends_script():
    subprocess.run(["python", "ai_trends.py"])

@app.route("/run_trends", methods=["GET"])
def run_trends():
    thread = threading.Thread(target=run_trends_script)
    thread.start()
    return jsonify({"status": "processing", "message": "AI trends analysis started."})

@app.route("/get_results", methods=["GET"])
def get_results():
    if os.path.exists("ai_trends_7days.json"):

        return jsonify({
            "status": "done",
        })
    else:
        return jsonify({"status": "pending", "message": "File not ready yet."})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
