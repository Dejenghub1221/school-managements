import { useEffect, useRef, useState } from 'react';
import { useSettings } from './settings.jsx';

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

const TONE = {
  Active: 'g', Paid: 'g', Open: 'g', Completed: 'g', Present: 'g',
  Suspended: 'r', Unpaid: 'r', Absent: 'r',
  Partial: 'y', 'On leave': 'y', Scheduled: 'y', Inactive: 'y', Late: 'y', Excused: 'y'
};

export const Badge = ({ v }) => <span className={'bd ' + (TONE[v] || '')}>{v}</span>;

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

export function StudentProfile({ profile, onBack, onEdit, onDelete, canWrite }) {
  const { money } = useSettings();
  if (!profile || !profile.student) return null;
  const { student, guardian, attendance, academic, fees } = profile;
  const initials = student.name.split(' ').map(x => x[0]).join('').slice(0, 2);

  return (
    <div>
      <div className="head">
        {onBack && <button className="btn" onClick={onBack}>Back to students</button>}
        {canWrite && (
          <span>
            {onEdit && <button className="btn" onClick={() => onEdit(student)}>Edit</button>}{' '}
            {onDelete && <button className="btn dg" onClick={() => onDelete(student)}>Delete</button>}
          </span>
        )}
      </div>

      <div className="prof">
        <div className="av" aria-hidden="true">{initials}</div>
        <div>
          <h1>{student.name}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {student.id} · Class {student.cls} · <Badge v={student.status} />
          </p>
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h2>Details</h2>
          <dl style={{ marginTop: 10 }}>
            <dt>Gender</dt>
            <dd>{student.gender}</dd>
            <dt>Date of birth</dt>
            <dd>{student.dob || '—'}</dd>
            <dt>Phone</dt>
            <dd>{student.phone || '—'}</dd>
            <dt>Guardian</dt>
            <dd>{guardian?.name || '—'}</dd>
            <dt>Address</dt>
            <dd>{student.address || '—'}</dd>
          </dl>
        </div>

        <div className="card">
          <h2>Progress</h2>
          <dl style={{ marginTop: 10 }}>
            <dt>Attendance rate</dt>
            <dd>
              {attendance.rate}% ({attendance.P} present, {attendance.A} absent, {attendance.L} late, {attendance.E} excused)
            </dd>
            <dt>Average mark</dt>
            <dd>
              {Number(academic.average).toFixed(1)}% · Grade <Badge v={academic.grade} />
            </dd>
            <dt>Fees</dt>
            <dd>
              {fees?.length ? (
                fees.map(x => (
                  <div key={x.id} style={{ marginBottom: 4 }}>
                    {x.term}: {money(x.paid)} of {money(x.amount)} <Badge v={x.status} />
                  </div>
                ))
              ) : (
                'No fee records'
              )}
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
