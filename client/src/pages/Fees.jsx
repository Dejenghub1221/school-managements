import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Empty, Modal, ConfirmModal, Skeleton, Toast } from '../components/index.js';

const PER = 8;
const today = new Date().toISOString().slice(0, 10);

export default function Fees() {
  const { can } = useAuth();
  const { money } = useSettings();
  const write = can('fees');

  const [fees, setFees] = useState(null);
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState('');
  const [pg, setPg] = useState(1);

  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [fData, sData, pData] = await Promise.all([
        api('/fees'),
        api('/students'),
        api('/payments')
      ]);
      setFees(fData);
      setStudents(sData);
      setPayments(pData);
    } catch (x) {
      setErr(x.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const studentName = id => students.find(s => s.id === id)?.name || id;

  const needle = q.toLowerCase();
  const filtered = (fees || []).filter(r => {
    const sName = studentName(r.student).toLowerCase();
    const matchesQ = !needle || sName.includes(needle) || r.id.toLowerCase().includes(needle) || r.term.toLowerCase().includes(needle);
    const matchesF = !flt || r.status === flt;
    return matchesQ && matchesF;
  });

  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  const page = Math.min(pg, pages);
  const slice = filtered.slice((page - 1) * PER, page * PER);

  // Top summary metrics
  const billedTotal = (fees || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const collectedTotal = (fees || []).reduce((a, b) => a + (Number(b.paid) || 0), 0);
  const outstandingTotal = billedTotal - collectedTotal;
  const unpaidCount = (fees || []).filter(f => f.status === 'Unpaid').length;

  const handleSaveFee = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      student: fd.get('student')?.toString(),
      term: fd.get('term')?.toString(),
      amount: Number(fd.get('amount')) || 0,
      paid: Number(fd.get('paid')) || 0
    };
    if (!body.student || !body.amount) {
      setToast('Student and billed amount are required.');
      return;
    }
    if (body.paid > body.amount) {
      setToast('Paid amount cannot exceed billed amount.');
      return;
    }
    try {
      if (modal.row) {
        await api(`/fees/${modal.row.id}`, { method: 'PUT', body });
        setToast('Fee record updated.');
      } else {
        await api('/fees', { method: 'POST', body });
        setToast('Fee record added.');
      }
      setModal(null);
      load();
    } catch (x) {
      setToast(x.message);
    }
  };

  const handlePay = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amt = Number(fd.get('amt')) || 0;
    const date = fd.get('date')?.toString() || today;
    const balance = modal.row.amount - modal.row.paid;
    if (amt <= 0) {
      setToast('Enter an amount above zero.');
      return;
    }
    if (amt > balance) {
      setToast(`Amount is more than the balance of ${money(balance)}.`);
      return;
    }
    try {
      await api(`/fees/${modal.row.id}/pay`, { method: 'POST', body: { amount: amt, date } });
      setToast('Payment recorded.');
      setModal(null);
      load();
    } catch (x) {
      setToast(x.message);
    }
  };

  const handleDelete = async () => {
    try {
      await api(`/fees/${modal.row.id}`, { method: 'DELETE' });
      setToast('Fee record deleted.');
      setModal(null);
      load();
    } catch (x) {
      setToast(x.message);
    }
  };

  return (
    <>
      <div className="cards">
        <div className="card stat">
          <span className="ico"><Icon name="fees" /></span>
          <small>Billed</small>
          <b>{money(billedTotal)}</b>
        </div>
        <div className="card stat">
          <span className="ico"><Icon name="fees" /></span>
          <small>Collected</small>
          <b>{money(collectedTotal)}</b>
        </div>
        <div className="card stat">
          <span className="ico"><Icon name="fees" /></span>
          <small>Outstanding</small>
          <b>{money(outstandingTotal)}</b>
        </div>
        <div className="card stat">
          <span className="ico"><Icon name="fees" /></span>
          <small>Unpaid accounts</small>
          <b>{unpaidCount}</b>
        </div>
      </div>

      <div className="head">
        <h1>Fees & Payments</h1>
        {write ? (
          <button className="btn pr" onClick={() => setModal({ type: 'form' })}>
            Add fee record
          </button>
        ) : (
          <span className="bd y">View only</span>
        )}
      </div>

      <div className="tb">
        <input
          type="search"
          placeholder="Search fees"
          aria-label="Search fees"
          value={q}
          onChange={e => { setQ(e.target.value); setPg(1); }}
        />
        <select
          aria-label="Filter by status"
          value={flt}
          onChange={e => { setFlt(e.target.value); setPg(1); }}
        >
          <option value="">All statuses</option>
          <option value="Paid">Paid</option>
          <option value="Partial">Partial</option>
          <option value="Unpaid">Unpaid</option>
        </select>
      </div>

      {err ? (
        <Empty title="Couldn’t load fees" text={err} />
      ) : !fees ? (
        <Skeleton />
      ) : !filtered.length ? (
        <Empty
          title="No fee records found"
          text={q || flt ? 'Try a different search or filter.' : 'Add your first fee record to get started.'}
        >
          {(q || flt) && (
            <button className="btn" onClick={() => { setQ(''); setFlt(''); setPg(1); }}>
              Clear filters
            </button>
          )}
        </Empty>
      ) : (
        <>
          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Student</th>
                  <th scope="col">Term</th>
                  <th scope="col">Billed</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Balance</th>
                  <th scope="col">Status</th>
                  {write && <th scope="col">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {slice.map(r => {
                  const bal = r.amount - r.paid;
                  return (
                    <tr key={r.id}>
                      <td data-l="ID">{r.id}</td>
                      <td data-l="Student">{studentName(r.student)}</td>
                      <td data-l="Term">{r.term}</td>
                      <td data-l="Billed">{money(r.amount)}</td>
                      <td data-l="Paid">{money(r.paid)}</td>
                      <td data-l="Balance">{money(bal)}</td>
                      <td data-l="Status"><Badge v={r.status} /></td>
                      {write && (
                        <td className="act" data-l="Actions">
                          {bal > 0 && (
                            <button className="btn sm" onClick={() => setModal({ type: 'pay', row: r })}>
                              Pay
                            </button>
                          )}
                          <button className="btn sm" onClick={() => setModal({ type: 'form', row: r })}>
                            Edit
                          </button>
                          <button className="btn sm" onClick={() => setModal({ type: 'del', row: r })}>
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pgn">
            <span>
              Showing {(page - 1) * PER + 1}–{(page - 1) * PER + slice.length} of {filtered.length}
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

      {/* Payment history section */}
      <h2 style={{ margin: '24px 0 10px' }}>Payment history</h2>
      <div className="tw">
        <table className="rt">
          <thead>
            <tr>
              <th scope="col">Receipt</th>
              <th scope="col">Student</th>
              <th scope="col">Date</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.length ? (
              payments.map((p, idx) => (
                <tr key={idx}>
                  <td data-l="Receipt">{p.receiptId || p.id}</td>
                  <td data-l="Student">{p.studentName || studentName(p.studentId)}</td>
                  <td data-l="Date">{p.date}</td>
                  <td data-l="Amount">{money(p.amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                  No payment history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pay modal */}
      {modal?.type === 'pay' && (
        <Modal title={`Record payment for ${studentName(modal.row.student)}`} onClose={() => setModal(null)}>
          <form onSubmit={handlePay} noValidate>
            <div className="fld">
              <label htmlFor="p_amt">Amount *</label>
              <input
                id="p_amt"
                name="amt"
                type="number"
                min="1"
                max={modal.row.amount - modal.row.paid}
                defaultValue={modal.row.amount - modal.row.paid}
                required
              />
            </div>
            <div className="fld">
              <label htmlFor="p_date">Date *</label>
              <input id="p_date" name="date" type="date" defaultValue={today} required />
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn pr">Record payment</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add / Edit modal */}
      {modal?.type === 'form' && (
        <Modal title={modal.row ? 'Edit fee record' : 'Add fee record'} onClose={() => setModal(null)}>
          <form onSubmit={handleSaveFee} noValidate>
            <div className="fld">
              <label htmlFor="f_stud">Student *</label>
              <select id="f_stud" name="student" defaultValue={modal.row?.student || ''} required>
                <option value="" />
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="f_term">Term *</label>
              <select id="f_term" name="term" defaultValue={modal.row?.term || 'Term 1'} required>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </select>
            </div>
            <div className="fld">
              <label htmlFor="f_amt">Amount billed *</label>
              <input
                id="f_amt"
                name="amount"
                type="number"
                min="0"
                defaultValue={modal.row?.amount ?? ''}
                required
              />
            </div>
            <div className="fld">
              <label htmlFor="f_paid">Paid so far</label>
              <input
                id="f_paid"
                name="paid"
                type="number"
                min="0"
                defaultValue={modal.row?.paid ?? 0}
              />
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn pr">{modal.row ? 'Save changes' : 'Add fee record'}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal?.type === 'del' && (
        <ConfirmModal
          msg={`This will delete fee record <b>${modal.row.id}</b> for ${studentName(modal.row.student)}. You can’t undo this.`}
          onCancel={() => setModal(null)}
          onConfirm={handleDelete}
        />
      )}

      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
