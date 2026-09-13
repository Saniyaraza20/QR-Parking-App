import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Home() {
  const [entryUrl, setEntryUrl] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Pull the public entrance link + a rendered QR of it, so the landing
    // page itself shows the exact code that's printed at the lot. Scanning it
    // with a phone, or tapping it here, both drop the user straight into the
    // booking flow - no login required.
    api.entryLink()
      .then(async (d) => {
        setEntryUrl(d.url);
        try {
          const qr = await api.getPublicQr();
          setQrDataUrl(qr.dataUrl);
        } catch {
          // QR image is a nice-to-have on the landing page; the button still works without it
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <h1>Park in under a minute</h1>
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="status">Scan this code at the entrance, or tap it to start — no account needed.</p>

        {error && <p className="error">{error}</p>}

        {qrDataUrl ? (
          <a href={entryUrl} aria-label="Start booking a parking spot">
            <img
              src={qrDataUrl}
              alt="Scan to park"
              style={{ width: 240, height: 240, maxWidth: '100%', cursor: 'pointer', borderRadius: 12 }}
            />
          </a>
        ) : (
          <div className="skeleton" style={{ width: 240, height: 240, margin: '0 auto', maxWidth: '100%' }} />
        )}

        <button
          className="primary"
          disabled={!entryUrl}
          onClick={() => entryUrl && navigate(entryUrl)}
        >
          Book a spot now
        </button>
        <p style={{ marginTop: 10 }}>
          <small>
            Have an account? <a href="/driver/login">Log in</a> to save your history &middot;{' '}
            <a href="/driver/register">Sign up</a>
          </small>
        </p>
      </div>
    </div>
  );
}
