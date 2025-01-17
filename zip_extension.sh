#!/bin/bash

# Get version from manifest.json
VERSION=$(jq -r '.version' manifest.json)
ZIP_NAME="peakbagger_gpx_ascent_logger-v${VERSION}.zip"

# Remove existing zip if present
rm -f "$ZIP_NAME"

# Create zip with required extension files
zip -r "$ZIP_NAME" \
    manifest.json \
    *.js \
    *.html \
    *.png \
    -x "*.DS_Store" \
    -x "node_modules/*" \
    -x "*/.git/*"

# Verify zip was created
if [ -f "$ZIP_NAME" ]; then
    echo "✅ $ZIP_NAME created successfully"
    echo "📦 Size: $(du -h "$ZIP_NAME" | cut -f1)"
else
    echo "❌ Failed to create $ZIP_NAME"
    exit 1
fi
