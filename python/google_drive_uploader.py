import json
import io
import os
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# Charger les credentials depuis Railway
creds_json = os.getenv("GOOGLE_CREDENTIALS")

if creds_json is None:
    raise Exception("GOOGLE_CREDENTIALS non définie dans Railway")

creds_info = json.loads(creds_json)

SCOPES = ["https://www.googleapis.com/auth/drive"]

credentials = service_account.Credentials.from_service_account_info(
    creds_info, scopes=SCOPES
)

drive = build("drive", "v3", credentials=credentials)


def upload_to_drive(folder_id: str, local_path: str, filename: str):
    file_metadata = {"name": filename, "parents": [folder_id]}

    media = MediaIoBaseUpload(
        io.FileIO(local_path, "rb"),
        mimetype="application/json",
        resumable=False
    )

    uploaded = drive.files().create(
        body=file_metadata,
        media_body=media,
        fields="id"
    ).execute()

    file_id = uploaded["id"]
    return f"https://drive.google.com/uc?id={file_id}"
