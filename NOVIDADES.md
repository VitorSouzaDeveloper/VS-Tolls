# Novidades — VS Tolls v0.16 (macOS & Windows)

## Suporte Nativo para macOS (Apple Silicon & Intel)
- **Engenharia Completa para MacBook**: Desenvolvida versão nativa de alta performance rodando no macOS com aceleração gráfica Metal, compatível com Apple Silicon (M1, M2, M3, M4 Pro/Max/Ultra) e Macs com processador Intel.
- **Inicialização com 1 Clique**: Script `./run-mac.sh` ou `npm start` para abrir a janela nativa no Mac.
- **Sensores do Apple Silicon**: Leitura em tempo real de carga e temperatura de núcleos de Performance (P-Cores) e Eficiência (E-Cores), cluster de GPU Metal, potência em Watts do SoC e rotação de ventoinhas.
- **Diagnóstico de Bateria de MacBook**: Monitoramento de ciclos de carga, saúde máxima percentual, potência em Watts e autonomia.
- **Saúde NVMe S.M.A.R.T. no Mac**: Verificação de desgaste percentual do SSD Apple Fabric, setores com falha e horas ligado.
- **VS BENCH Multi-Plataforma**: Path tracer estilo Cinebench determinístico, benchmark de cena 3D, simulação de jogo com 30 mil unidades, teste de banda de memória unificada e velocidade real de leitura/escrita de SSD com bypass de cache.
- **GPU Burn para Mac**: Torus com pelos e shaders intensivos FurMark-style em tempo real.
- **VS OTIMIZA para Mac**: Limpeza de memória inativa (`purge`), ajustes de aceleração de mouse para jogos, aceleração de animações e encerramento de processos pesados.
- **Inicialização no macOS**: Controle de LaunchAgents do usuário e do sistema (`~/Library/LaunchAgents`) com interruptor para ativar/desativar e backup de restauração.
- **Instalador de Apps via Homebrew Cask**: Instalação pós-formatação de Steam, Chrome, Discord, VLC, VS Code, Keka, Spotify e Blender.
- **VS MAKER no macOS**: Detecção de microcontroladores em portas `/dev/cu.*` (Arduino, ESP32, CH340, CP2102, FTDI) e liberador de portas seriais presas.
- **Novo Logo Vetorial Minimalista**: Identidade visual com o monograma vetorial VS em formato SVG perfeitamente integrado ao design, sem uso de packs de emojis genéricos.
- **Central de Widgets de Mesa & Galeria no Aplicativo**:
  - Nova aba dedicada no menu lateral (**Widgets de Mesa**) com galeria interativa para visualizar e adicionar múltiplos widgets:
    1. **Visão Geral 4-em-1 (Clássico)**: CPU, RAM Real vs Cache, Bateria com Watts e SSD Apple NVMe (330×220px).
    2. **Mini Barra de Status (Ultra Compacta)**: Barra horizontal fina de apenas 52px de altura para cantos de tela (340×52px).
    3. **MacBook Bateria & MagSafe**: Saúde percentual, potência do carregador em Watts, ciclos e autonomia (210×195px).
    4. **Memória RAM & Limpeza Rápida**: Detalhamento de RAM com botão interativo de **Purge** direto da mesa (230×195px).
- **Fixação na Mesa por Padrão + Atalho Global `Shift + \`**:
  - Por padrão, os widgets ficam **fixados na Mesa (wallpaper)**, atrás de todas as janelas abertas.
  - Ao pressionar **`Shift + \`** (ou `Cmd+Shift+\`), todos os widgets vêm instantaneamente para a frente no **Modo Flutuante** sobre todas as janelas para uma conferência rápida. Pressionando novamente, voltam a se fixar na Mesa.
- **Auto-recuperação do Ambiente Electron**:
  - O script `./run-mac.sh` agora possui auto-recuperação de cache e dependências do Electron caso o ambiente seja alterado.
- **Build de Produção Nativo (`.app` e `.dmg`)**:
  - Configurado empacotamento profissional com `electron-builder`.
  - Ícone nativo do macOS em alta resolução (`app.icns` gerado com squircle Apple a 1024x1024).
  - Gera o executável nativo **`VS Tolls.app`** instalado em `/Applications` e o instalador arrastável **`VS Tolls-1.0.0-arm64.dmg`**.
  - Scripts disponíveis: `npm run build:mac`, `npm run build:mac:dir` e `npm run build:mac:all`.


