#!/usr/bin/env bash
# ==============================================================================
# VS TOLLS — Script de Inicialização para macOS (MacBook / Mac)
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo "          🚀 INICIANDO VS TOLLS (macOS Edition)           "
echo "=========================================================="

# 1. Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não foi encontrado no sistema."
    echo "💡 Instale o Node.js via Homebrew: brew install node"
    exit 1
fi

echo "✓ Node.js detectado: $(node -v)"

# 2. Verificar dependências (node_modules)
if [ ! -d "node_modules" ] || [ ! -d "node_modules/electron" ]; then
    echo "📦 Instalando dependências necessárias..."
    npm install
fi

echo "✓ Dependências prontas!"

# 3. Iniciar aplicação
if [ "$1" == "--web" ]; then
    echo "🌐 Iniciando no modo Servidor Web..."
    node mac/server.js
elif [ "$1" == "--widget" ]; then
    echo "🪟 Iniciando Mini-Widget de Mesa do VS Tolls..."
    npx electron mac/main.js --widget-only
else
    echo "💻 Abrindo janela nativa do macOS com Electron..."
    npx electron mac/main.js
fi
