# Kavel AI Image Generator for Obsidian

Put a picture in your note without leaving it. Run **Generate image into this note**, describe what you
want, and the image is saved to your vault and embedded at the cursor. Right-click any image in your
vault and choose **Edit with Kavel** to change it with one sentence (editing needs an API key).

**No API key needed to generate** — powered by [Kavel](https://www.kavel.ai/?utm_source=obsidian&utm_medium=plugin).

## What you can do

- **Generate** — prompt + aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4). The image lands in the `Kavel` folder
  (configurable) and `![[…]]` is inserted where you were typing.
- **Edit** — from the file menu of any PNG, JPG or WebP, or with the cursor on an embedded image:
  *"make the sky a warm sunset; keep everything else unchanged"*. The edited copy is saved next to the others.
- Works on desktop and mobile.

## Free tier, then your account

With the API key field empty the plugin runs on Kavel's free tier: no account, 1K output with a
watermark, about two new images a day. Editing is not on the free tier. Paste a key from
[kavel.ai/settings/apikeys](https://www.kavel.ai/settings/apikeys?utm_source=obsidian&utm_medium=plugin) into **Settings → Kavel** and every
run uses your account instead — your credits, no daily ceiling, no watermark on a paid plan, and the model
of your choice:
[Nano Banana 2](https://www.kavel.ai/image/nano-banana-2?utm_source=obsidian&utm_medium=plugin),
[GPT Image 2](https://www.kavel.ai/image/gpt-image-2?utm_source=obsidian&utm_medium=plugin),
[Qwen Image 3](https://www.kavel.ai/image/qwen-image-3?utm_source=obsidian&utm_medium=plugin) for pictures with readable text,
[Seedream 5.0 Pro](https://www.kavel.ai/image/seedream-5-pro?utm_source=obsidian&utm_medium=plugin).
[Pricing](https://www.kavel.ai/pricing?utm_source=obsidian&utm_medium=plugin) lists the plans.

## Prompts that work

Name the style, the light and what is in frame: *"watercolor map of a small coastal town, soft morning
light"* beats *"map"*. For edits, say what must stay the same — the edit model
([Nano Banana 2 Lite](https://www.kavel.ai/image/nano-banana-2-lite?utm_source=obsidian&utm_medium=plugin)) keeps what it can see and
invents what it cannot.

## Privacy and network use

This plugin sends your prompt to kavel.ai to generate images. When you edit an image, that image is
uploaded to Kavel's CDN so the model can read it. Nothing else in your vault is read or sent. No
telemetry.

MIT
