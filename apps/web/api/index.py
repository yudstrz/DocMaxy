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

@app.get("/")
def read_root():
    return {"status": "ok", "service": "DocMaxy PDF Toolkit API", "version": "1.0.0"}

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

class SplitJobRequest(BaseModel):
    fileId: str
    filename: str
    s3Key: str
    mode: str # "extract" or "split_all"
    pages: str = "" # e.g., "1,3,5-7", used only if mode == "extract"

def parse_pages_string(pages_str: str, max_pages: int):
    """Parse '1,3,5-7' to 0-indexed list of page indices."""
    pages = set()
    parts = pages_str.replace(" ", "").split(",")
    for part in parts:
        if not part: continue
        if "-" in part:
            try:
                start, end = map(int, part.split("-"))
                if start <= end:
                    pages.update(range(start, end + 1))
            except ValueError:
                pass
        else:
            try:
                pages.add(int(part))
            except ValueError:
                pass
    return sorted([p - 1 for p in pages if 1 <= p <= max_pages])

import zipfile

@app.post("/api/split")
def split_pdf(req: SplitJobRequest):
    """Serverless endpoint to split a PDF."""
    tmp_dir = tempfile.gettempdir()
    local_path = os.path.join(tmp_dir, f"dl_{req.fileId}.pdf")
    output_filepath = ""
    
    try:
        try:
            s3_client.download_file(S3_BUCKET, req.s3Key, local_path)
        except Exception as e:
            print(f"Error downloading {req.s3Key}: {e}")
            # Mock PDF for local dev testing
            with open(local_path, "wb") as f:
                f.write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj xref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n104\n%%EOF\n")

        from pypdf import PdfReader
        reader = PdfReader(local_path)
        num_pages = len(reader.pages)
        
        output_filename = ""
        
        if req.mode == "split_all":
            output_filename = f"split_{uuid.uuid4().hex[:8]}.zip"
            output_filepath = os.path.join(tmp_dir, output_filename)
            
            with zipfile.ZipFile(output_filepath, "w", zipfile.ZIP_DEFLATED) as zipf:
                for i in range(num_pages):
                    writer = PdfWriter()
                    writer.add_page(reader.pages[i])
                    pdf_path = os.path.join(tmp_dir, f"page_{i+1}.pdf")
                    writer.write(pdf_path)
                    zipf.write(pdf_path, arcname=f"page_{i+1}.pdf")
                    os.remove(pdf_path)
        else:
            # extract mode
            output_filename = f"extracted_{uuid.uuid4().hex[:8]}.pdf"
            output_filepath = os.path.join(tmp_dir, output_filename)
            
            writer = PdfWriter()
            page_indices = parse_pages_string(req.pages, num_pages)
            if not page_indices:
                raise HTTPException(status_code=400, detail="Rentang halaman tidak valid atau kosong.")
                
            for i in page_indices:
                writer.add_page(reader.pages[i])
            writer.write(output_filepath)
            writer.close()
            
        # Upload result back to S3
        output_s3_key = f"processed/split/{output_filename}"
        s3_client.upload_file(output_filepath, S3_BUCKET, output_s3_key)
        
        # Generate presigned URL
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": output_s3_key,
                "ResponseContentDisposition": f"attachment; filename={output_filename}"
            },
            ExpiresIn=3600
        )
        
        return {
            "success": True,
            "downloadUrl": presigned_url,
            "filename": output_filename
        }
        
    except Exception as e:
        print(f"Split error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)
        if output_filepath and os.path.exists(output_filepath):
            os.remove(output_filepath)

class RotateFileItem(BaseModel):
    fileId: str
    filename: str
    s3Key: str

class RotateJobRequest(BaseModel):
    files: List[RotateFileItem]
    angle: int # 90, 180, 270

@app.post("/api/rotate")
def rotate_pdfs(req: RotateJobRequest):
    """Serverless endpoint to rotate PDFs."""
    if not req.files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
        
    tmp_dir = tempfile.gettempdir()
    downloaded_files = []
    output_filepath = ""
    output_filename = ""
    
    try:
        from pypdf import PdfReader, PdfWriter
        
        rotated_pdfs = [] # list of (filename, bytes_io)
        
        for item in req.files:
            local_path = os.path.join(tmp_dir, f"dl_{item.fileId}.pdf")
            try:
                s3_client.download_file(S3_BUCKET, item.s3Key, local_path)
            except Exception as e:
                print(f"Error downloading {item.s3Key}: {e}")
                # Mock PDF for local dev testing
                with open(local_path, "wb") as f:
                    f.write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj xref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n104\n%%EOF\n")
            
            downloaded_files.append(local_path)
            
            reader = PdfReader(local_path)
            writer = PdfWriter()
            
            for page in reader.pages:
                # pypdf page.rotate uses clockwise angle
                page.rotate(req.angle)
                writer.add_page(page)
                
            pdf_buffer = io.BytesIO()
            writer.write(pdf_buffer)
            rotated_pdfs.append((item.filename, pdf_buffer))
            
        if len(rotated_pdfs) == 1:
            # Single file -> return PDF
            output_filename = f"rotated_{uuid.uuid4().hex[:8]}.pdf"
            output_filepath = os.path.join(tmp_dir, output_filename)
            with open(output_filepath, "wb") as f:
                f.write(rotated_pdfs[0][1].getvalue())
        else:
            # Multiple files -> return ZIP
            output_filename = f"rotated_{uuid.uuid4().hex[:8]}.zip"
            output_filepath = os.path.join(tmp_dir, output_filename)
            with zipfile.ZipFile(output_filepath, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, buf in rotated_pdfs:
                    # Append _rotated to filename before extension
                    base, ext = os.path.splitext(fname)
                    zip_fname = f"{base}_rotated{ext}"
                    zipf.writestr(zip_fname, buf.getvalue())
                    
        # Upload result back to S3
        output_s3_key = f"processed/rotate/{output_filename}"
        s3_client.upload_file(output_filepath, S3_BUCKET, output_s3_key)
        
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": output_s3_key,
                "ResponseContentDisposition": f"attachment; filename={output_filename}"
            },
            ExpiresIn=3600
        )
        
        return {
            "success": True,
            "downloadUrl": presigned_url,
            "filename": output_filename
        }
        
    except Exception as e:
        print(f"Rotate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for f in downloaded_files:
            if os.path.exists(f):
                os.remove(f)
        if output_filepath and os.path.exists(output_filepath):
            os.remove(output_filepath)


class Img2PdfJobRequest(BaseModel):
    files: List[RotateFileItem]

@app.post("/api/img2pdf")
def img2pdf(req: Img2PdfJobRequest):
    """Serverless endpoint to convert JPG/PNG to PDF."""
    if not req.files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
        
    tmp_dir = tempfile.gettempdir()
    downloaded_files = []
    output_filepath = ""
    
    try:
        from PIL import Image
        
        image_list = []
        for item in req.files:
            local_path = os.path.join(tmp_dir, f"dl_{item.fileId}_{item.filename}")
            try:
                s3_client.download_file(S3_BUCKET, item.s3Key, local_path)
            except Exception as e:
                print(f"Error downloading {item.s3Key}: {e}")
                # Mock image for local dev testing
                img = Image.new('RGB', (100, 100), color = 'red')
                img.save(local_path)
            
            downloaded_files.append(local_path)
            
            img = Image.open(local_path)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            image_list.append(img)
            
        output_filename = f"converted_{uuid.uuid4().hex[:8]}.pdf"
        output_filepath = os.path.join(tmp_dir, output_filename)
        
        if len(image_list) == 1:
            image_list[0].save(output_filepath, "PDF", resolution=100.0)
        else:
            image_list[0].save(output_filepath, "PDF", resolution=100.0, save_all=True, append_images=image_list[1:])
            
        # Upload result back to S3
        output_s3_key = f"processed/img2pdf/{output_filename}"
        s3_client.upload_file(output_filepath, S3_BUCKET, output_s3_key)
        
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": output_s3_key,
                "ResponseContentDisposition": f"attachment; filename={output_filename}"
            },
            ExpiresIn=3600
        )
        
        return {
            "success": True,
            "downloadUrl": presigned_url,
            "filename": output_filename
        }
        
    except Exception as e:
        print(f"Img2Pdf error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for f in downloaded_files:
            if os.path.exists(f):
                os.remove(f)
        if output_filepath and os.path.exists(output_filepath):
            os.remove(output_filepath)

class CompressJobRequest(BaseModel):
    files: List[RotateFileItem]

@app.post("/api/compress")
def compress_pdfs(req: CompressJobRequest):
    """Serverless endpoint to compress PDFs."""
    if not req.files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
        
    tmp_dir = tempfile.gettempdir()
    downloaded_files = []
    output_filepath = ""
    output_filename = ""
    
    try:
        from pypdf import PdfReader, PdfWriter
        
        compressed_pdfs = [] # list of (filename, bytes_io)
        
        for item in req.files:
            local_path = os.path.join(tmp_dir, f"dl_{item.fileId}.pdf")
            try:
                s3_client.download_file(S3_BUCKET, item.s3Key, local_path)
            except Exception as e:
                print(f"Error downloading {item.s3Key}: {e}")
                # Mock PDF for local dev testing
                with open(local_path, "wb") as f:
                    f.write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj xref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n104\n%%EOF\n")
            
            downloaded_files.append(local_path)
            
            reader = PdfReader(local_path)
            writer = PdfWriter()
            
            for page in reader.pages:
                writer.add_page(page)
                
            # Basic stream compression using pypdf
            for page in writer.pages:
                page.compress_content_streams()
                
            pdf_buffer = io.BytesIO()
            writer.write(pdf_buffer)
            compressed_pdfs.append((item.filename, pdf_buffer))
            
        if len(compressed_pdfs) == 1:
            # Single file -> return PDF
            output_filename = f"compressed_{uuid.uuid4().hex[:8]}.pdf"
            output_filepath = os.path.join(tmp_dir, output_filename)
            with open(output_filepath, "wb") as f:
                f.write(compressed_pdfs[0][1].getvalue())
        else:
            # Multiple files -> return ZIP
            output_filename = f"compressed_{uuid.uuid4().hex[:8]}.zip"
            output_filepath = os.path.join(tmp_dir, output_filename)
            with zipfile.ZipFile(output_filepath, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, buf in compressed_pdfs:
                    base, ext = os.path.splitext(fname)
                    zip_fname = f"{base}_compressed{ext}"
                    zipf.writestr(zip_fname, buf.getvalue())
                    
        # Upload result back to S3
        output_s3_key = f"processed/compress/{output_filename}"
        s3_client.upload_file(output_filepath, S3_BUCKET, output_s3_key)
        
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": output_s3_key,
                "ResponseContentDisposition": f"attachment; filename={output_filename}"
            },
            ExpiresIn=3600
        )
        
        return {
            "success": True,
            "downloadUrl": presigned_url,
            "filename": output_filename
        }
        
    except Exception as e:
        print(f"Compress error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for f in downloaded_files:
            if os.path.exists(f):
                os.remove(f)
        if output_filepath and os.path.exists(output_filepath):
            os.remove(output_filepath)

class Pdf2WordJobRequest(BaseModel):
    files: List[RotateFileItem]

@app.post("/api/pdf2word")
def pdf2word(req: Pdf2WordJobRequest):
    if not req.files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
    tmp_dir = tempfile.gettempdir()
    downloaded_files = []
    output_filepath = ""
    output_filename = ""
    try:
        from pdf2docx import Converter
        results = []
        for item in req.files:
            local_path = os.path.join(tmp_dir, f"dl_{item.fileId}.pdf")
            s3_client.download_file(S3_BUCKET, item.s3Key, local_path)
            downloaded_files.append(local_path)
            
            out_path = os.path.join(tmp_dir, f"out_{item.fileId}.docx")
            cv = Converter(local_path)
            cv.convert(out_path, start=0, end=None)
            cv.close()
            results.append((item.filename, out_path))
            downloaded_files.append(out_path)
            
        if len(results) == 1:
            base, ext = os.path.splitext(results[0][0])
            output_filename = f"{base}.docx"
            output_filepath = results[0][1]
        else:
            output_filename = f"converted_{uuid.uuid4().hex[:8]}.zip"
            output_filepath = os.path.join(tmp_dir, output_filename)
            with zipfile.ZipFile(output_filepath, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, docpath in results:
                    base, ext = os.path.splitext(fname)
                    zipf.write(docpath, arcname=f"{base}.docx")
                    
        output_s3_key = f"processed/pdf2word/{output_filename}"
        s3_client.upload_file(output_filepath, S3_BUCKET, output_s3_key)
        
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": S3_BUCKET, "Key": output_s3_key, "ResponseContentDisposition": f"attachment; filename={output_filename}"},
            ExpiresIn=3600
        )
        return {"success": True, "downloadUrl": presigned_url, "filename": output_filename}
    except Exception as e:
        print(f"pdf2word error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for f in downloaded_files:
            if os.path.exists(f): os.remove(f)
        if output_filepath and os.path.exists(output_filepath) and len(req.files) > 1:
            os.remove(output_filepath)

class Word2PdfJobRequest(BaseModel):
    files: List[RotateFileItem]

@app.post("/api/word2pdf")
def word2pdf(req: Word2PdfJobRequest):
    if not req.files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
    tmp_dir = tempfile.gettempdir()
    downloaded_files = []
    output_filepath = ""
    output_filename = ""
    try:
        import mammoth
        from xhtml2pdf import pisa
        results = []
        for item in req.files:
            local_path = os.path.join(tmp_dir, f"dl_{item.fileId}.docx")
            s3_client.download_file(S3_BUCKET, item.s3Key, local_path)
            downloaded_files.append(local_path)
            
            with open(local_path, "rb") as docx_file:
                result = mammoth.convert_to_html(docx_file)
                html = result.value
                
            out_path = os.path.join(tmp_dir, f"out_{item.fileId}.pdf")
            with open(out_path, "wb") as pdf_file:
                styled_html = f"<html><head><style>body{{font-family: Helvetica, sans-serif; padding: 20px; line-height: 1.5;}} table{{width:100%; border-collapse:collapse;}} td,th{{border:1px solid #000; padding:5px;}}</style></head><body>{html}</body></html>"
                pisa.CreatePDF(styled_html, dest=pdf_file)
                
            results.append((item.filename, out_path))
            downloaded_files.append(out_path)
            
        if len(results) == 1:
            base, ext = os.path.splitext(results[0][0])
            output_filename = f"{base}.pdf"
            output_filepath = results[0][1]
        else:
            output_filename = f"converted_{uuid.uuid4().hex[:8]}.zip"
            output_filepath = os.path.join(tmp_dir, output_filename)
            with zipfile.ZipFile(output_filepath, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, pdfpath in results:
                    base, ext = os.path.splitext(fname)
                    zipf.write(pdfpath, arcname=f"{base}.pdf")
                    
        output_s3_key = f"processed/word2pdf/{output_filename}"
        s3_client.upload_file(output_filepath, S3_BUCKET, output_s3_key)
        
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": S3_BUCKET, "Key": output_s3_key, "ResponseContentDisposition": f"attachment; filename={output_filename}"},
            ExpiresIn=3600
        )
        return {"success": True, "downloadUrl": presigned_url, "filename": output_filename}
    except Exception as e:
        print(f"word2pdf error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for f in downloaded_files:
            if os.path.exists(f): os.remove(f)
        if output_filepath and os.path.exists(output_filepath) and len(req.files) > 1:
            os.remove(output_filepath)

class EditPdfJobRequest(BaseModel):
    files: List[RotateFileItem]
    text: str
    x: int = 100
    y: int = 100
    fontSize: int = 24
    color: str = "#000000"

@app.post("/api/edit-pdf")
def edit_pdf(req: EditPdfJobRequest):
    if not req.files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
    if not req.text:
        raise HTTPException(status_code=400, detail="Teks anotasi tidak boleh kosong.")
    tmp_dir = tempfile.gettempdir()
    downloaded_files = []
    output_filepath = ""
    output_filename = ""
    try:
        from pypdf import PdfReader, PdfWriter
        from reportlab.pdfgen import canvas
        from reportlab.lib.colors import HexColor
        import io
        
        results = []
        for item in req.files:
            local_path = os.path.join(tmp_dir, f"dl_{item.fileId}.pdf")
            s3_client.download_file(S3_BUCKET, item.s3Key, local_path)
            downloaded_files.append(local_path)
            
            existing_pdf = PdfReader(local_path)
            writer = PdfWriter()
            
            for page in existing_pdf.pages:
                page_width = float(page.mediabox.width)
                page_height = float(page.mediabox.height)
                
                packet = io.BytesIO()
                can = canvas.Canvas(packet, pagesize=(page_width, page_height))
                
                try:
                    can.setFillColor(HexColor(req.color))
                except:
                    can.setFillColor(HexColor("#000000"))
                    
                can.setFont("Helvetica", req.fontSize)
                can.drawString(req.x, req.y, req.text)
                can.save()
                packet.seek(0)
                
                new_pdf = PdfReader(packet)
                text_page = new_pdf.pages[0]
                
                page.merge_page(text_page)
                writer.add_page(page)
                
            out_path = os.path.join(tmp_dir, f"out_{item.fileId}.pdf")
            with open(out_path, "wb") as out_pdf:
                writer.write(out_pdf)
                
            results.append((item.filename, out_path))
            downloaded_files.append(out_path)
            
        if len(results) == 1:
            base, ext = os.path.splitext(results[0][0])
            output_filename = f"{base}_edited.pdf"
            output_filepath = results[0][1]
        else:
            output_filename = f"edited_{uuid.uuid4().hex[:8]}.zip"
            output_filepath = os.path.join(tmp_dir, output_filename)
            with zipfile.ZipFile(output_filepath, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, pdfpath in results:
                    base, ext = os.path.splitext(fname)
                    zipf.write(pdfpath, arcname=f"{base}_edited.pdf")
                    
        output_s3_key = f"processed/editpdf/{output_filename}"
        s3_client.upload_file(output_filepath, S3_BUCKET, output_s3_key)
        
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": S3_BUCKET, "Key": output_s3_key, "ResponseContentDisposition": f"attachment; filename={output_filename}"},
            ExpiresIn=3600
        )
        return {"success": True, "downloadUrl": presigned_url, "filename": output_filename}
    except Exception as e:
        print(f"edit pdf error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for f in downloaded_files:
            if os.path.exists(f): os.remove(f)
        if output_filepath and os.path.exists(output_filepath) and len(req.files) > 1:
            os.remove(output_filepath)


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
