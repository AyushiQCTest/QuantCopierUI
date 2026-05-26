#!/bin/bash

# Build the binary
pyinstaller QuantCopierAPI.spec

# Determine platform and file extension
if [[ "$OSTYPE" == "win32" || "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    ext=".exe"
else
    ext=""
fi
echo "Platform detected: $OSTYPE, Using file extension: \"${ext:-none}\""

# Get rust target triple
target_triple=$(rustc -vV | grep 'host:' | cut -d' ' -f2)
if [ -z "$target_triple" ]; then
    echo "Failed to determine platform target triple"
    exit 1
fi

# Create target directory if it doesn't exist
target_dir="../src-tauri/binaries"
mkdir -p "$target_dir"

# Move and rename the binary
mv "dist/QuantCopierAPI${ext}" "${target_dir}/QuantCopierAPI-${target_triple}${ext}"
