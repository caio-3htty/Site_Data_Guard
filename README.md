# SecureGuard Site

Site publico do SecureGuard para deploy no Vercel.

## Rotas
- `/`: apresentacao do produto
- `/downloads`: downloads de Windows e Android
- `/criar-conta`: cadastro real consumindo a API publica
- `/criar-conta/sucesso`: confirmacao de cadastro com downloads diretos
- `/privacidade`: resumo da politica de privacidade publica
- `/termos`: termos publicos resumidos

## Manifestos publicos
- `/client-config.json`
- `/releases/latest.json`

## Responsabilidade deste repo
- apresentar o produto
- criar conta real na plataforma publica
- distribuir os binarios oficiais de Windows e Android
- expor o `client-config.json` consumido pelos apps em producao

## Publicacao esperada
- deploy no Vercel
- binarios publicados em storage externo versionado, como Cloudflare R2
- `releases/latest.json` apontando para os URLs reais do storage

## Variaveis e pontos de integracao
- `public/client-config.json`: endpoint padrao da API publica consumida pelos apps
- `public/releases/latest.json`: manifesto de release exibido na pagina de downloads
- o cadastro chama `POST /api/auth/register` na API publica configurada em `client-config.json`

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
