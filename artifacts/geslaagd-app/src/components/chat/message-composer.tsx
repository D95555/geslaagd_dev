import { useRef, useState, type FormEvent } from 'react';
import { sendConversationMessage, uploadConversationPhoto, type MessageReference } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Paperclip, Send } from 'lucide-react';
import { SubjectReferencePicker } from './subject-reference-picker';

export function MessageComposer({
  conversationId,
  onSent,
  onTyping,
}: {
  conversationId: string;
  onSent: () => void;
  onTyping?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [references, setReferences] = useState<MessageReference[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachPhoto = async (file: File) => {
    setSending(true);
    try {
      const { photoUrl } = await uploadConversationPhoto(conversationId, { photo: file });
      await sendConversationMessage(conversationId, { body: draft.trim() || '📷', photoUrl, references });
      setDraft('');
      setReferences([]);
      onSent();
    } finally {
      setSending(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await sendConversationMessage(conversationId, { body: draft.trim(), references });
      setDraft('');
      setReferences([]);
      onSent();
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="message-composer" onSubmit={(e) => void submit(e)}>
      <SubjectReferencePicker
        draft={draft}
        onPick={(ref) => setReferences((current) => [...current, ref])}
      />
      {references.length > 0 && (
        <div className="composer-references">
          {references.map((ref, index) => (
            <span key={index} className="composer-reference-tag">
              #{ref.label} <button type="button" onClick={() => setReferences((c) => c.filter((_, i) => i !== index))}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void attachPhoto(file); }}
        />
        <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()} aria-label="Foto bijvoegen">
          <Paperclip size={16} />
        </Button>
        <Input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); onTyping?.(); }}
          placeholder="Typ een bericht, of /ai #vak je vraag"
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !draft.trim()} aria-label="Versturen">
          <Send size={16} />
        </Button>
      </div>
    </form>
  );
}
