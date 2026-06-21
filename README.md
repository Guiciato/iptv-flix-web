# IPTV Flix Web/PWA

Versão web do IPTV Flix para navegador, celular e desktop.

Estrutura:

```txt
iptv-flix-web-v1.0/
├─ frontend/   # sobe no Netlify
└─ backend/    # sobe no Render ou Railway
```

## Importante

Use apenas listas, canais, filmes e séries que você tem autorização legal para acessar.  
Este projeto não quebra DRM, não libera conteúdo pago, não hospeda mídia e não remove proteção de conteúdo.

## Como rodar localmente

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

O backend abre em:

```txt
http://localhost:3000
```

### 2. Frontend

Abra outro terminal:

```bash
cd frontend
npx serve .
```

ou use a extensão Live Server no VS Code.

No login do app, coloque:

```txt
Backend: http://localhost:3000
```

## Deploy recomendado

- Frontend: Netlify
- Backend: Render ou Railway

## Observações de iPhone / Android / PC

- iPhone/Safari funciona melhor com vídeos `.m3u8` HLS.
- Se o site estiver em HTTPS e o servidor IPTV for HTTP, o navegador pode bloquear. Nesse caso, ative o modo Proxy no player.
- O modo Proxy passa o vídeo pelo backend, então consome banda do Render/Railway. Use apenas quando necessário.
- Para PWA, no iPhone abra no Safari e use “Adicionar à Tela de Início”.


## Atualização 1.1

Mudanças adicionadas:

- Player Web/PWA com botão `Cast/AirPlay`.
- Chrome/Android/PC tenta usar Google Cast Web Sender.
- Safari/iPhone tenta abrir AirPlay quando disponível.
- Caso o navegador não suporte Cast/AirPlay, o app copia o link do vídeo.
- O player agora usa `x-webkit-airplay="allow"`.

Observação: iPhone/Safari não envia para Chromecast pelo Cast SDK como o Chrome/Android. No iPhone, o caminho nativo é AirPlay. Chromecast no navegador funciona melhor no Chrome/Android/PC.
