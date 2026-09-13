function scorePassword(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const LABELS = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'];

export default function PasswordStrength({ password }) {
  const score = scorePassword(password);
  const tier = score <= 1 ? 'weak' : score <= 2 ? 'ok' : 'strong';
  if (!password) return null;
  return (
    <div>
      <div className="pw-strength" role="img" aria-label={`Password strength: ${LABELS[score]}`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`seg ${i < score ? `on-${tier}` : ''}`} />
        ))}
      </div>
      <div className="pw-strength-label">{LABELS[score]}</div>
    </div>
  );
}
