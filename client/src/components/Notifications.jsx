import { useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { useLang } from '../context/LangContext.jsx';

export function Notifications() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef();

  useEffect(() => {
    // Load upcoming exams + unpaid fees as notifications
    Promise.all([
      api('/exams').catch(() => []),
      api('/fees').catch(() => [])
    ]).then(([exams, fees]) => {
      const notes = [];
      (exams || [])
        .filter(e => e.status === 'Scheduled')
        .slice(0, 5)
        .forEach(e => notes.push({ id: 'e-' + e.id, type: 'exam', text: `${t('upcomingExam')}: ${e.name}`, sub: e.date }));
      (fees || [])
        .filter(f => f.status !== 'Paid')
        .slice(0, 5)
        .forEach(f => notes.push({ id: 'f-' + f.id, type: 'fee', text: `${t('unpaidFees')}: ${f.student}`, sub: f.status }));
      setItems(notes);
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const count = items.length;

  return (
    <div className="notif-wrap" ref={ref}>
      <button
        className="notif-btn"
        aria-label={`${t('notifications')}${count ? `, ${count} new` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {/* Bell icon */}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {count > 0 && <span className="notif-badge" aria-hidden="true">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label={t('notifications')}>
          <div className="notif-head">{t('notifications')}</div>
          {items.length === 0 ? (
            <div className="notif-empty">{t('noNotifications')}</div>
          ) : (
            <ul className="notif-list">
              {items.map(n => (
                <li key={n.id} className={`notif-item notif-${n.type}`}>
                  <span className="notif-text">{n.text}</span>
                  <span className="notif-sub">{n.sub}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
