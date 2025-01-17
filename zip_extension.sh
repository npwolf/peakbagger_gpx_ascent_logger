#!/bin/bash

# Remove existing zip if present
rm -f extension.zip

# Create zip with required extension files
zip -r extension.zip \
    manifest.json \
    *.js \
    *.html \
    *.png \
    -x "*.DS_Store" \
    -x "node_modules/*" \
    -x "*/.git/*"

# Verify zip was created
if [ -f extension.zip ]; then
    echo "✅ Extension zip created successfully"
    echo "📦 Size: $(du -h extension.zip | cut -f1)"
else
    echo "❌ Failed to create extension zip"
    exit 1
fi
