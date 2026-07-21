import os
import uuid
import boto3
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from urllib.parse import unquote
import tempfile
from pypdf import PdfWriter

app = FastAPI(title="DocMaxy PDF Toolkit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure S3 client (Mocked or real)
# In production, these should come from environment variables.
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "docmaxy-uploads")
s3_client = boto3.client(
    "s3",
    endpoint_url=os.getenv("S3_ENDPOINT_URL", None), # e.g., Cloudflare R2 URL or MinIO
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "mock-access-key"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "mock-secret-key"),
    region_name=os.getenv("AWS_REGION", "us-east-1"),
)

class CreateMultipartRequest(BaseModel):
    filename: str
    type: str

class CompleteMultipartRequest(BaseModel):
    parts: List[dict] # [{"PartNumber": 1, "ETag": "..."}]

class MergeFileItem(BaseModel):
    fileId: str
    filename: str
    order: int
    s3Key: str

class MergeJobRequest(BaseModel):
    files: List[MergeFileItem]

@app.post("/api/merge")
def merge_pdfs(req: MergeJobRequest):
    """
    Serverless endpoint to download, merge, and upload PDFs using pypdf.
    Optimized for Vercel Serverless environment.
    """
    if len(req.files) < 2:
        raise HTTPException(status_code=400, detail="Pilih minimal 2 file untuk digabungkan.")
        
    sorted_files = sorted(req.files, key=lambda x: x.order)
    merger = PdfWriter()
    
    merged_filename = f"merged_{uuid.uuid4().hex[:8]}.pdf"
    
    # Use /tmp/ directory for Vercel Serverless ephemeral storage
    tmp_dir = tempfile.gettempdir()
    merged_filepath = os.path.join(tmp_dir, merged_filename)
    
    downloaded_files = []
    
    try:
        # Download files sequentially to /tmp/
        for item in sorted_files:
            local_path = os.path.join(tmp_dir, f"dl_{item.fileId}.pdf")
            try:
                s3_client.download_file(S3_BUCKET, item.s3Key, local_path)
            except Exception as e:
                print(f"Error downloading {item.s3Key}: {e}")
                # Mock PDF for local dev testing if S3 fails
                with open(local_path, "wb") as f:
                    f.write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj xref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n104\n%%EOF\n")
            
            downloaded_files.append(local_path)
            merger.append(local_path)
            
        # Write merged file
        merger.write(merged_filepath)
        merger.close()
        
        # Upload merged file back to S3
        output_s3_key = f"processed/merge/{merged_filename}"
        s3_client.upload_file(merged_filepath, S3_BUCKET, output_s3_key)
        
        # Generate presigned URL for download
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": output_s3_key,
                "ResponseContentDisposition": f"attachment; filename={merged_filename}"
            },
            ExpiresIn=3600
        )
        
        return {
            "success": True,
            "downloadUrl": presigned_url,
            "filename": merged_filename
        }
        
    except Exception as e:
        print(f"Merge error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup /tmp/ to save space on Lambda execution context
        for f in downloaded_files:
            if os.path.exists(f):
                os.remove(f)
        if os.path.exists(merged_filepath):
            os.remove(merged_filepath)


@app.post("/s3/multipart")
def create_multipart(req: CreateMultipartRequest):
    """Starts a multipart upload."""
    try:
        # Generate a unique key for the file
        file_key = f"uploads/{uuid.uuid4()}/{req.filename}"
        
        response = s3_client.create_multipart_upload(
            Bucket=S3_BUCKET,
            Key=file_key,
            ContentType=req.type
        )
        return {
            "uploadId": response["UploadId"],
            "key": file_key
        }
    except Exception as e:
        # In a real app, you might want to return 500 if S3 is down
        print(f"Error creating multipart upload: {e}")
        # Return mock for development if no S3 is configured
        return {
            "uploadId": f"mock-upload-id-{uuid.uuid4()}",
            "key": f"uploads/mock/{req.filename}"
        }

@app.get("/s3/multipart/{uploadId}")
def sign_part(uploadId: str, key: str = Query(...), partNumber: int = Query(...)):
    """Generates a presigned URL for a single part."""
    key = unquote(key)
    try:
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod="upload_part",
            Params={
                "Bucket": S3_BUCKET,
                "Key": key,
                "UploadId": uploadId,
                "PartNumber": partNumber
            },
            ExpiresIn=3600
        )
        return {"url": presigned_url}
    except Exception as e:
        print(f"Error signing part: {e}")
        # Mock URL
        return {"url": f"https://mock-s3.local/upload?uploadId={uploadId}&partNumber={partNumber}"}

@app.get("/s3/multipart/{uploadId}/parts")
def list_parts(uploadId: str, key: str = Query(...)):
    """Lists already uploaded parts for resumption."""
    key = unquote(key)
    try:
        response = s3_client.list_parts(
            Bucket=S3_BUCKET,
            Key=key,
            UploadId=uploadId
        )
        parts = response.get("Parts", [])
        return parts
    except Exception as e:
        print(f"Error listing parts: {e}")
        return []

@app.post("/s3/multipart/{uploadId}/complete")
def complete_multipart(uploadId: str, key: str = Query(...), req: CompleteMultipartRequest = None):
    """Completes the multipart upload."""
    key = unquote(key)
    try:
        # Boto3 expects {"Parts": [{"PartNumber": 1, "ETag": "..."}]}
        parts_format = [{"PartNumber": p["PartNumber"], "ETag": p["ETag"]} for p in req.parts]
        response = s3_client.complete_multipart_upload(
            Bucket=S3_BUCKET,
            Key=key,
            UploadId=uploadId,
            MultipartUpload={"Parts": parts_format}
        )
        return {"location": response.get("Location", f"/{key}")}
    except Exception as e:
        print(f"Error completing multipart: {e}")
        return {"location": f"/{key}"}

@app.delete("/s3/multipart/{uploadId}")
def abort_multipart(uploadId: str, key: str = Query(...)):
    """Aborts the multipart upload and cleans up."""
    key = unquote(key)
    try:
        s3_client.abort_multipart_upload(
            Bucket=S3_BUCKET,
            Key=key,
            UploadId=uploadId
        )
        return {"message": "Upload aborted"}
    except Exception as e:
        print(f"Error aborting multipart: {e}")
        return {"message": "Upload aborted (mock)"}
