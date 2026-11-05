# NewMusicAI

Create full songs from a text prompt — vocals, lyrics and instrumentals — powered by the [SunoAPI.org](https://docs.sunoapi.org/) API.

## Features

- **Simple mode**: describe a song in plain words; lyrics are written for you.
- **Custom mode**: your own title, lyrics, style, excluded styles, vocal gender, style adherence, weirdness, variety and length.
- **Write lyrics with AI**: generate lyric options from a topic and drop them into the editor.
- **Models**: V6 (best quality), V6 Mini (fastest), V6 Wild (most creative).
- **Streaming preview**: play the first track while the final audio is still rendering.
- **Library and player**: songs are saved in the browser, with search, a player bar, lyrics view and MP3 download.
- **Credits**: your remaining SunoAPI credits are shown in the header.

## Stack

- `public/`: static frontend in plain HTML, CSS and JS, with no build step.
- `netlify/functions/`: serverless proxy. The Suno API key stays on the server and is never sent to the browser.

| Route | Function | Suno endpoint |
|---|---|---|
| `POST /api/generate` | `generate.mjs` | `POST /api/v1/generate` |
| `GET /api/status?taskId=` | `status.mjs` | `GET /api/v1/generate/record-info` |
| `POST /api/lyrics`, `GET /api/lyrics?taskId=` | `lyrics.mjs` | `POST /api/v1/lyrics`, `GET /api/v1/lyrics/record-info` |
| `GET /api/credits` | `credits.mjs` | `GET /api/v1/generate/credit` |
| `POST /api/callback` | `callback.mjs` | Acknowledges Suno's required `callBackUrl` webhook (the app polls for status) |

## Deploy on Netlify

1. In Netlify, choose **Add new site → Import an existing project** and pick this repo. The settings come from `netlify.toml`: publish directory `public`, functions directory `netlify/functions`, and no build command.
2. Under **Site configuration → Environment variables**, add:
   - `SUNO_API_KEY`: your key from https://sunoapi.org/api-key (**required**)
   - `APP_ACCESS_CODE`: optional. If you set it, visitors must enter this code before they can generate, so strangers can't spend your credits.
3. Redeploy so the functions pick up the variables.

## Local development

```bash
npm i -g netlify-cli
cp .env.example .env   # then put your key in .env
netlify dev
```

Generated files are kept by Suno for 14 days, so download the songs you want to keep.
