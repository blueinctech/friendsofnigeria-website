import type { APIRoute } from 'astro';
import { SETTINGS_SCHEMAS } from '../../../../lib/cms/blocks';
import { allBlockFields, type Field } from '../../../../lib/cms/fields';
import type { Module } from '../../../../lib/cms/permissions';
import { getSettings, saveSettings, type SettingsKey } from '../../../../lib/server/settings';
import { validateBlocks, clearedSeoFields } from '../../../../lib/server/validate';
import { mediaByIds, publicMedia } from '../../../../lib/server/media';
import { logActivity } from '../../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../../lib/server/http';

const MODULE: Record<SettingsKey, Module> = { home: 'homepage', site: 'settings', seo: 'seo' };
const LABEL: Record<SettingsKey, string> = { home: 'Homepage', site: 'General settings', seo: 'SEO settings' };

function collectMedia(fields: Field[], data: Record<string, any>, out: unknown[]) {
  for (const f of fields) {
    const v = data?.[f.name];
    if (f.type === 'image') out.push(v);
    else if (f.type === 'list' && Array.isArray(v)) for (const item of v) collectMedia(f.fields ?? [], item, out);
  }
  return out;
}

async function payload(key: SettingsKey) {
  const value = await getSettings(key);
  const media = await mediaByIds(collectMedia(allBlockFields(SETTINGS_SCHEMAS[key]), value, []) as string[]);
  return { value, media: Object.fromEntries(Object.entries(media).map(([k, v]) => [k, publicMedia(v)])) };
}

export const GET: APIRoute = async (ctx) => {
  const key = ctx.params.key as SettingsKey;
  if (!MODULE[key]) return fail('Not found.', 404);
  const g = guard(ctx, MODULE[key], 'view');
  if (isResponse(g)) return g;
  try {
    return json(await payload(key));
  } catch (err) {
    return handleError(err);
  }
};

export const PUT: APIRoute = async (ctx) => {
  const key = ctx.params.key as SettingsKey;
  if (!MODULE[key]) return fail('Not found.', 404);
  const g = guard(ctx, MODULE[key], 'edit');
  if (isResponse(g)) return g;
  try {
    const body = await readJson(ctx.request, 2_000_000);
    const schema = SETTINGS_SCHEMAS[key];
    const { values, errors } = validateBlocks(schema, body.value);
    if (Object.keys(errors).length) return fail('Please correct the highlighted fields.', 422, { errors });
    const before = await getSettings(key);
    const cleared = clearedSeoFields(allBlockFields(schema), before, values);
    if (cleared.length && body._confirmSeoClear !== true) {
      return fail(`You are removing essential SEO information (${cleared.join(', ')}).`, 409, { code: 'seo_clear' });
    }
    await saveSettings(key, values, g.admin.id);
    await logActivity(g.admin, { action: 'update', entityType: 'settings', entityId: key, entityLabel: LABEL[key], ip: clientIp(ctx) });
    return json({ ok: true, ...(await payload(key)) });
  } catch (err) {
    return handleError(err);
  }
};
