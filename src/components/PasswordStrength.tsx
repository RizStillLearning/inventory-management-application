import { PASSWORD_RULES, passwordStrength } from '../lib/password';
import { Icon } from './Icon';

interface Props {
  password: string;
  email: string;
  /** Mark unmet rules as errors (after the user tries to submit). */
  showErrors: boolean;
  meterId: string;
  rulesId: string;
}

/** Strength meter (advisory) plus the live checklist of required rules. */
export function PasswordStrength({ password, email, showErrors, meterId, rulesId }: Props) {
  const strength = passwordStrength(password, email);
  const empty = password.length === 0;

  return (
    <div className="pw-strength">
      <div
        className="pw-meter"
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.level}
        aria-valuetext={strength.label || 'Not entered'}
      >
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`pw-meter__seg${i <= strength.level ? ` is-on level-${strength.level}` : ''}`} />
        ))}
      </div>
      <div className="pw-meter__text" id={meterId} aria-live="polite">
        <span>
          Password strength{strength.label && ': '}
          <strong>{strength.label}</strong>
        </span>
        {strength.tip && <span className="muted">{strength.tip}</span>}
      </div>
      <ul className="pw-rules" id={rulesId} aria-label="Password requirements">
        {PASSWORD_RULES.map((rule) => {
          const met = !empty && rule.test(password);
          const state = met ? 'is-met' : showErrors ? 'is-error' : '';
          return (
            <li key={rule.id} className={state}>
              <Icon name={met ? 'check' : showErrors ? 'close' : 'dot'} size={14} />
              {rule.label}
              <span className="sr-only">{met ? ' (done)' : ' (not yet)'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
