import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@workspace/geslaagd-momentum/components/ui/popover';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Smile } from 'lucide-react';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏', '🙌', '💯'];

export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" aria-label="Emoji versturen" disabled={disabled}>
          <Smile size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="emoji-picker-panel" align="start">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-picker-option"
            onClick={() => {
              onPick(emoji);
              setOpen(false);
            }}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
