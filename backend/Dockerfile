# Usa un'immagine Python leggera
FROM python:3.10-slim

# Imposta la directory di lavoro
WORKDIR /app

# Installa dipendenze di sistema necessarie per compilare psutil e OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    curl \
    tesseract-ocr \
    tesseract-ocr-ita \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copia le dipendenze e installale
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y gcc python3-dev \
    && apt-get autoremove -y

# Copia il codice sorgente
COPY . .

# Crea un user non-root per security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Espone la porta del backend
EXPOSE 8000

# Avvia il server con 2 workers (fit within 512Mi memory limit)
CMD ["gunicorn", "-w", "2", "-k", "uvicorn.workers.UvicornWorker", "main:app", "--bind", "0.0.0.0:8000", "--timeout", "120"]
