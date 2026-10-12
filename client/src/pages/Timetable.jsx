import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { Empty, Skeleton } from '../components/index.js';

export default function Timetable() {
  const [cls, setCls] = useState('7A');
  const [classes, setClasses] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = async targetCls => {
    try {
      const res = await api(`/timetable?cls=${encodeURIComponent(targetCls || cls)}`);
      setData(res);
      setClasses(res.classes || []);
      if (res.cls) setCls(res.cls);
    } catch (x) {
      setErr(x.message);
    }
  };

  useEffect(() => {
    load(cls);
  }, [cls]);

  if (err) return <Empty title="Couldn’t load timetable" text={err} />;
  if (!data) return <Skeleton />;

  return (
    <>
      <div className="head">
        <h1>Timetable</h1>
      </div>

      <div className="tb">
        <label>
          Class{' '}
          <select value={cls} onChange={e => setCls(e.target.value)}>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <div className="tw">
        <table style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th scope="col">Time</th>
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
                      <span className="muted">—</span>
                    ) : (
                      <>
                        <b>{cell.subject}</b>
                        <br />
                        <small className="muted">{cell.teacher}</small>
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
