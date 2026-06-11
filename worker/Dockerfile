FROM python:3.12-slim

# Tesseract, poppler (pdftotext + pdf rendering), ghostscript (PS/PDF support
# needed by ocrmypdf), and libpq for psycopg2.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-por \
        tesseract-ocr-deu \
        poppler-utils \
        ghostscript \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1000 app \
    && useradd -u 1000 -g app -s /sbin/nologin -M app

# Workers need a writable /tmp for Tesseract and ocrmypdf temp files.
# The compose file mounts /tmp and /var/tmp as tmpfs.
ENV TMPDIR=/tmp

WORKDIR /app
COPY worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY worker/worker.py    ./
COPY worker/ocr/         ./ocr/

USER app
CMD ["python", "-u", "worker.py"]
