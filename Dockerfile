# Use Python base image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Copy files
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Cloud Run expects the service to listen on PORT env var
ENV PORT=8080

# Expose port (not strictly required but good practice)
EXPOSE 8080

# Start Gunicorn (production)
CMD ["gunicorn", "-b", "0.0.0.0:8080", "app:app"]
