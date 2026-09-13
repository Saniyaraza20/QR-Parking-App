import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

let scriptLoadPromise = null;
function loadGoogleScript() {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

// Only renders anything if the backend actually has GOOGLE_CLIENT_ID set -
// this app must work fully on email/password alone, so the button quietly
// disappears rather than erroring when Google sign-in isn't configured.
export default function GoogleSignInButton({ onToken }) {
  const buttonRef = useRef(null);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api.googleOAuthConfig().then(setConfig).catch(() => setConfig({ enabled: false }));
  }, []);

  useEffect(() => {
    if (!config?.enabled || !buttonRef.current) return;
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled) return;
      window.google.accounts.id.initialize({
        client_id: config.client_id,
        callback: (response) => onToken(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
      });
    });
    return () => { cancelled = true; };
  }, [config, onToken]);

  if (config === null) return null; // still checking - render nothing rather than flash
  if (!config.enabled) return null; // not configured on this server

  return (
    <div style={{ margin: '12px 0' }}>
      <div style={{ textAlign: 'center', color: '#999', fontSize: 13, margin: '8px 0' }}>or</div>
      <div ref={buttonRef} />
    </div>
  );
}
