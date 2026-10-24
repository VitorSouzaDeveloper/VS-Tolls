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
- **Novo Logo Vetorial Minimalista**: Identidade visual com o monograma vetorial VS em formato SVG preto e branco perfeitamente integrado ao design.
