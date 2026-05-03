# DeepSeek Worker Proxy

Cloudflare Worker proxy for the movie ticket code generator.

## Deploy

```bash
cd worker
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler deploy
```

The frontend calls:

```text
POST /parse
```

with:

```json
{"text":"电影取票通知文本"}
```

The DeepSeek API key is stored only as a Cloudflare Worker secret.
