# IPTV Flix Backend

Backend Node.js/Express para usar com o frontend web.

## Rodar localmente

```bash
npm install
npm run dev
```

URL local:

```txt
http://localhost:3000
```

## Deploy no Render

1. Suba este projeto no GitHub.
2. Crie um novo Web Service no Render.
3. Root Directory: `backend`
4. Build Command:

```bash
npm install
```

5. Start Command:

```bash
npm start
```

6. Variáveis opcionais:
   - `API_PIN`: PIN para proteger seu backend.
   - `FRONTEND_ORIGIN`: URL do Netlify, exemplo `https://seuapp.netlify.app`.

## Deploy no Railway

1. Crie um novo projeto no Railway apontando para o GitHub.
2. Defina o diretório raiz como `backend`, se necessário.
3. Start command: `npm start`.
4. Configure as mesmas variáveis opcionais.

## Atenção

O endpoint `/api/proxy` faz streaming pelo backend. Isso consome banda e pode ficar lento em plano gratuito.
Use apenas quando o navegador bloquear HTTP/CORS.
