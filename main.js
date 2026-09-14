'use strict';
const { Plugin, Modal, Notice, PluginSettingTab, Setting, TFile, requestUrl, normalizePath, MarkdownView } = require('obsidian');

const BASE = 'https://www.kavel.ai';
const KEYS_URL = `${BASE}/settings/apikeys?utm_source=obsidian&utm_medium=plugin`;
const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const DEFAULTS = { apiKey: '', model: '', folder: 'Kavel' };

function anonId() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return 'obs-' + Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
}

/** requestUrl, not fetch: it is not subject to CORS inside the app. */
async function call(method, url, { json, body, contentType, headers = {} } = {}) {
  const res = await requestUrl({
    url, method, throw: false,
    headers: { ...headers, ...(contentType ? { 'Content-Type': contentType } : {}) },
    body: json ? JSON.stringify(json) : body,
    contentType: json ? 'application/json' : contentType,
  });
  try { return res.json; } catch { return {}; }
}

function parseSubmit(env) {
  if (env.code !== 0) throw new Error(env.message || 'request refused');
  const d = env.data || {};
  if (d.wall) throw new Error('Free Kavel allowance used up for today. Add an API key in Settings → Kavel to keep going.');
  if (!d.id) throw new Error('Kavel returned no task id');
  return String(d.id);
}

async function runKavel(prompt, { imageUrl, aspectRatio = '1:1', apiKey, model, onQueued, pollEveryMs = 5000, timeoutMs = 360000, base = BASE } = {}) {
  const key = (apiKey || '').trim() || null;
  const auth = key ? { Authorization: `Bearer ${key}` } : { 'x-anon-id': anonId() };
  const env = await call('POST', `${base}/api/ai/generate`, {
    headers: auth,
    json: {
      provider: 'kie', mediaType: 'image',
      model: key && model ? model : imageUrl ? 'nano-banana-2-lite' : 'kavel-image-v1',
      scene: imageUrl ? 'image-to-image' : 'text-to-image',
      prompt,
      options: imageUrl ? { image_input: [imageUrl] } : { aspect_ratio: aspectRatio },
    },
  });
  const task = parseSubmit(env);
  onQueued?.();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollEveryMs));
    let polled;
    try {
      polled = key
        ? await call('POST', `${base}/api/ai/query`, { headers: auth, json: { taskId: task } })
        : await call('GET', `${base}/api/ai/anon-query?taskId=${encodeURIComponent(task)}&provider=kie&mediaType=image`, { headers: auth });
    } catch { continue; } // a dropped poll is not a failed run
    if (polled.code !== 0) continue;
    const d = polled.data || {};
    if (d.cleanImages?.length) return d.cleanImages[0];
    if (d.images?.length) return d.images[0];
    if (d.status === 'failed' || d.status === 'error') throw new Error('Kavel refused this prompt — reword it rather than retrying the same text');
  }
  throw new Error('Kavel did not finish in time');
}

async function uploadImage(bytes, filename, base = BASE) {
  const ext = (filename.match(/\.([a-z0-9]+)$/i) || [, 'png'])[1].toLowerCase();
  const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png';
  const boundary = '----kavel' + anonId();
  const enc = new TextEncoder();
  const head = enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename.replace(/"/g, '')}"\r\nContent-Type: ${type}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.byteLength + tail.length);
  body.set(head, 0); body.set(new Uint8Array(bytes), head.length); body.set(tail, head.length + bytes.byteLength);
  const env = await call('POST', `${base}/api/storage/upload-image`, { body: body.buffer, contentType: `multipart/form-data; boundary=${boundary}` });
  const url = env?.data?.urls?.[0];
  if (env.code !== 0 || !url) throw new Error(`upload failed: ${env.message || 'no url'}`);
  return url;
}

class PromptModal extends Modal {
  constructor(app, { title, placeholder, withRatio }, onSubmit) {
    super(app);
    Object.assign(this, { title, placeholder, withRatio, onSubmit, ratio: '1:1', prompt: '' });
  }
  onOpen() {
    this.titleEl.setText(this.title);
    new Setting(this.contentEl).setName('Prompt').addTextArea((t) => {
      t.setPlaceholder(this.placeholder).onChange((v) => (this.prompt = v));
      t.inputEl.rows = 4;
      t.inputEl.style.width = '100%';
    });
    if (this.withRatio) {
      new Setting(this.contentEl).setName('Aspect ratio').addDropdown((d) => {
        RATIOS.forEach((r) => d.addOption(r, r));
        d.setValue('1:1').onChange((v) => (this.ratio = v));
      });
    }
    new Setting(this.contentEl).addButton((b) => b.setButtonText('Generate').setCta().onClick(() => {
      if (!this.prompt.trim()) return new Notice('Write a prompt first.');
      this.close();
      this.onSubmit(this.prompt.trim(), this.ratio);
    }));
  }
  onClose() { this.contentEl.empty(); }
}

module.exports = class KavelPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new KavelSettingTab(this.app, this));

    this.addCommand({
      id: 'generate-image',
      name: 'Generate image into this note',
      callback: () => this.generate(),
    });
    this.addCommand({
      id: 'edit-active-image',
      name: 'Edit the image under the cursor',
      editorCallback: (editor) => {
        const line = editor.getLine(editor.getCursor().line);
        const m = line.match(/!\[\[([^\]|]+)/);
        const file = m && this.app.metadataCache.getFirstLinkpathDest(m[1], this.app.workspace.getActiveFile()?.path || '');
        if (!file) return new Notice('Put the cursor on a line with an embedded image (![[…]]).');
        this.edit(file);
      },
    });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && /^(png|jpe?g|webp)$/i.test(file.extension)) {
        menu.addItem((item) => item.setTitle('Edit with Kavel').setIcon('wand').onClick(() => this.edit(file)));
      }
    }));
  }

  async save(url, name) {
    const res = await requestUrl({ url });
    const ext = (url.match(/\.(webp|png|jpe?g)(\?|$)/i) || [, 'webp'])[1];
    const folder = normalizePath(this.settings.folder || 'Kavel');
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const path = normalizePath(`${folder}/${name}-${Date.now().toString(36)}.${ext}`);
    return this.app.vault.createBinary(path, res.arrayBuffer);
  }

  generate() {
    new PromptModal(this.app, { title: 'Kavel: generate image', placeholder: 'watercolor map of a small coastal town, soft morning light', withRatio: true }, async (prompt, ratio) => {
      const notice = new Notice('Kavel: submitting…', 0);
      try {
        const url = await runKavel(prompt, { aspectRatio: ratio, apiKey: this.settings.apiKey, model: this.settings.model, onQueued: () => notice.setMessage(this.settings.apiKey ? 'Kavel: generating…' : 'Kavel: in the free queue (25–80 s)…') });
        const file = await this.save(url, `kavel-${slug(prompt)}`);
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) view.editor.replaceSelection(`![[${file.path}]]\n`);
        notice.setMessage(`Kavel: saved ${file.path}`);
      } catch (e) {
        notice.setMessage(`Kavel: ${e.message}`);
      } finally {
        setTimeout(() => notice.hide(), 6000);
      }
    }).open();
  }

  edit(file) {
    new PromptModal(this.app, { title: `Kavel: edit ${file.name}`, placeholder: 'make the sky a warm sunset; keep everything else unchanged', withRatio: false }, async (instruction) => {
      const notice = new Notice('Kavel: uploading…', 0);
      try {
        const imageUrl = await uploadImage(await this.app.vault.readBinary(file), file.name);
        const url = await runKavel(instruction, { imageUrl, apiKey: this.settings.apiKey, model: this.settings.model, onQueued: () => notice.setMessage('Kavel: editing…') });
        const out = await this.save(url, `${file.basename}-kavel`);
        notice.setMessage(`Kavel: saved ${out.path}`);
      } catch (e) {
        notice.setMessage(`Kavel: ${e.message}`);
      } finally {
        setTimeout(() => notice.hide(), 6000);
      }
    }).open();
  }
};

class KavelSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName('API key')
      .setDesc('Optional. Empty = free tier (watermarked, a few images a day). A key from kavel.ai/settings/apikeys runs on your account.')
      .addText((t) => {
        t.inputEl.type = 'password';
        t.setValue(this.plugin.settings.apiKey).onChange(async (v) => { this.plugin.settings.apiKey = v.trim(); await this.plugin.saveData(this.plugin.settings); });
      })
      .addExtraButton((b) => b.setIcon('external-link').setTooltip('Get a key').onClick(() => window.open(KEYS_URL)));
    new Setting(containerEl)
      .setName('Model')
      .setDesc('Used only with an API key, e.g. nano-banana-2, gpt-image-2, seedream-5-pro.')
      .addText((t) => t.setValue(this.plugin.settings.model).onChange(async (v) => { this.plugin.settings.model = v.trim(); await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl)
      .setName('Folder')
      .setDesc('Vault folder for generated images.')
      .addText((t) => t.setValue(this.plugin.settings.folder).onChange(async (v) => { this.plugin.settings.folder = v.trim() || 'Kavel'; await this.plugin.saveData(this.plugin.settings); }));
  }
}

module.exports.runKavel = runKavel;
module.exports.uploadImage = uploadImage;
module.exports.parseSubmit = parseSubmit;
