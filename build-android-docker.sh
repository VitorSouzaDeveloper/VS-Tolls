#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo "  VS DROP — Compilador Android via Docker (Sem Android Studio)"
echo "=========================================================="

if ! command -v docker &> /dev/null; then
  echo "❌ Docker não encontrado. Certifique-se de que o Docker Desktop esteja instalado e rodando."
  exit 1
fi

echo "🚀 Iniciando container com Android SDK 34..."

docker run --rm \
  -v "$SCRIPT_DIR/android":/workspace \
  -w /workspace \
  ghcr.io/cirruslabs/android-sdk:34 \
  bash -c "chmod +x gradlew && ./gradlew assembleDebug --no-daemon"

APK_PATH="$SCRIPT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_PATH" ]; then
  echo ""
  echo "=========================================================="
  echo "  ✅ APK COMPILADO COM SUCESSO!"
  echo "  📍 Arquivo: $APK_PATH"
  echo "=========================================================="
  open -R "$APK_PATH" 2>/dev/null || true
else
  echo "❌ Não foi possível localizar o arquivo APK gerado."
  exit 1
fi

