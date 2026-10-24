# VS Tolls — v0.16 (macOS & Windows)

> **VS Tolls** é uma suíte completa de diagnóstico de hardware, monitoramento de sensores em tempo real, placa de vídeo, estimativa de FPS em jogos, benchmarks de CPU/GPU/RAM/SSD, otimizador de sistema e ferramentas de inicialização e hardware maker.
>
> Disponível para **macOS (Apple Silicon M1/M2/M3/M4 e Intel)** e **Windows (10/11 64-bit)**.

---

## Como Rodar no MacBook / macOS

O VS Tolls foi totalmente reprojetado para rodar nativamente no macOS com suporte a aceleração gráfica Metal, telemetria de sensores do Apple Silicon e leitura de saúde de bateria e SSD NVMe.

### Pré-requisitos
- macOS Monterey, Ventura, Sonoma ou Sequoia (Apple Silicon ou Intel).
- Node.js instalado (se não tiver: `brew install node`).

### Executando com 1 Clique:
```bash
./run-mac.sh
```
Ou via npm:
```bash
# Modo Janela Nativa Desktop (Electron)
npm start

# Modo Web Server (abrir em qualquer navegador no Mac)
npm run web
```
Acesse no navegador: `http://localhost:3000`

---

## Como Rodar no Windows

```powershell
dotnet run
```
Requisitos: Windows 10/11 64 bits com .NET 8.

---

## Funcionalidades e Categorias do VS Tolls

### 1. Visão Geral (Dashboard)
- Gráfico em tempo real de telemetria comparando CPU e GPU em tempo real.
- Medidores circulares de Carga da CPU, Memória Unificada / RAM, Armazenamento SSD e Saúde da Bateria.
- Tabela rápida com modelo do Mac, identificador, arquitetura e sistema operacional.
- Veredito instantâneo da integridade geral do hardware.

### 2. VS TOLLS (Sistema & Diagnóstico)
- **Sistema**: Detalhes completos do modelo do Mac, processador (núcleos de Performance e Eficiência), memória LPDDR5, gráficos Metal 4, volumes APFS, telas Liquid Retina XDR com ProMotion 120Hz e números de série.
- **Sensores em Tempo Real**: Monitoramento a cada 1 segundo com busca e filtros (CPU, GPU, Temperatura, Potência em Watts, Rotação de Coolers/Ventoinhas e núcleos individuais).
- **Placa de Vídeo (Estilo GPU-Z)**: Detalhes de arquitetura gráfica (Apple Silicon / AMD / Intel), núcleos de GPU, execution units, poder computacional FP32 (TFLOPS), barramento de memória, largura de banda (204.8 GB/s), APIs gráficas (Metal 4, WebGPU) e sensores ao vivo.
- **Discos & S.M.A.R.T.**: Leitura direta de saúde NVMe S.M.A.R.T. — percentual de desgaste, horas ligado, ciclos de energia, temperatura interna, setores com falha e veredito de confiabilidade.
- **Energia & Bateria**: Diagnóstico aprofundado para MacBook — capacidade máxima de projeto, saúde percentual da bateria, ciclos de carga acumulados, potência em Watts e autonomia estimada.
- **Rede & Latência**: Diagnóstico completo de latência (ping para roteador local, 1.1.1.1 e 8.8.8.8), tempo de resolução DNS, jitter, perda de pacotes e teste de throughput / responsividade (RPM) via ferramenta nativa `networkQuality`.

### 3. VS JOGOS
- **Biblioteca de Jogos**: Detecção automática de jogos no Mac (Steam, jogos nativos em `/Applications`, CrossOver / Whisky).
- **FPS Estimado**: Catálogo de mais de 16 jogos populares com estimativa de FPS por resolução (1080p, 1440p, 4K), predefinição gráfica (Baixa, Média, Alta, Ultra) e MetalFX Upscaling.
- **Detector de Gargalo**: Análise de balanço térmico e computacional entre CPU e GPU, identificando se o sistema está limitado por processador, gráficos ou limite térmico (Thermal Throttling).
- **Overlay de Jogos (HUD)**: Pré-visualização e configuração de métricas flutuantes (FPS, frametime, uso de CPU, GPU, RAM e bateria).

### 4. VS DESEMPENHO
- **VS BENCH**:
  - *CPU Path Tracer (Cinebench-style)*: Renderizador determinístico de iluminação global com esferas, reflexos de metal e refração em vidro, testando multi-core e single-core com pontuação de referência.
  - *GPU 3D Scene*: Cena 3D em tempo real com terreno fractal, água com reflexos, instancing de milhares de árvores e iluminação dinâmica, medindo FPS médio e 1% low.
  - *Simulação de Jogo*: 30.000 unidades em combate com IA e física multi-thread.
  - *Memória Unificada*: Teste de banda sequencial (GB/s) e latência de memória (ns).
  - *Disco NVMe*: Benchmark real de leitura e escrita sequencial 1MB e aleatória 4K com bypass de buffers de cache.
- **Stress Test & GPU Burn**:
  - *Stress de CPU e RAM* com monitoramento térmico ativo e desligamento de emergência caso a temperatura ultrapasse o limite configurado.
  - *GPU Burn (FurMark-style)*: Torus 3D com dezenas de camadas de pelo e shaders pesados de FMA para testar estabilidade máxima da GPU.
- **Mac Tuning & Estabilidade**: Monitoramento do regulador térmico da Apple (`pmset -g therm`), detecção de thermal throttling e log de estabilidade do sistema.

### 5. VS FERRAMENTAS
- **VS OTIMIZA**:
  - Botão de 1 clique para limpar memória inativa e buffers de cache (`purge`).
  - Ajustes de sistema do macOS: desativação de aceleração de mouse para jogos FPS, aceleração de animações do Dock e do Finder, e restauração de padrões do macOS.
  - Encerramento seguro de programas pesados em segundo plano.
- **Inicialização (Startup Manager)**:
  - Gerenciamento dos itens que abrem com o Mac (`~/Library/LaunchAgents` e `/Library/LaunchAgents`).
  - Interruptor para Ativar / Desativar qualquer agente de inicialização.
  - Botão para remover com backup automático para poder restaurar a qualquer momento.
- **Instalar Apps Essenciais**:
  - Instalação silenciosa de aplicativos essenciais pós-formatação via Homebrew Cask (Steam, Discord, Google Chrome, VLC, Visual Studio Code, Keka, Shottr, Spotify, Blender, OBS).
  - Detecção automática dos apps que já estão instalados no Mac.

### 6. VS MAKER (Arduino & Microcontroladores)
- **Portas Seriais**: Listagem e identificação automática de dispositivos conectados (`/dev/cu.*`), incluindo chips CH340, CP2102, FTDI, Arduino nativo e ESP32.
- **Liberador de Portas Presas**: Detecção de processos que estão bloqueando a porta serial com botão para liberar com 1 clique.
- **Drivers Seriais**: Guias de diagnóstico e links oficiais para instalação de drivers e DEXTs no macOS.

---

## Exportação de Relatórios
O botão **Exportar Relatório** gera instantaneamente um arquivo HTML estilizado ou arquivo JSON na Área de Trabalho com o diagnóstico completo do computador.

## Licença
Distribuído sob a licença [MIT](LICENSE).
