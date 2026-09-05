import { useEffect, useRef, type ReactNode } from 'react';
import type { Message } from '@workspace/api-client-react';
import { ReferenceChip } from './reference-chip';

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const TINT_COUNT = 5;

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function initial(label: string): string {
  return label.trim().slice(0, 1).toUpperCase() || '?';
}

/** Deterministic per-sender color, so the same person always gets the same
 * avatar tint across a conversation without the server tracking one. */
function tintFor(senderId: string | null): number {
  if (!senderId) return TINT_COUNT - 1; // the AI always gets the same, distinct tint
  let hash = 0;
  for (let i = 0; i < senderId.length; i += 1) hash = (hash * 31 + senderId.charCodeAt(i)) >>> 0;
  return hash % (TINT_COUNT - 1);
}

export function MessageList({
  messages,
  currentUserId,
  senderLabel,
  typingLabel,
  renderBody,
}: {
  messages: Message[];
  currentUserId: string;
  /** Resolves a sender id (or null for an AI message) to a display name. */
  senderLabel: (senderId: string | null) => string;
  typingLabel?: string | null;
  /** Overrides how a message's body renders — e.g. citation tags in the AI study
   * chat. Defaults to plain text; not consulted for a deleted message, which
   * always renders its redaction notice instead. */
  renderBody?: (message: Message) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, typingLabel]);

  if (messages.length === 0 && !typingLabel) {
    return (
      <div className="message-list message-list-empty" ref={listRef}>
        <p>Nog geen berichten hier. Stuur het eerste bericht.</p>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const startsGroup =
          !previous ||
          previous.senderId !== message.senderId ||
          new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_WINDOW_MS;
        const isOwn = message.senderId === currentUserId;
        const label = senderLabel(message.senderId);

        return (
          <div
            key={message.id}
            className={`message-row ${isOwn ? 'is-own' : ''} ${message.kind === 'ai' ? 'is-ai' : ''} ${startsGroup ? 'starts-group' : ''}`}
          >
            <span className={`message-avatar tint-${tintFor(message.senderId)}`} aria-hidden="true">
              {startsGroup ? initial(label) : ''}
            </span>
            <div className="message-row-content">
              {startsGroup && (
                <div className="message-row-head">
                  <strong>{label}</strong>
                  <span>{fmtTime(message.createdAt)}</span>
                </div>
              )}
              <div className="message-row-body">
                {message.deletedAt ? (
                  <em>{message.body}</em>
                ) : (
                  <>
                    {renderBody ? renderBody(message) : <p>{message.body}</p>}
                    {message.photoUrl && <img src={message.photoUrl} alt="" className="message-photo" />}
                    {message.references.length > 0 && (
                      <div className="message-references">
                        {message.references.map((ref, refIndex) => (
                          <ReferenceChip key={refIndex} reference={ref} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {typingLabel && <p className="message-typing">{typingLabel}</p>}
    </div>
  );
}
