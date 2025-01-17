#!/bin/bash

# Remove existing zip if present
rm -f peakbagger_gpx_ascent_logger.zip

# Create zip with required extension files
zip -r peakbagger_gpx_ascent_logger.zip \
    manifest.json \
    *.js \
    *.html \
    *.png \
    -x "*.DS_Store" \
    -x "node_modules/*" \
    -x "*/.git/*"

# Verify zip was created
if [ -f peakbagger_gpx_ascent_logger.zip ]; then
    echo "✅ peakbagger_gpx_ascent_logger.zip created successfully"
    echo "📦 Size: $(du -h peakbagger_gpx_ascent_logger.zip | cut -f1)"
else
    echo "❌ Failed to create peakbagger_gpx_ascent_logger.zip"
    exit 1
fi
