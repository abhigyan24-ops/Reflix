# Use Python 3.10 slim official image
FROM python:3.10-slim

# Allow logs to appear immediately in Cloud Logging
ENV PYTHONUNBUFFERED True

# Set working directory
WORKDIR /app

# Copy application files
COPY . .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose default port
EXPOSE 8080

# Run the web service on container startup using Gunicorn
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app
