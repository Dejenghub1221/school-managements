import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Empty, Modal, ConfirmModal, Skeleton, Toast } from '../components/index.js';

const PER = 8;
const today = new Date().toISOString().slice(0, 10);

export default function Fees() {
  const { user, can } = useAuth();
  const { money, settings } = useSettings();
  const write = can('fees');
  const isAdmin = user?.role === 'admin';
  const isParent = user?.role === 'parent';

  const [fees, setFees] = useState(null);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState('');
  const [pg, setPg] = useState(1);

  const [modal, setModal] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [fData, sData, pData, cData] = await Promise.all([
        api('/fees'),
        api('/students'),
        api('/payments'),
        api('/classes-list').catch(() => ['7A','7B','8A','8B','9A','9B'])
      ]);
      setFees(fData);
      setStudents(sData);
      setPayments(pData);
      setClasses(cData || []);
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
      const res = await api(`/fees/${modal.row.id}/pay`, { method: 'POST', body: { amount: amt, date } });
      setToast('Payment recorded successfully.');
      setModal(null);
      // Show official receipt modal
      setReceiptData({
        receiptId: res.receiptId || `RCP_${Date.now().toString().slice(-6)}`,
        studentName: studentName(modal.row.student),
        term: modal.row.term,
        amount: amt,
        date: date,
        balance: modal.row.amount - (modal.row.paid + amt)
      });
      load();
    } catch (x) {
      setToast(x.message);
    }
  };

  const handleClassFeeStructure = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const cls = fd.get('cls')?.toString();
    const term = fd.get('term')?.toString();
    const amount = Number(fd.get('amount'));
    if (!cls || !term || !(amount > 0)) {
      setToast('Fill in all fee structure fields.');
      return;
    }
    try {
      const res = await api('/admin-actions/fee-structure', {
        method: 'POST',
        body: { cls, term, amount }
      });
      setToast(res.message);
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

  const handlePrintReceipt = () => {
    try { window.print(); } catch { setToast('Printing not available here.'); }
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
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {write ? (
            <>
              <button className="btn pr" onClick={() => setModal({ type: 'form' })}>
                Add fee record
              </button>
              <button className="btn" onClick={() => setModal({ type: 'classFee' })}>
                🏷️ Set class fee structure
              </button>
            </>
          ) : (
            <span className="bd y">View only</span>
          )}
        </span>
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
                  <th scope="col">Actions</th>
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
                      <td className="act" data-l="Actions">
                        <div className="act-group">
                          {bal > 0 && (write || isParent) && (
                            <button className="btn sm pr" onClick={() => setModal({ type: 'pay', row: r })}>
                              {isParent ? '💳 Pay online' : 'Pay'}
                            </button>
                          )}
                          {r.paid > 0 && (
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => setReceiptData({
                                receiptId: `RCP_${r.id}`,
                                studentName: studentName(r.student),
                                term: r.term,
                                amount: r.paid,
                                date: r.date || today,
                                balance: bal
                              })}
                            >
                              🧾 Receipt
                            </button>
                          )}
                          {write && (
                            <>
                              <button
                                type="button"
                                className="btn sm icon-btn edit-btn"
                                title="Edit"
                                aria-label={`Edit fee record ${r.id}`}
                                onClick={() => setModal({ type: 'form', row: r })}
                              >
                                <Icon name="edit" />
                              </button>
                              <button
                                type="button"
                                className="btn sm icon-btn del-btn"
                                title="Delete"
                                aria-label={`Delete fee record ${r.id}`}
                                onClick={() => setModal({ type: 'del', row: r })}
                              >
                                <Icon name="delete" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
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
              <th scope="col">Action</th>
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
                  <td data-l="Action">
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => setReceiptData({
                        receiptId: p.receiptId || p.id,
                        studentName: p.studentName || studentName(p.studentId),
                        term: 'Term Payment',
                        amount: p.amount,
                        date: p.date,
                        balance: 0
                      })}
                    >
                      🧾 View receipt
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                  No payment history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pay modal (Online payment for parents / Record payment for admin) */}
      {modal?.type === 'pay' && (
        <Modal title={`${isParent ? 'Pay fees online' : 'Record payment'} for ${studentName(modal.row.student)}`} onClose={() => setModal(null)}>
          <form onSubmit={handlePay} noValidate>
            <div className="fld">
              <label htmlFor="p_amt">Amount ({settings?.cur || '$'}) *</label>
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
            {isParent ? (
              <div className="fld">
                <label>Payment method</label>
                <select defaultValue="card">
                  <option value="card">Credit / Debit Card</option>
                  <option value="bank">Mobile Banking / Bank Transfer</option>
                </select>
              </div>
            ) : (
              <div className="fld">
                <label htmlFor="p_date">Date *</label>
                <input id="p_date" name="date" type="date" defaultValue={today} required />
              </div>
            )}
            <div className="acts">
              <button type="button" className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn pr">{isParent ? 'Authorize & pay online' : 'Record payment'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Set class fee structure modal (Admin) */}
      {modal?.type === 'classFee' && (
        <Modal title="Set Fee Structure per Class" onClose={() => setModal(null)}>
          <form onSubmit={handleClassFeeStructure} noValidate>
            <p className="muted" style={{ marginBottom: 14 }}>
              This will create or update the fee billing for all active students in the selected class.
            </p>
            <div className="fld">
              <label htmlFor="cfs_cls">Class *</label>
              <select id="cfs_cls" name="cls" required>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="cfs_term">Term *</label>
              <select id="cfs_term" name="term" required>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </select>
            </div>
            <div className="fld">
              <label htmlFor="cfs_amt">Amount per student ({settings?.cur || '$'}) *</label>
              <input id="cfs_amt" name="amount" type="number" min="1" placeholder="e.g. 500" required />
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn pr">Apply fee structure</button>
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
                {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.cls})</option>)}
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

      {/* Official Receipt Modal */}
      {receiptData && (
        <Modal title="Official Payment Receipt" onClose={() => setReceiptData(null)}>
          <div className="print-area" style={{ padding: 12 }}>
            <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid var(--bd)', paddingBottom: 10 }}>
              <h2 style={{ margin: 0 }}>{settings?.school || 'ABC Academy'}</h2>
              <div className="muted">Fee Payment Receipt · {receiptData.receiptId}</div>
            </div>
            <dl style={{ marginBottom: 16 }}>
              <dt>Receipt No</dt><dd><b>{receiptData.receiptId}</b></dd>
              <dt>Student</dt><dd>{receiptData.studentName}</dd>
              <dt>Description</dt><dd>{receiptData.term}</dd>
              <dt>Payment Date</dt><dd>{receiptData.date}</dd>
              <dt>Amount Paid</dt><dd><b>{money(receiptData.amount)}</b></dd>
              {receiptData.balance !== undefined && (
                <>
                  <dt>Remaining Balance</dt><dd>{money(receiptData.balance)}</dd>
                </>
              )}
            </dl>
            <div style={{ textAlign: 'center', padding: '10px 0', borderTop: '1px dashed var(--bd)' }}>
              <span className="bd g">Payment Verified · Thank you</span>
            </div>
            <div className="acts" style={{ marginTop: 14 }}>
              <button type="button" className="btn pr" onClick={handlePrintReceipt}>🖨 Print / Download receipt</button>
              <button type="button" className="btn" onClick={() => setReceiptData(null)}>Close</button>
            </div>
          </div>
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
