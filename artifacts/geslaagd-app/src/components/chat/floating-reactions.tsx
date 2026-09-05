import { useEffect } from 'react';
import type { FlyingReaction } from '@/hooks/use-conversation-channel';

const ANIMATION_MS = 2200;

export function FloatingReactions({
  reactions,
  onDone,
}: {
  reactions: FlyingReaction[];
  onDone: (id: string) => void;
}) {
  return (
    <div className="floating-reactions" aria-hidden="true">
      {reactions.map((reaction, index) => (
        <FloatingReaction key={reaction.id} reaction={reaction} index={index} onDone={() => onDone(reaction.id)} />
      ))}
    </div>
  );
}

function FloatingReaction({
  reaction,
  index,
  onDone,
}: {
  reaction: FlyingReaction;
  index: number;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, ANIMATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction.id]);

  return (
    <span className="floating-reaction" style={{ left: `${10 + ((index * 23) % 75)}%` }}>
      {reaction.emoji}
    </span>
  );
}
