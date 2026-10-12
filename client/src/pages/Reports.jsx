import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { Badge, Empty, Skeleton, CsvModal, Toast } from '../components/index.js';

const TABS = ['Students', 'Attendance', 'Academic', 'Fees'];

export default function Reports() {
  const { money } = useSettings();
  const [tab, setTab] = useState('Students');
  const [cls, setCls] = useState('');
  const [classes, setClasses] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [csvText, setCsvText] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    api('/classes-list')
      .then(setClasses)
      .catch(() => {});
  }, []);

  const load = async () => {
    setErr('');
    try {
      const res = await api(`/reports?tab=${tab}&cls=${encodeURIComponent(cls)}`);
      setData(res);
    } catch (x) {
      setErr(x.message);
    }
  };

  useEffect(() => {
    load();
  }, [tab, cls]);

  const exportCsv = () => {
    if (!data || !data.h || !data.r) return;
    const csv = [data.h, ...data.r]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    setCsvText(csv);
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch {
      setToast('Printing is not available here.');
    }
  };

  const renderCell = (colName, val) => {
    if (colName === 'Status') return <Badge v={val} />;
    if (colName === 'Grade') return <Badge v={val} />;
    if (['Billed', 'Paid', 'Balance'].includes(colName)) return money(val);
    return String(val ?? '');
  };

  return (
    <>
      <div className="head">
        <h1>Reports</h1>
        <span>
          <button className="btn" onClick={exportCsv}>Export CSV</button>{' '}
          <button className="btn" onClick={handlePrint}>Print</button>
        </span>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t}
            className="btn"
            aria-pressed={t === tab}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="tb">
        <label>
          Class{' '}
          <select value={cls} onChange={e => setCls(e.target.value)}>
            <option value="">All classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {err ? (
        <Empty title="Couldn’t load reports" text={err} />
      ) : !data ? (
        <Skeleton />
      ) : !data.r?.length ? (
        <Empty title="No data for this filter" text="Try selecting a different class or tab." />
      ) : (
        <div className="tw">
          <table className="rt">
            <thead>
              <tr>
                {data.h.map(col => <th key={col} scope="col">{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.r.map((row, idx) => (
                <tr key={idx}>
                  {row.map((cell, ci) => (
                    <td key={ci} data-l={data.h[ci]}>
                      {renderCell(data.h[ci], cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {csvText && (
        <CsvModal
          csvText={csvText}
          onClose={() => setCsvText(null)}
          onToast={m => setToast(m)}
        />
      )}

      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
