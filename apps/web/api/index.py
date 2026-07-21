import os
import uuid
import io
import zipfile
import tempfile
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from typing import List, Optional

app = FastAPI(title="DocMaxy PDF Toolkit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "DocMaxy PDF Toolkit API", "version": "2.0.0"}

# ─────────────────────────────────────────────
# MERGE PDF
# ─────────────────────────────────────────────
@app.post("/api/merge")
async def merge_pdfs(files: List[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Pilih minimal 2 file untuk digabungkan.")
    try:
        from pypdf import PdfWriter, PdfReader
        writer = PdfWriter()
        for f in files:
            content = await f.read()
            reader = PdfReader(io.BytesIO(content))
            for page in reader.pages:
                writer.add_page(page)
        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=merged.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────
# SPLIT PDF
# ─────────────────────────────────────────────
@app.post("/api/split")
async def split_pdf(
    file: UploadFile = File(...),
    mode: str = Form("all"),
    pages: Optional[str] = Form(None)
):
    try:
        from pypdf import PdfWriter, PdfReader
        content = await file.read()
        reader = PdfReader(io.BytesIO(content))

        if mode == "extract" and pages:
            page_indices = [int(p.strip()) - 1 for p in pages.split(",") if p.strip()]
            writer = PdfWriter()
            for idx in page_indices:
                if 0 <= idx < len(reader.pages):
                    writer.add_page(reader.pages[idx])
            buf = io.BytesIO()
            writer.write(buf)
            buf.seek(0)
            return Response(
                content=buf.read(),
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=extracted.pdf"}
            )
        else:
            # Split all pages into ZIP
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zipf:
                base = os.path.splitext(file.filename or "document")[0]
                for i, page in enumerate(reader.pages):
                    writer = PdfWriter()
                    writer.add_page(page)
                    p_buf = io.BytesIO()
                    writer.write(p_buf)
                    zipf.writestr(f"{base}_page{i+1}.pdf", p_buf.getvalue())
            zip_buf.seek(0)
            return Response(
                content=zip_buf.read(),
                media_type="application/zip",
                headers={"Content-Disposition": "attachment; filename=split_pages.zip"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────
# ROTATE PDF
# ─────────────────────────────────────────────
@app.post("/api/rotate")
async def rotate_pdfs(files: List[UploadFile] = File(...), angle: int = Form(90)):
    try:
        from pypdf import PdfWriter, PdfReader
        results = []
        for f in files:
            content = await f.read()
            reader = PdfReader(io.BytesIO(content))
            writer = PdfWriter()
            for page in reader.pages:
                page.rotate(angle)
                writer.add_page(page)
            buf = io.BytesIO()
            writer.write(buf)
            results.append((f.filename or "rotated.pdf", buf.getvalue()))

        if len(results) == 1:
            fname, data = results[0]
            base, ext = os.path.splitext(fname)
            return Response(
                content=data,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={base}_rotated.pdf"}
            )
        else:
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, data in results:
                    base, ext = os.path.splitext(fname)
                    zipf.writestr(f"{base}_rotated.pdf", data)
            zip_buf.seek(0)
            return Response(
                content=zip_buf.read(),
                media_type="application/zip",
                headers={"Content-Disposition": "attachment; filename=rotated.zip"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────
# COMPRESS PDF
# ─────────────────────────────────────────────
@app.post("/api/compress")
async def compress_pdfs(files: List[UploadFile] = File(...)):
    try:
        from pypdf import PdfWriter, PdfReader
        results = []
        for f in files:
            content = await f.read()
            reader = PdfReader(io.BytesIO(content))
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            for page in writer.pages:
                page.compress_content_streams()
            buf = io.BytesIO()
            writer.write(buf)
            results.append((f.filename or "compressed.pdf", buf.getvalue()))

        if len(results) == 1:
            fname, data = results[0]
            base, ext = os.path.splitext(fname)
            return Response(
                content=data,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={base}_compressed.pdf"}
            )
        else:
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, data in results:
                    base, ext = os.path.splitext(fname)
                    zipf.writestr(f"{base}_compressed.pdf", data)
            zip_buf.seek(0)
            return Response(
                content=zip_buf.read(),
                media_type="application/zip",
                headers={"Content-Disposition": "attachment; filename=compressed.zip"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────
# IMAGE TO PDF
# ─────────────────────────────────────────────
@app.post("/api/img2pdf")
async def img2pdf(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
    try:
        from PIL import Image
        images = []
        for f in files:
            content = await f.read()
            img = Image.open(io.BytesIO(content))
            if img.mode != "RGB":
                img = img.convert("RGB")
            images.append(img)

        buf = io.BytesIO()
        if len(images) == 1:
            images[0].save(buf, "PDF", resolution=100.0)
        else:
            images[0].save(buf, "PDF", resolution=100.0, save_all=True, append_images=images[1:])
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=converted.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────
# PDF TO WORD
# ─────────────────────────────────────────────
@app.post("/api/pdf2word")
async def pdf2word(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
    tmp_dir = tempfile.gettempdir()
    tmp_files = []
    try:
        from pdf2docx import Converter
        results = []
        for f in files:
            content = await f.read()
            in_path = os.path.join(tmp_dir, f"in_{uuid.uuid4().hex}.pdf")
            out_path = os.path.join(tmp_dir, f"out_{uuid.uuid4().hex}.docx")
            tmp_files.extend([in_path, out_path])

            with open(in_path, "wb") as fp:
                fp.write(content)

            cv = Converter(in_path)
            cv.convert(out_path, start=0, end=None)
            cv.close()

            with open(out_path, "rb") as fp:
                docx_bytes = fp.read()

            base = os.path.splitext(f.filename or "converted")[0]
            results.append((f"{base}.docx", docx_bytes))

        if len(results) == 1:
            fname, data = results[0]
            return Response(
                content=data,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f"attachment; filename={fname}"}
            )
        else:
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, data in results:
                    zipf.writestr(fname, data)
            zip_buf.seek(0)
            return Response(
                content=zip_buf.read(),
                media_type="application/zip",
                headers={"Content-Disposition": "attachment; filename=converted_docs.zip"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in tmp_files:
            if os.path.exists(p):
                os.remove(p)

# ─────────────────────────────────────────────
# WORD TO PDF
# ─────────────────────────────────────────────
@app.post("/api/word2pdf")
async def word2pdf(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
    try:
        import mammoth
        from xhtml2pdf import pisa

        results = []
        for f in files:
            content = await f.read()
            result = mammoth.convert_to_html(io.BytesIO(content))
            html = result.value
            styled_html = (
                "<html><head><style>"
                "body{font-family:Helvetica,sans-serif;padding:20px;line-height:1.5;}"
                "table{width:100%;border-collapse:collapse;}"
                "td,th{border:1px solid #000;padding:5px;}"
                "</style></head><body>" + html + "</body></html>"
            )
            pdf_buf = io.BytesIO()
            pisa.CreatePDF(styled_html, dest=pdf_buf)
            pdf_buf.seek(0)
            base = os.path.splitext(f.filename or "converted")[0]
            results.append((f"{base}.pdf", pdf_buf.read()))

        if len(results) == 1:
            fname, data = results[0]
            return Response(
                content=data,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={fname}"}
            )
        else:
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, data in results:
                    zipf.writestr(fname, data)
            zip_buf.seek(0)
            return Response(
                content=zip_buf.read(),
                media_type="application/zip",
                headers={"Content-Disposition": "attachment; filename=converted_pdfs.zip"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────
# EDIT PDF (Add text annotation)
# ─────────────────────────────────────────────
@app.post("/api/edit-pdf")
async def edit_pdf(
    files: List[UploadFile] = File(...),
    text: str = Form(...),
    x: int = Form(100),
    y: int = Form(100),
    font_size: int = Form(24),
    color: str = Form("#000000")
):
    if not files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang dipilih.")
    if not text:
        raise HTTPException(status_code=400, detail="Teks anotasi tidak boleh kosong.")
    try:
        from pypdf import PdfReader, PdfWriter
        from reportlab.pdfgen import canvas
        from reportlab.lib.colors import HexColor

        results = []
        for f in files:
            content = await f.read()
            reader = PdfReader(io.BytesIO(content))
            writer = PdfWriter()

            for page in reader.pages:
                page_width = float(page.mediabox.width)
                page_height = float(page.mediabox.height)

                packet = io.BytesIO()
                can = canvas.Canvas(packet, pagesize=(page_width, page_height))
                try:
                    can.setFillColor(HexColor(color))
                except Exception:
                    can.setFillColor(HexColor("#000000"))
                can.setFont("Helvetica", font_size)
                can.drawString(x, y, text)
                can.save()
                packet.seek(0)

                from pypdf import PdfReader as PR
                text_page = PR(packet).pages[0]
                page.merge_page(text_page)
                writer.add_page(page)

            buf = io.BytesIO()
            writer.write(buf)
            base = os.path.splitext(f.filename or "edited")[0]
            results.append((f"{base}_edited.pdf", buf.getvalue()))

        if len(results) == 1:
            fname, data = results[0]
            return Response(
                content=data,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={fname}"}
            )
        else:
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zipf:
                for fname, data in results:
                    zipf.writestr(fname, data)
            zip_buf.seek(0)
            return Response(
                content=zip_buf.read(),
                media_type="application/zip",
                headers={"Content-Disposition": "attachment; filename=edited_pdfs.zip"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
