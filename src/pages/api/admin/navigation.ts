import type { APIRoute } from 'astro';
import { query, transaction } from '../../../lib/server/db';
import { cleanText, cleanUrl } from '../../../lib/server/sanitize';
import { ICONS } from '../../../lib/cms/fields';
import { logActivity } from '../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../lib/server/http';

const MENUS = ['header', 'membership', 'footer'] as const;
type Menu = (typeof MENUS)[number];

interface InItem {
  label?: unknown;
  url?: unknown;
  description?: unknown;
  icon?: unknown;
  new_tab?: unknown;
  visible?: unknown;
  children?: InItem[];
}

export const GET: APIRoute = async (ctx) => {
  const g = guard(ctx, 'navigation', 'view');
  if (isResponse(g)) return g;
  try {
    const rows = await query('SELECT id, menu, parent_id, label, url, description, icon, new_tab, visible, sort_order FROM nav_items ORDER BY sort_order');
    const tree = Object.fromEntries(
      MENUS.map((m) => [
        m,
        rows
          .filter((r) => r.menu === m && !r.parent_id)
          .map((r) => ({ ...r, children: rows.filter((c) => c.parent_id === r.id) })),
      ]),
    );
    return json({ menus: tree });
  } catch (err) {
    return handleError(err);
  }
};

/** Replaces one menu: { menu, items: [{ label, url, ..., children: [...] }] } */
export const PUT: APIRoute = async (ctx) => {
  const g = guard(ctx, 'navigation', 'edit');
  if (isResponse(g)) return g;
  try {
    const body = await readJson<{ menu: Menu; items: InItem[] }>(ctx.request);
    if (!MENUS.includes(body.menu)) return fail('Unknown menu.', 400);
    if (!Array.isArray(body.items) || body.items.length > 30) return fail('A menu can hold up to 30 items.', 400);

    const errors: string[] = [];
    const clean = (item: InItem, where: string, isChild: boolean) => {
      const label = cleanText(item.label);
      const url = cleanUrl(item.url);
      if (!label) errors.push(`${where}: enter a label.`);
      if (label.length > 80) errors.push(`${where}: keep the label under 80 characters.`);
      if (url === null) errors.push(`${where}: the link must be a page such as /about/ or a full https:// address.`);
      // Footer column titles may have no link; every other item needs one.
      if (!url && !(body.menu === 'footer' && !isChild)) errors.push(`${where}: enter a link.`);
      const icon = cleanText(item.icon);
      return {
        label,
        url: url ?? '',
        description: cleanText(item.description).slice(0, 160) || null,
        icon: ICONS.some((i) => i.value === icon) ? icon : null,
        new_tab: item.new_tab === true,
        visible: item.visible !== false,
      };
    };
    const items = body.items.map((it, i) => {
      const parent = clean(it, `Item ${i + 1}`, false);
      const children = Array.isArray(it.children) ? it.children.slice(0, 30).map((c, j) => clean(c, `Item ${i + 1}, sub-item ${j + 1}`, true)) : [];
      if (body.menu === 'membership' && children.length) errors.push('The membership menu cannot have sub-items.');
      return { ...parent, children };
    });
    if (errors.length) return fail(errors[0], 422, { errors });

    await transaction(async (tx) => {
      await tx.query('DELETE FROM nav_items WHERE menu = $1', [body.menu]);
      let order = 0;
      for (const it of items) {
        const [row] = await tx.query(
          `INSERT INTO nav_items (menu, label, url, description, icon, new_tab, visible, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [body.menu, it.label, it.url, it.description, it.icon, it.new_tab, it.visible, order++],
        );
        for (const c of it.children) {
          await tx.query(
            `INSERT INTO nav_items (menu, parent_id, label, url, description, icon, new_tab, visible, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [body.menu, row.id, c.label, c.url, c.description, c.icon, c.new_tab, c.visible, order++],
          );
        }
      }
    });
    await logActivity(g.admin, { action: 'update', entityType: 'navigation', entityId: body.menu, entityLabel: `${body.menu} menu`, ip: clientIp(ctx) });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
};
