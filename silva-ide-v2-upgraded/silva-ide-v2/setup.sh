#!/usr/bin/env bash
# Silva IDE — Quick Setup Script
set -e

echo "⬡ Silva IDE Setup"
echo "─────────────────"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js not found. Install from https://nodejs.org (v18+)"
  exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js v18+ required (found v$NODE_VERSION)"
  exit 1
fi

echo "✓ Node.js $(node --version)"
echo "✓ npm $(npm --version)"
echo ""

echo "Installing dependencies..."
npm install

echo ""
echo "✓ Setup complete!"
echo ""
echo "To launch Silva IDE:"
echo "  npm start"
echo ""
echo "To build a distributable:"
echo "  npm run build"
echo ""
echo "Don't forget to add your AI API keys in Settings!"
