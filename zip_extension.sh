#!/bin/bash

# Remove existing zip if present
rm -f add_ascent_to_peakbagger.zip

# Create zip with required extension files
zip -r add_ascent_to_peakbagger.zip \
    manifest.json \
    *.js \
    *.html \
    *.png \
    -x "*.DS_Store" \
    -x "node_modules/*" \
    -x "*/.git/*"

# Verify zip was created
if [ -f add_ascent_to_peakbagger.zip ]; then
    echo "✅ add_ascent_to_peakbagger.zip created successfully"
    echo "📦 Size: $(du -h add_ascent_to_peakbagger.zip | cut -f1)"
else
    echo "❌ Failed to create add_ascent_to_peakbagger.zip"
    exit 1
fi
