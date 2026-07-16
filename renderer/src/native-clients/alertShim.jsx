/**
 * ZAI Desktop - Alert Shim
 *
 * react-native-web does not implement RN's Alert module at all (it's a
 * genuine gap, not a bug) - this provides a real in-app modal dialog
 * with the same call shape (`Alert.alert(title, message, buttons)`) used
 * throughout ChatScreen.js/SettingsScreen.js (22 call sites total, all
 * confirmed simple title+message or title+message+buttons shape), so
 * every call site works with only its import line changed
 * (`import { Alert } from 'react-native'` -> `import { Alert } from
 * '../native-clients/alertShim'`).
 *
 * Implementation: a single queued modal, rendered by <AlertHost />
 * mounted once near the app root (see App.jsx) - Alert.alert() just
 * pushes onto a tiny pub/sub queue the host subscribes to, mirroring how
 * RN's real Alert is a fire-and-forget imperative call from anywhere in
 * the component tree, not a component you render yourself at each call
 * site.
 */
import React, { useEffect, useState } from 'react';

let listeners = [];
let queue = [];
let showingCurrent = false;

function notify() {
  listeners.forEach((l) => l(queue, showingCurrent));
}

export const Alert = {
  alert(title, message, buttons) {
    const normalizedButtons = buttons && buttons.length > 0
      ? buttons
      : [{ text: 'OK', style: 'default' }];
    queue.push({ title, message, buttons: normalizedButtons });
    notify();
  },
};

export function AlertHost() {
  const [, setTick] = useState(0);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const listener = (q) => {
      if (!current && q.length > 0) {
        setCurrent(q.shift());
      }
      setTick((t) => t + 1);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, [current]);

  if (!current) return null;

  const handlePress = (button) => {
    setCurrent(null);
    button.onPress?.();
    if (queue.length > 0) {
      setCurrent(queue.shift());
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <div style={titleStyle}>{current.title}</div>
        {current.message ? <div style={messageStyle}>{current.message}</div> : null}
        <div style={buttonRowStyle}>
          {current.buttons.map((btn, i) => (
            <button
              key={i}
              onClick={() => handlePress(btn)}
              style={{
                ...buttonStyle,
                color: btn.style === 'destructive' ? '#FF5C5C' : '#4C6EF5',
                fontWeight: btn.style === 'cancel' ? 400 : 600,
              }}
            >
              {btn.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
};
const dialogStyle = {
  background: '#1C1C24', borderRadius: 12, padding: 20, minWidth: 280, maxWidth: 400,
  boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
};
const titleStyle = { fontSize: 16, fontWeight: 600, color: '#E8E8ED', marginBottom: 8 };
const messageStyle = { fontSize: 13, color: '#B8B8C2', lineHeight: 1.5, marginBottom: 16 };
const buttonRowStyle = { display: 'flex', justifyContent: 'flex-end', gap: 16 };
const buttonStyle = {
  background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', padding: '4px 8px',
};
