import { statusLabel } from '../lib/format';
import type { MovementType, StockStatus } from '../lib/types';
import { Icon, type IconName } from './Icon';

const statusIcon: Record<StockStatus, IconName> = { in: 'check', low: 'alert', out: 'stop' };

/** Status always ships as icon + label, never color alone. */
export function StatusBadge({ status }: { status: StockStatus }) {
  return (
    <span className={`badge badge--${status}`}>
      <Icon name={statusIcon[status]} size={14} />
      {statusLabel[status]}
    </span>
  );
}

const movementMeta: Record<MovementType, { label: string; icon: IconName }> = {
  receive: { label: 'Received', icon: 'arrowIn' },
  ship: { label: 'Shipped', icon: 'arrowOut' },
  adjust: { label: 'Adjusted', icon: 'adjust' },
};

export function MovementBadge({ type }: { type: MovementType }) {
  const meta = movementMeta[type];
  return (
    <span className={`badge badge--move badge--${type}`}>
      <Icon name={meta.icon} size={14} />
      {meta.label}
    </span>
  );
}
