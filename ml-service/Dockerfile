FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .

# Create model directory
RUN mkdir -p /app/models

# Environment variables
ENV MODEL_PATH=/app/models/model.pkl
ENV MODEL_VERSION=ml-gbrt-v1.0
ENV CONFIDENCE_LEVEL=0.8
ENV PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8088/health || exit 1

# Expose port
EXPOSE 8088

# Run the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8088", "--workers", "1"]