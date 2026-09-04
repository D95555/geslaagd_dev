import { BellRing, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';

export function NotificationsStack() {
  const { notifications, dismissNotification } = useAuth();
  if (notifications.length === 0) return null;
  return (
    <div className="notifications-stack">
      {notifications.map((n) => (
        <aside key={n.id} className="broadcast-notice" role="status" aria-live="polite">
          <span className="broadcast-notice-icon" aria-hidden="true">
            <BellRing size={17} />
          </span>
          <div className="broadcast-notice-body">
            <p className="broadcast-notice-kicker">Bericht van geslaagd.app</p>
            <strong>{n.title}</strong>
            <p>{n.body}</p>
          </div>
          <button className="broadcast-notice-close" onClick={() => dismissNotification(n.id)} aria-label="Bericht sluiten">
            <X size={16} aria-hidden="true" />
          </button>
        </aside>
      ))}
    </div>
  );
}
