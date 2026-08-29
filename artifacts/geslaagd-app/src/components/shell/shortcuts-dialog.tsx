import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';
import { useHotkeys } from '@/hooks/use-hotkeys';

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: 'Cmd/Ctrl K', description: 'Commandopalet openen' },
  { keys: 'Cmd/Ctrl B', description: 'Zijbalk in-/uitklappen' },
  { keys: 'J', description: 'Volgende in de lijst' },
  { keys: 'K', description: 'Vorige in de lijst' },
  { keys: 'Enter', description: 'Geselecteerd item openen' },
  { keys: '?', description: 'Dit overzicht tonen' },
];

/** `?`, everywhere in the study and admin shell. */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useHotkeys([{ key: '?', shift: true, handler: () => setOpen((current) => !current) }]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sneltoetsen</DialogTitle>
          <DialogDescription>Volledig toetsenbord-eerst te bedienen.</DialogDescription>
        </DialogHeader>
        <dl className="shortcuts-list">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="shortcuts-row">
              <dt>
                <kbd>{shortcut.keys}</kbd>
              </dt>
              <dd>{shortcut.description}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
