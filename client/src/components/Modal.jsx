import { useEffect, useRef, useState } from 'react';

export function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} onClick={e => e.target === ref.current && onClose()}>
      <h2>{title}</h2>
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
