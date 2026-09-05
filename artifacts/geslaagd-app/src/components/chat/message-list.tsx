import { useEffect, useRef, type ReactNode } from 'react';
import type { Message } from '@workspace/api-client-react';
import { ReferenceChip } from './reference-chip';

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
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

  return (
    <div className="message-list" ref={listRef}>
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const startsGroup =
          !previous ||
          previous.senderId !== message.senderId ||
          new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_WINDOW_MS;
        const isOwn = message.senderId === currentUserId;

        return (
          <div
            key={message.id}
            className={`message-row ${isOwn ? 'is-own' : ''} ${message.kind === 'ai' ? 'is-ai' : ''} ${startsGroup ? 'starts-group' : ''}`}
          >
            {startsGroup && (
              <div className="message-row-head">
                <strong>{senderLabel(message.senderId)}</strong>
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
        );
      })}
      {typingLabel && <p className="message-typing">{typingLabel}</p>}
    </div>
  );
}
