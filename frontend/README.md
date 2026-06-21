# IPTV Flix Frontend

Frontend estático/PWA para Netlify.

## Rodar localmente

```bash
npx serve .
```

ou use Live Server.

## Deploy no Netlify

Opção simples:

1. Arraste a pasta `frontend` para o Netlify Drop.

Opção GitHub:

1. Suba o projeto para o GitHub.
2. No Netlify, crie um novo site.
3. Base directory: `frontend`.
4. Publish directory: `frontend` ou `.`, dependendo da configuração do Netlify.
5. Build command pode ficar vazio.

Depois abra o app e coloque a URL do backend, exemplo:

```txt
https://seu-backend.onrender.com
```

## iPhone

Abra no Safari e use:

```txt
Compartilhar > Adicionar à Tela de Início
```


## Cast/AirPlay

- Chrome/Android/PC: tenta Chromecast com Google Cast Web Sender.
- Safari/iPhone: tenta AirPlay quando disponível.
- Se não houver suporte, o app copia o link do vídeo.
