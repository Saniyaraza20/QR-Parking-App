import { createContext, useCallback, useContext, useState } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, resolve }

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      setState({ message, resolve });
    });
  }, []);

  function respond(result) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          role="alertdialog"
          aria-modal="true"
          aria-label={state.message}
          onKeyDown={(e) => { if (e.key === 'Escape') respond(false); }}
        >
          <div className="card" style={{ maxWidth: 340 }}>
            <p style={{ marginTop: 0 }}>{state.message}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => respond(false)} autoFocus>Cancel</button>
              <button className="primary" style={{ width: 'auto' }} onClick={() => respond(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// Usage: const confirm = useConfirm(); if (await confirm('Force close this session?')) { ... }
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
