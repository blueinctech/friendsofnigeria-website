/**
 * Roles and what each one may do. Used on the server to enforce access and in
 * the dashboard to hide what an administrator cannot use.
 */
export type Role = 'super_admin' | 'editor' | 'content_manager';
export type Action = 'view' | 'create' | 'edit' | 'publish' | 'delete';
export type Module =
  | 'dashboard'
  | 'pages'
  | 'homepage'
  | 'news'
  | 'events'
  | 'programmes'
  | 'team'
  | 'partners'
  | 'media'
  | 'enquiries'
  | 'navigation'
  | 'seo'
  | 'admins'
  | 'settings'
  | 'activity';

export interface AdminIdentity {
  id: string;
  role: Role;
  modules: string[];
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Administrator',
  editor: 'Editor',
  content_manager: 'Content Manager',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: 'Full access, including administrator accounts, settings and the activity log.',
  editor: 'Creates, edits, publishes and deletes all website content, uploads media and handles enquiries.',
  content_manager: 'Creates, edits and publishes content in the modules assigned to them. Cannot delete content.',
};

/** Modules a super administrator can assign to a content manager. */
export const ASSIGNABLE_MODULES: { key: Module; label: string }[] = [
  { key: 'news', label: 'News & Publications' },
  { key: 'events', label: 'Events' },
  { key: 'programmes', label: 'Activities & Programmes' },
  { key: 'pages', label: 'Pages' },
  { key: 'homepage', label: 'Homepage' },
  { key: 'team', label: 'Management Team' },
  { key: 'partners', label: 'Partners & Sponsors' },
];

const EDITOR_MODULES: Module[] = [
  'dashboard',
  'pages',
  'homepage',
  'news',
  'events',
  'programmes',
  'team',
  'partners',
  'media',
  'enquiries',
  'navigation',
  'seo',
];

export function can(admin: AdminIdentity | null | undefined, module: Module, action: Action = 'view'): boolean {
  if (!admin) return false;
  if (admin.role === 'super_admin') return true;
  if (admin.role === 'editor') return EDITOR_MODULES.includes(module);
  // Content manager
  if (module === 'dashboard') return action === 'view';
  if (module === 'media') return action !== 'delete';
  if (action === 'delete') return false;
  return admin.modules.includes(module) && ASSIGNABLE_MODULES.some((m) => m.key === module);
}
