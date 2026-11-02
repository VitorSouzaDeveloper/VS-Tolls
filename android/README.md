# VS Drop — App Android Nativo

Aplicativo Android nativo para transferência ultrarrápida de arquivos ponto a ponto (P2P) entre **Mac ⇄ Android**, estilo **AirDrop / Quick Share**.

---

## ✨ Recursos

1. **Menu Compartilhar Nativo do Android (`Intent.ACTION_SEND` & `ACTION_SEND_MULTIPLE`)**:
   - Em qualquer aplicativo do celular (WhatsApp, Google Fotos, Galeria, Navegador, Gerenciador de Arquivos):
   - Toque em **Compartilhar (Share)** ➔ selecione **Enviar com VS Drop**.
   - O radar abre instantaneamente mostrando os Macs disponíveis na rede Wi-Fi.
   - Toque no Mac para transferir com streaming direto (sem compressão e sem passar pela nuvem).

2. **Radar de Descoberta Automática de Rede (UDP Beacon)**:
   - Rastreamento instantâneo de dispositivos na mesma rede Wi-Fi na porta UDP `8765`.
   - **Zero necessidade de escanear QR Code** quando o app está instalado.

3. **Modos de Visibilidade (Estilo AirDrop)**:
   - 🟢 **Todos na Rede**: O aparelho é detectável por qualquer Mac ou Android no Wi-Fi.
   - 🟡 **Apenas Pareados**: Apenas computadores/celulares autorizados conseguem ver o dispositivo no radar.
   - 🔴 **Invisível (Oculto)**: Desativa anúncios e transmissão na rede.

4. **Recepção Direta no Celular**:
   - Salva automaticamente os arquivos recebidos em `Downloads/VS-Drop/`.
   - Notifica a `MediaStore` do Android para que fotos e vídeos apareçam imediatamente na Galeria e no Google Fotos.

5. **Opção Alternativa sem Instalar App**:
   - Quem não quiser instalar o app no celular ainda pode usar o **QR Code** no Mac para abrir a interface Web PWA no navegador do iPhone ou Android.

---

## 🛠️ Como Abrir e Compilar no Android Studio

1. Abra o **Android Studio**.
2. Clique em **Open** e selecione a pasta `android` deste projeto (`VS-Tolls/android`).
3. Aguarde o Gradle sincronizar as dependências.
4. Conecte seu celular Android via USB (com Depuração USB ativada) ou inicie um emulador.
5. Clique em **Run ▶️** (ou use `./gradlew assembleDebug` no terminal).
6. O APK gerado fica localizado em:
   `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📱 Requisitos

* Android 7.0 (API 24) ou superior.
* Mac e Android conectados na mesma rede Wi-Fi local.

