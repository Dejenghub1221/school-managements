import { useSettings } from '../context/SettingsContext.jsx';
import { Badge } from './Badge.jsx';
import { Icon } from '../icons.jsx';

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
          <span className="act-group">
            {onEdit && (
              <button
                type="button"
                className="btn sm icon-btn edit-btn"
                title="Edit student"
                aria-label="Edit student"
                onClick={() => onEdit(student)}
              >
                <Icon name="edit" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="btn sm icon-btn del-btn"
                title="Delete student"
                aria-label="Delete student"
                onClick={() => onDelete(student)}
              >
                <Icon name="delete" />
              </button>
            )}
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
            <dt>Gender</dt><dd>{student.gender}</dd>
            <dt>Date of birth</dt><dd>{student.dob || '—'}</dd>
            <dt>Phone</dt><dd>{student.phone || '—'}</dd>
            <dt>Guardian</dt><dd>{guardian?.name || '—'}</dd>
            <dt>Address</dt><dd>{student.address || '—'}</dd>
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
