import { useEffect, useRef, useState } from 'preact/hooks';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Icon from './Icon';
import { MediaPicker, type MediaItem } from './MediaBrowser';
import { Modal } from './ui';
import { thumbUrl } from './lib';

/** Rich text editor. The HTML it produces is sanitised again on the server. */
export default function RichText({ id, value, onChange, placeholder, invalid }: { id: string; value: string; onChange: (html: string) => void; placeholder?: string; invalid?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const [, force] = useState(0);
  const [picking, setPicking] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    editor.current = new Editor({
      element: host.current!,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3, 4] },
          codeBlock: false,
          link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer' } },
        }),
        Image.configure({ inline: false }),
        Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
      ],
      content: value || '',
      editorProps: { attributes: { id, 'aria-multiline': 'true', role: 'textbox', 'aria-invalid': invalid ? 'true' : 'false' } },
      onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
      onSelectionUpdate: () => force((n) => n + 1),
      onTransaction: () => force((n) => n + 1),
    });
    return () => editor.current?.destroy();
  }, []);

  const e = editor.current;
  const btn = (label: string, icon: string | null, active: boolean, run: () => void, text?: string) => (
    <button type="button" class={active ? 'on' : ''} title={label} aria-label={label} aria-pressed={active} onMouseDown={(ev) => ev.preventDefault()} onClick={run}>
      {icon ? <Icon name={icon} size={16} /> : text}
    </button>
  );

  return (
    <div class="rte" style={invalid ? 'border-color:var(--a-red)' : ''}>
      {e && (
        <div class="rte-toolbar" role="toolbar" aria-label="Formatting">
          {btn('Heading', null, e.isActive('heading', { level: 2 }), () => e.chain().focus().toggleHeading({ level: 2 }).run(), 'H2')}
          {btn('Subheading', null, e.isActive('heading', { level: 3 }), () => e.chain().focus().toggleHeading({ level: 3 }).run(), 'H3')}
          <span class="sep" />
          {btn('Bold', 'bold', e.isActive('bold'), () => e.chain().focus().toggleBold().run())}
          {btn('Italic', 'italic', e.isActive('italic'), () => e.chain().focus().toggleItalic().run())}
          {btn('Underline', null, e.isActive('underline'), () => e.chain().focus().toggleUnderline().run(), 'U')}
          <span class="sep" />
          {btn('Bulleted list', 'list', e.isActive('bulletList'), () => e.chain().focus().toggleBulletList().run())}
          {btn('Numbered list', 'list-ol', e.isActive('orderedList'), () => e.chain().focus().toggleOrderedList().run())}
          {btn('Quote', 'quote', e.isActive('blockquote'), () => e.chain().focus().toggleBlockquote().run())}
          {btn('Divider', 'hr', false, () => e.chain().focus().setHorizontalRule().run())}
          <span class="sep" />
          {btn('Add link', 'link', e.isActive('link'), () => setLinking(e.getAttributes('link').href ?? ''))}
          {e.isActive('link') && btn('Remove link', 'unlink', false, () => e.chain().focus().extendMarkRange('link').unsetLink().run())}
          {btn('Insert image', 'image-plus', false, () => setPicking(true))}
          <span class="sep" />
          {btn('Undo', 'undo', false, () => e.chain().focus().undo().run())}
          {btn('Redo', 'redo', false, () => e.chain().focus().redo().run())}
        </div>
      )}
      <div class="rte-content" ref={host} />
      {picking && (
        <MediaPicker
          onClose={() => setPicking(false)}
          onPick={([m]: MediaItem[]) => {
            if (m) editor.current?.chain().focus().setImage({ src: thumbUrl(m, 1200), alt: m.alt || '' }).run();
          }}
        />
      )}
      {linking !== null && (
        <LinkDialog
          initial={linking}
          onClose={() => setLinking(null)}
          onSave={(href, newTab) => {
            const chain = editor.current!.chain().focus().extendMarkRange('link');
            if (!href) chain.unsetLink().run();
            else chain.setLink({ href, target: newTab ? '_blank' : null } as any).run();
            setLinking(null);
          }}
        />
      )}
    </div>
  );
}

function LinkDialog({ initial, onSave, onClose }: { initial: string; onSave: (href: string, newTab: boolean) => void; onClose: () => void }) {
  const [href, setHref] = useState(initial);
  const [newTab, setNewTab] = useState(/^https?:/.test(initial));
  const [err, setErr] = useState('');
  const submit = () => {
    const v = href.trim();
    if (v && !/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(v)) return setErr('Start with https://, a page address such as /contact/, mailto: or tel:.');
    onSave(v, newTab);
  };
  return (
    <Modal
      title="Link"
      onClose={onClose}
      footer={
        <>
          <button class="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button class="btn" type="button" onClick={submit}>
            Apply
          </button>
        </>
      }
    >
      <div class="field">
        <label for="rte-link">Address</label>
        <input
          id="rte-link"
          type="text"
          value={href}
          placeholder="https://… or /contact/"
          onInput={(e) => setHref((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
        />
        {err && <span class="err">{err}</span>}
        <span class="help">Leave empty to remove the link.</span>
      </div>
      <label class="check">
        <input type="checkbox" checked={newTab} onChange={(e) => setNewTab((e.target as HTMLInputElement).checked)} /> Open in a new tab
      </label>
    </Modal>
  );
}
