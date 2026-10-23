// Xpressbot Workspace API (WhatsApp Business). https://one.xpressbot.org/developer
// Auth: X-API-Key header. Template messages: POST /whatsapp/templates/send with flat params
// (to, templateName, languageCode, body1..body20, mediaUrl + mediaType for an image header).
// Rate limits: messaging 20/min, reads 120/min per API user.
import { getSetting } from './settings';

export const XB_DEFAULT_BASE = 'https://one.xpressbot.org/api/workspace/v1';

export class XbError extends Error {
  constructor(message, status = 0, retry = false) { super(message); this.status = status; this.retry = retry; }
}

export async function xbConfig() {
  const [key, base, channel, enabled] = await Promise.all([getSetting('xb_key'), getSetting('xb_base'), getSetting('xb_channel'), getSetting('xb_enabled')]);
  return { key: key || '', base: (base || XB_DEFAULT_BASE).replace(/\/$/, ''), channel: channel || '', enabled: enabled === '1' && !!key };
}

async function call(path, body, cfg) {
  const c = cfg || (await xbConfig());
  if (!c.key) throw new XbError('Xpressbot API key is not set (Settings › WhatsApp automation).', 0, false);
  let res;
  try {
    res = await fetch(`${c.base}${path}`, {
      method: 'POST',
      headers: { 'X-API-Key': c.key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ...(c.channel ? { channelId: c.channel } : {}), ...body }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new XbError(`Could not reach Xpressbot (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`, 0, true);
  }
  let j = null;
  try { j = await res.json(); } catch {}
  if (!res.ok || j?.success === false) {
    const msg = j?.message || j?.error?.message || j?.error || `Xpressbot error ${res.status}`;
    const hint = res.status === 401 ? ' Check the API key.' : res.status === 403 ? ' This key or plan may not allow the Workspace API.' : '';
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    throw new XbError(`${text}${hint && !/[.!?]$/.test(text) ? '.' : ''}${hint}`, res.status, res.status === 429 || res.status >= 500);
  }
  return j?.data ?? j;
}

export const xbChannels = (cfg) => call('/channels/list', {}, cfg);
export const xbTemplates = (cfg) => call('/whatsapp/templates/list', {}, cfg);
export const xbStatus = (wamid, cfg) => call('/whatsapp/message/status', { wamid }, cfg);

/** Meta rejects parameters with new lines, tabs or more than 4 spaces in a row, and empty values. */
export function cleanParam(v, max = 900) {
  const s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max);
  return s || '-';
}

/** Send an approved template. vars: body {{1}}..{{n}} in order. Returns the WhatsApp message id. */
export async function xbSendTemplate({ to, template, language, vars = [], header, buttons = [], buttonParam = 'button', mediaUrl, mediaType = 'image' }, cfg) {
  const body = { to: String(to || '').replace(/\D/g, ''), templateName: template };
  if (!body.to) throw new XbError('No mobile number.', 0, false);
  if (language) body.languageCode = language;
  vars.slice(0, 20).forEach((v, i) => { body[`body${i + 1}`] = cleanParam(v); });
  if (header) body.header = cleanParam(header, 60);
  // dynamic URL buttons: the part after the template's base URL (no spaces)
  buttons.forEach((v, i) => { if (v) body[`${buttonParam}${i + 1}`] = String(v).replace(/\s+/g, '').slice(0, 2000); });
  if (mediaUrl) { body.mediaUrl = mediaUrl; body.mediaType = mediaType; }
  const d = await call('/whatsapp/templates/send', body, cfg);
  const wamid = d?.messages?.[0]?.id || d?.id || d?.wamid || null;
  return { wamid, raw: d };
}
