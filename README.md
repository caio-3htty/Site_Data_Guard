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

## Publicacao atual
- deploy no Vercel
- binarios publicados em um branch de assets do GitHub, servidos por CDN publica
- `releases/latest.json` apontando para URLs reais de download dos releases

## Publicacao futura
- migrar os binarios para storage externo dedicado, como Cloudflare R2
- trocar os URLs de download para `downloads.secureguard.app`

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
