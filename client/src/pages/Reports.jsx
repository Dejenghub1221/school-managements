import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { Badge, Empty, Skeleton, CsvModal, Toast } from '../components/index.js';

const TABS = ['Students', 'Attendance', 'Academic', 'Fees'];

export default function Reports() {
  const { money, settings } = useSettings();
  const { t } = useLang();
  const [tab, setTab] = useState('Students');
  const [cls, setCls] = useState('');
  const [classes, setClasses] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [csvText, setCsvText] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    api('/classes-list').then(setClasses).catch(() => {});
  }, []);

  const load = async () => {
    setErr('');
    try {
      const res = await api(`/reports?tab=${tab}&cls=${encodeURIComponent(cls)}`);
      setData(res);
    } catch (x) { setErr(x.message); }
  };

  useEffect(() => { load(); }, [tab, cls]);

  const exportCsv = () => {
    if (!data?.h || !data?.r) return;
    const csv = [data.h, ...data.r]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    setCsvText(csv);
  };

  const exportExcel = () => {
    if (!data?.h || !data?.r) return;
    const rows = [data.h, ...data.r]
      .map(row => '<tr>' + row.map(c => `<td>${String(c).replace(/</g, '&lt;')}</td>`).join('') + '</tr>')
      .join('');
    const html = `<html><head><meta charset="utf-8"/></head><body><table>${rows}</table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tab}-report.xls`; a.click();
    URL.revokeObjectURL(url);
    setToast('Excel file downloaded.');
  };

  const handlePrint = () => {
    try { window.print(); } catch { setToast('Printing is not available here.'); }
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
        <h1>{t('reports')}</h1>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={exportCsv} aria-label={t('exportCsv')}>{t('exportCsv')}</button>
          <button className="btn sm" onClick={exportExcel} aria-label={t('exportExcel')}>{t('exportExcel')}</button>
          <button className="btn sm" onClick={handlePrint} aria-label={t('exportPdf')}>📄 {t('exportPdf')}</button>
          <button className="btn sm" onClick={handlePrint} aria-label={t('print')}>🖨 {t('print')}</button>
        </span>
      </div>

      <div className="tabs" role="tablist" aria-label="Report type">
        {TABS.map(tb => (
          <button key={tb} className="btn" role="tab"
            aria-selected={tb === tab} aria-pressed={tb === tab}
            onClick={() => setTab(tb)}>
            {tb}
          </button>
        ))}
      </div>

      <div className="tb">
        <label>
          Class{' '}
          <select value={cls} onChange={e => setCls(e.target.value)} aria-label="Filter by class">
            <option value="">All classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {err ? (
        <Empty title="Couldn't load reports" text={err} />
      ) : !data ? (
        <Skeleton />
      ) : !data.r?.length ? (
        <Empty title="No data for this filter" text="Try selecting a different class or tab." />
      ) : (
        <div className="tw print-area">
          <div className="print-header">
            <strong>{settings?.school}</strong> — {tab} Report{cls ? ` · Class ${cls}` : ''}
          </div>
          <table className="rt" aria-label={`${tab} report`}>
            <thead>
              <tr>{data.h.map(col => <th key={col} scope="col">{col}</th>)}</tr>
            </thead>
            <tbody>
              {data.r.map((row, idx) => (
                <tr key={idx}>
                  {row.map((cell, ci) => (
                    <td key={ci} data-l={data.h[ci]}>{renderCell(data.h[ci], cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {csvText && <CsvModal csvText={csvText} onClose={() => setCsvText(null)} onToast={m => setToast(m)} />}
      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
