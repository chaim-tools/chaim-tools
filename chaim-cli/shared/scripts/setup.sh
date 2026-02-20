#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Setting up Chaim CLI (TypeScript)"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js v18 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "Node.js version: $(node -v) OK"

# Install dependencies
echo "Installing dependencies..."
cd "$PROJECT_ROOT"
npm install

# Build the TypeScript CLI
echo "Building TypeScript CLI..."
npx tsc

echo ""
echo "Setup complete!"
echo ""
echo "Usage:"
echo "  npx chaim generate --stack MyStack --package com.example"
echo "  npx chaim validate ./schemas/user.bprint"
echo "  npx chaim doctor"
