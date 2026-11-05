import { useEffect, useRef, useState } from 'react';

export function Modal({ title, onClose, children }) {
  const ref = useRef();
  const mouseDownOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const handleMouseDown = (e) => {
    if (e.button !== 0 || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const isInsideDialog = (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
    mouseDownOnBackdrop.current = !isInsideDialog;
  };

  const handleClick = (e) => {
    if (e.button !== 0 || !ref.current || !onClose) return;
    const rect = ref.current.getBoundingClientRect();
    const isInsideDialog = (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
    // Only close if BOTH mousedown AND click originated outside the dialog (on the backdrop)
    if (mouseDownOnBackdrop.current && !isInsideDialog && e.target === ref.current) {
      onClose();
    }
    mouseDownOnBackdrop.current = false;
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {onClose && (
          <button
            type="button"
            className="btn xs"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              lineHeight: 1,
              cursor: 'pointer',
              color: 'var(--mu)',
              padding: '2px 8px',
              borderRadius: 6,
              flexShrink: 0
            }}
          >
            ✕
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}

export function ConfirmModal({ title = 'Are you sure?', msg, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p dangerouslySetInnerHTML={{ __html: msg }} />
      <div className="acts">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn dg" onClick={onConfirm}>Delete</button>
      </div>
    </Modal>
  );
}

export function CsvModal({ title = 'Export CSV', csvText, onClose, onToast }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(csvText).then(() => {
      setCopied(true);
      onToast?.('Copied.');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      onToast?.('Select the text and copy it manually.', true);
    });
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p>Copy this data and paste it into a spreadsheet.</p>
      <textarea readOnly aria-label="CSV data" value={csvText} />
      <div className="acts" style={{ marginTop: 8 }}>
        <button type="button" className="btn pr" onClick={copy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
