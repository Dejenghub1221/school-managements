import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { Empty, Skeleton } from '../components/index.js';

export default function Timetable() {
  const [viewMode, setViewMode] = useState('class'); // 'class' | 'teacher'
  const [cls, setCls] = useState('7A');
  const [teacherId, setTeacherId] = useState('');
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      let url = '/timetable';
      if (viewMode === 'teacher' && teacherId) {
        url += `?teacherId=${encodeURIComponent(teacherId)}`;
      } else {
        url += `?cls=${encodeURIComponent(cls)}`;
      }
      const res = await api(url);
      setData(res);
      if (res.classes?.length) setClasses(res.classes);
      if (res.teachers?.length) {
        setTeachers(res.teachers);
        if (!teacherId) setTeacherId(res.teachers[0].id);
      }
      if (res.cls && viewMode === 'class') setCls(res.cls);
    } catch (x) {
      setErr(x.message);
    }
  };

  useEffect(() => {
    load();
  }, [viewMode, cls, teacherId]);

  if (err) return <Empty title="Couldn’t load timetable" text={err} />;
  if (!data) return <Skeleton />;

  return (
    <>
      <div className="head">
        <div>
          <h1>Timetable</h1>
          <span className="muted">
            {viewMode === 'class' ? `Class Schedule · ${cls}` : `Teacher Schedule · ${data.teacherName || 'Faculty'}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn sm"
            onClick={() => window.print()}
          >
            🖨️ Print Schedule
          </button>
        </div>
      </div>

      <div className="tb" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Mode Selector */}
        <div className="tabs" style={{ margin: 0 }}>
          <button
            type="button"
            className={`btn sm ${viewMode === 'class' ? 'pr' : ''}`}
            onClick={() => setViewMode('class')}
          >
            🏫 View by Class
          </button>
          <button
            type="button"
            className={`btn sm ${viewMode === 'teacher' ? 'pr' : ''}`}
            onClick={() => setViewMode('teacher')}
          >
            👨‍🏫 View by Teacher
          </button>
        </div>

        {viewMode === 'class' ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong>Class:</strong>
            <select value={cls} onChange={e => setCls(e.target.value)}>
              {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
            </select>
          </label>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong>Teacher:</strong>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)}>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="tw">
        <table style={{ minWidth: 640 }} className="rt">
          <thead>
            <tr>
              <th scope="col" style={{ width: 140 }}>Time</th>
              {data.days.map(d => <th key={d} scope="col">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <tr key={idx} style={row.isBreak ? { background: 'var(--hv)' } : {}}>
                <th
                  scope="row"
                  style={{ fontWeight: 600 }}
                  dangerouslySetInnerHTML={{ __html: row.time }}
                />
                {row.days.map((cell, di) => (
                  <td key={di}>
                    {row.isBreak ? (
                      <span className="muted" style={{ fontStyle: 'italic' }}>{cell.subject || 'Break'}</span>
                    ) : viewMode === 'teacher' ? (
                      cell.isFree ? (
                        <small className="muted" style={{ fontStyle: 'italic' }}>Planning / Prep</small>
                      ) : (
                        <div>
                          <span className="bd g" style={{ fontSize: '11px', display: 'inline-block', marginBottom: 2 }}>
                            Class {cell.cls}
                          </span>
                          <div style={{ fontWeight: 600 }}>{cell.subject}</div>
                          <small className="muted">{cell.room}</small>
                        </div>
                      )
                    ) : (
                      <>
                        <b>{cell.subject}</b>
                        <br />
                        <small className="muted" style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                          <span>{cell.teacher ? cell.teacher.replace(' (Cover)', '').replace(' (On leave)', '') : '—'}</span>
                          {cell.teacher && cell.teacher.includes('(Cover)') && (
                            <span className="bd ok" style={{ fontSize: '10px', padding: '1px 5px' }}>Cover</span>
                          )}
                          {cell.teacher && cell.teacher.includes('(On leave)') && (
                            <span className="bd wa" style={{ fontSize: '10px', padding: '1px 5px' }}>On leave</span>
                          )}
                        </small>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
