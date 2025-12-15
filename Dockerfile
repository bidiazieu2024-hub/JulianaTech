# Use the official lightweight Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy files
COPY . .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Run the Flask app using Gunicorn
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 main:app
