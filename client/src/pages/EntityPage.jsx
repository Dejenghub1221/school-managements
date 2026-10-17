import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { ENT } from '../config/entities.js';
import { Badge, Empty, Modal, ConfirmModal, Skeleton, Toast, StudentProfile, Icon } from '../components/index.js';

const PER = 8;

function RecordForm({ cfg, rels, init = {}, onSave, onCancel, submitLabel }) {
  const opts = f => (f.rel ? (rels[f.rel] || []).map(x => [x.id, x.name]) : (f.o || []).map(x => [x, x]));

  const [v, setV] = useState(() => {
    const initial = { ...init };
    for (const f of cfg.fields) {
      if (initial[f.k] === undefined) {
        if (f.def !== undefined) {
          initial[f.k] = f.def;
        } else if (f.t === 'select' && f.req) {
          const available = opts(f);
          if (available.length > 0) {
            initial[f.k] = available[0][0];
          }
        }
      }
    }
    return initial;
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, val) => setV(s => ({ ...s, [k]: val }));

  const submit = async e => {
    e.preventDefault();
    const data = { ...v };
    for (const f of cfg.fields) {
      if (data[f.k] === undefined || data[f.k] === '') {
        if (f.def !== undefined) {
          data[f.k] = f.def;
        } else if (f.t === 'select' && f.req) {
          const available = opts(f);
          if (available.length > 0) {
            data[f.k] = available[0][0];
          }
        }
      }
    }
    const miss = cfg.fields.filter(f => f.req && (data[f.k] === undefined || data[f.k] === ''));
    if (miss.length) return setErr('Fill in: ' + miss.map(f => f.l).join(', ') + '.');
    if (cfg.validate) {
      const vErr = cfg.validate(data);
      if (vErr) return setErr(vErr);
    }
    setBusy(true);
    try {
      await onSave(data);
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {cfg.fields.map(f => (
        <div className="fld" key={f.k}>
          <label htmlFor={'f_' + f.k}>{f.l}{f.req ? ' *' : ''}</label>
          {f.t === 'select' ? (
            <select id={'f_' + f.k} value={v[f.k] ?? ''} onChange={e => set(f.k, e.target.value)}>
              {!f.req && <option value="" />}
              {opts(f).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
            </select>
          ) : f.t === 'checks' ? (
            <div className="chk" role="group" aria-label={f.l}>
              {opts(f).map(([a]) => (
                <label key={a}>
                  <input
                    type="checkbox"
                    checked={(v[f.k] || []).includes(a)}
                    onChange={e =>
                      set(
                        f.k,
                        e.target.checked
                          ? [...(v[f.k] || []), a]
                          : (v[f.k] || []).filter(x => x !== a)
                      )
                    }
                  />{' '}
                  {a}
                </label>
              ))}
            </div>
          ) : (
            <input
              id={'f_' + f.k}
              type={f.t || 'text'}
              min={f.t === 'number' ? 0 : undefined}
              value={v[f.k] ?? ''}
              onChange={e => set(f.k, f.t === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
            />
          )}
        </div>
      ))}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="acts">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pr" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}

export default function EntityPage({ k }) {
  const cfg = ENT[k];
  const { can } = useAuth();
  const { money } = useSettings();
  const write = can(k);

  const [rows, setRows] = useState(null);
  const [rels, setRels] = useState({});
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [f, setF] = useState('');
  const [pg, setPg] = useState(1);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    setRows(null);
    try {
      const data = await api('/' + k);
      setRows(data);
      const r = {};
      for (const x of cfg.rels || []) {
        r[x] = await api('/' + x);
      }
      setRels(r);
    } catch (x) {
      setErr(x.message);
    }
  }, [k, cfg.rels]);

  useEffect(() => {
    setQ('');
    setF('');
    setPg(1);
    setSelectedProfile(null);
    load();
  }, [load]);

  const viewProfile = async studentId => {
    try {
      const p = await api(`/students/${studentId}/profile`);
      setSelectedProfile(p);
    } catch (x) {
      setToast(x.message);
    }
  };

  const cell = (c, r) => (c[2] ? c[2](r, rels) : r[c[0]]);
  const needle = q.toLowerCase();
  const list = (rows || []).filter(r =>
    (!f || r[cfg.flt] === f) &&
    (cfg.cols.some(c => String(cell(c, r)).toLowerCase().includes(needle)) || (r.id && r.id.toLowerCase().includes(needle)))
  );

  const pages = Math.max(1, Math.ceil(list.length / PER));
  const page = Math.min(pg, pages);
  const slice = list.slice((page - 1) * PER, page * PER);
  const filterValues = cfg.flt ? [...new Set((rows || []).map(r => r[cfg.flt]))].filter(Boolean).sort() : [];

  const done = msg => {
    setModal(null);
    setToast(msg);
    load();
  };

  const save = async v => {
    if (modal.row) {
      await api(`/${k}/${modal.row.id}`, { method: 'PUT', body: v });
      if (selectedProfile && selectedProfile.student.id === modal.row.id) {
        viewProfile(modal.row.id);
      }
    } else {
      await api('/' + k, { method: 'POST', body: v });
    }
    done(cfg.title + (modal.row ? ' updated.' : ' added.'));
  };

  const remove = async () => {
    try {
      await api(`/${k}/${modal.row.id}`, { method: 'DELETE' });
      if (selectedProfile && selectedProfile.student.id === modal.row.id) {
        setSelectedProfile(null);
      }
      done(cfg.title + ' deleted.');
    } catch (x) {
      setModal(null);
      setToast(x.message);
    }
  };

  if (selectedProfile) {
    return (
      <>
        <StudentProfile
          profile={selectedProfile}
          onBack={() => setSelectedProfile(null)}
          onEdit={student => setModal({ type: 'form', row: student })}
          onDelete={student => setModal({ type: 'del', row: student })}
          canWrite={write}
        />
        {modal?.type === 'form' && (
          <Modal title="Edit student" onClose={() => setModal(null)}>
            <RecordForm
              cfg={cfg}
              rels={rels}
              init={modal.row || {}}
              onSave={save}
              onCancel={() => setModal(null)}
              submitLabel="Save changes"
            />
          </Modal>
        )}
        {modal?.type === 'del' && (
          <ConfirmModal
            msg={`This will permanently delete <b>${modal.row.name || modal.row.id}</b>. You can’t undo this.`}
            onCancel={() => setModal(null)}
            onConfirm={remove}
          />
        )}
        <Toast msg={toast} onDone={() => setToast('')} />
      </>
    );
  }

  return (
    <>
      <div className="head">
        <h1>{cfg.label}</h1>
        {write ? (
          <button className="btn pr" onClick={() => setModal({ type: 'form' })}>
            Add {cfg.title.toLowerCase()}
          </button>
        ) : (
          <span className="bd y">View only</span>
        )}
      </div>

      <div className="tb">
        <input
          type="search"
          placeholder={`Search ${cfg.label.toLowerCase()}`}
          aria-label={`Search ${cfg.label.toLowerCase()}`}
          value={q}
          onChange={e => { setQ(e.target.value); setPg(1); }}
        />
        {cfg.flt && (
          <select aria-label={`Filter by ${cfg.flt}`} value={f} onChange={e => { setF(e.target.value); setPg(1); }}>
            <option value="">All {cfg.flt === 'cls' ? 'classes' : cfg.flt + 's'}</option>
            {filterValues.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
      </div>

      {err ? (
        <Empty title="Couldn’t load data" text={err}>
          <button className="btn pr" onClick={load}>Try again</button>
        </Empty>
      ) : !rows ? (
        <Skeleton />
      ) : !list.length ? (
        <Empty
          title={`No ${cfg.label.toLowerCase()} found`}
          text={q || f ? 'Try a different search or clear the filter.' : 'Add your first ' + cfg.title.toLowerCase() + ' to get started.'}
        >
          {(q || f) && <button className="btn" onClick={() => { setQ(''); setF(''); setPg(1); }}>Clear filters</button>}
        </Empty>
      ) : (
        <>
          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  {cfg.cols.map(c => <th key={c[0]} scope="col">{c[1]}</th>)}
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slice.map(r => (
                  <tr key={r.id || r.name}>
                    {cfg.cols.map(c => (
                      <td key={c[0]} data-l={c[1]}>
                        {c[0] === 'status' ? (
                          <Badge v={r.status} />
                        ) : (
                          String(cell(c, r) ?? '')
                        )}
                      </td>
                    ))}
                    <td className="act" data-l="Actions">
                      <div className="act-group">
                        {cfg.hasProfile && (
                          <button
                            type="button"
                            className="btn sm icon-btn view-btn"
                            title="View"
                            aria-label={`View ${r.name || cfg.title}`}
                            onClick={() => viewProfile(r.id)}
                          >
                            <Icon name="view" />
                          </button>
                        )}
                        {!cfg.hasProfile && (
                          <button
                            type="button"
                            className="btn sm icon-btn view-btn"
                            title="View"
                            aria-label={`View ${r.name || cfg.title}`}
                            onClick={() => setModal({ type: 'view', row: r })}
                          >
                            <Icon name="view" />
                          </button>
                        )}
                        {write && (
                          <>
                            <button
                              type="button"
                              className="btn sm icon-btn edit-btn"
                              title="Edit"
                              aria-label={`Edit ${r.name || cfg.title}`}
                              onClick={() => setModal({ type: 'form', row: r })}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              type="button"
                              className="btn sm icon-btn del-btn"
                              title="Delete"
                              aria-label={`Delete ${r.name || cfg.title}`}
                              onClick={() => setModal({ type: 'del', row: r })}
                            >
                              <Icon name="delete" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pgn">
            <span>
              Showing {(page - 1) * PER + 1}–{(page - 1) * PER + slice.length} of {list.length}
            </span>
            <span>
              <button className="btn sm" disabled={page < 2} onClick={() => setPg(page - 1)}>
                Previous
              </button>{' '}
              Page {page} of {pages}{' '}
              <button className="btn sm" disabled={page >= pages} onClick={() => setPg(page + 1)}>
                Next
              </button>
            </span>
          </div>
        </>
      )}

      {modal?.type === 'view' && (
        <Modal title={`${cfg.title} details`} onClose={() => setModal(null)}>
          <dl>
            {cfg.cols.map(c => (
              <div key={c[0]} style={{ display: 'contents' }}>
                <dt>{c[1]}</dt>
                <dd>{String(cell(c, modal.row) ?? '—')}</dd>
              </div>
            ))}
          </dl>
          <div className="acts">
            <button className="btn" onClick={() => setModal(null)}>Close</button>
          </div>
        </Modal>
      )}

      {modal?.type === 'form' && (
        <Modal title={(modal.row ? 'Edit ' : 'Add ') + cfg.title.toLowerCase()} onClose={() => setModal(null)}>
          <RecordForm
            cfg={cfg}
            rels={rels}
            init={modal.row || {}}
            onSave={save}
            onCancel={() => setModal(null)}
            submitLabel={modal.row ? 'Save changes' : 'Add ' + cfg.title.toLowerCase()}
          />
        </Modal>
      )}

      {modal?.type === 'del' && (
        <ConfirmModal
          msg={`This will permanently delete <b>${modal.row.name || modal.row.title || modal.row.id}</b>. You can’t undo this.`}
          onCancel={() => setModal(null)}
          onConfirm={remove}
        />
      )}

      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
