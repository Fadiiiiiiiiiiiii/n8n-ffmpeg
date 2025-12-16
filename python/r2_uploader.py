import boto3
import os

def upload_to_r2(local_file, object_name):
    s3 = boto3.client(
        "s3",
        endpoint_url=os.getenv("R2_ENDPOINT"),
        aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
        region_name="auto"
    )

    bucket = os.getenv("R2_BUCKET")

    s3.upload_file(
        Filename=local_file,
        Bucket=bucket,
        Key=object_name,
        ExtraArgs={"ContentType": "application/json"}
    )

    return f"{os.getenv('R2_PUBLIC_URL')}/{object_name}"
