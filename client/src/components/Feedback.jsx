import { useEffect } from 'react';

export const Skeleton = () => (
  <>
    <div className="sk" />
    <div className="sk" />
    <div className="sk" />
  </>
);

export const Empty = ({ title, text, children }) => (
  <div className="card empty">
    <h3>{title}</h3>
    <p>{text}</p>
    {children}
  </div>
);

export function Toast({ msg, isError, onDone }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [msg, onDone]);

  return (
    <div id="toast" className={(msg ? 'on' : '') + (isError ? ' e' : '')} role="status" aria-live="polite">
      {msg}
    </div>
  );
}
