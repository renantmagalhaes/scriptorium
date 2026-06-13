FROM python:3.12-slim

RUN groupadd -g 1000 app \
    && useradd -u 1000 -g app -s /sbin/nologin -M app

WORKDIR /app
COPY scanner/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY scanner/scanner.py ./
# Copy worker's ocr module to share the supported extensions list
COPY worker/ocr/ ./ocr/

USER app
CMD ["python", "-u", "scanner.py"]
