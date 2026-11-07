import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Empty, Modal, ConfirmModal, Skeleton, Toast, ExportImportControls } from '../components/index.js';

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
  const [submissions, setSubmissions] = useState([]);
  const [subFilter, setSubFilter] = useState('Pending');
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState('');
  const [pg, setPg] = useState(1);

  const [modal, setModal] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [clearanceData, setClearanceData] = useState(null);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [fData, sData, pData, cData, subData] = await Promise.all([
        api('/fees'),
        api('/students'),
        api('/payments'),
        api('/classes-list').catch(() => ['7A','7B','8A','8B','9A','9B']),
        isAdmin ? api('/fee-approvals/submissions').catch(() => []) : Promise.resolve([])
      ]);
      setFees(fData);
      setStudents(sData);
      setPayments(pData);
      setClasses(cData || []);
      setSubmissions(subData || []);
    } catch (x) {
      setErr(x.message);
    }
  };

  useEffect(() => {
    load();
  }, [isAdmin]);

  const handleApproveSubmission = async (sub) => {
    setReviewBusy(true);
    try {
      const res = await api(`/fee-approvals/submissions/${sub.id}/approve`, {
        method: 'POST',
        body: { reviewNotes: reviewNotes || 'Receipt verified and payment confirmed.' }
      });
      setToast(res.message || 'Payment submission approved! Fee status updated.');
      setReviewModal(null);
      setReviewNotes('');
      load();
    } catch (x) {
      setToast(x.message);
    } finally {
      setReviewBusy(false);
    }
  };

  const handleRejectSubmission = async (sub) => {
    if (!reviewNotes.trim()) {
      setToast('Please provide a note or reason for rejecting this payment submission.');
      return;
    }
    setReviewBusy(true);
    try {
      const res = await api(`/fee-approvals/submissions/${sub.id}/reject`, {
        method: 'POST',
        body: { reviewNotes }
      });
      setToast(res.message || 'Payment submission rejected. Fee status reverted.');
      setReviewModal(null);
      setReviewNotes('');
      load();
    } catch (x) {
      setToast(x.message);
    } finally {
      setReviewBusy(false);
    }
  };

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
  const pendingApprovalsCount = (submissions || []).filter(s => s.status === 'Pending').length;
  const filteredSubmissions = (submissions || []).filter(s => {
    if (subFilter === 'Pending') return s.status === 'Pending';
    if (subFilter === 'Approved') return s.status === 'Approved';
    if (subFilter === 'Rejected') return s.status === 'Rejected';
    return true;
  });

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
        {isAdmin && (
          <div className="card stat" style={{ borderLeft: pendingApprovalsCount > 0 ? '4px solid #f59e0b' : undefined }}>
            <span className="ico" style={{ color: '#d97706' }}>⏳</span>
            <small>Pending approvals</small>
            <b style={{ color: pendingApprovalsCount > 0 ? '#d97706' : undefined }}>{pendingApprovalsCount}</b>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="card" style={{ margin: '20px 0 24px', borderLeft: pendingApprovalsCount > 0 ? '4px solid #f59e0b' : '4px solid var(--ac)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🛡️</span> Payment Approval Workflow & Receipt Verification
                {pendingApprovalsCount > 0 && (
                  <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                    {pendingApprovalsCount} Pending Review
                  </span>
                )}
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--mu)' }}>
                Review parent-submitted payment receipts. Fees remain "Pending" and are not marked as paid until verified and approved.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Pending', 'All', 'Approved', 'Rejected'].map(st => {
                const count = st === 'All' ? (submissions || []).length : (submissions || []).filter(s => s.status === st).length;
                return (
                  <button
                    key={st}
                    type="button"
                    className={`btn sm ${subFilter === st ? 'pr' : ''}`}
                    onClick={() => setSubFilter(st)}
                  >
                    {st} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {!filteredSubmissions.length ? (
            <div style={{ padding: '16px 20px', background: 'var(--hv)', borderRadius: 8, fontSize: '0.88rem', color: 'var(--mu)', textAlign: 'center' }}>
              No {subFilter !== 'All' ? subFilter.toLowerCase() : ''} payment submissions to display.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--bd)', color: 'var(--mu)', fontSize: '0.82rem' }}>
                    <th style={{ padding: '8px 10px' }}>Date</th>
                    <th style={{ padding: '8px 10px' }}>Student</th>
                    <th style={{ padding: '8px 10px' }}>Invoice / Term</th>
                    <th style={{ padding: '8px 10px' }}>Amount</th>
                    <th style={{ padding: '8px 10px' }}>Method & Ref</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px' }}>Receipt & Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map(sub => (
                    <tr key={sub.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                        {new Date(sub.submittedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <strong>{sub.studentName || studentName(sub.studentId)}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--mu)' }}>Class {sub.cls || '—'} · Parent: {sub.parentName || 'Parent'}</div>
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sub.feeId}</span>
                        <div style={{ fontSize: '0.78rem', color: 'var(--mu)' }}>{sub.term || 'Term 1'}</div>
                      </td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: 'var(--tx)' }}>
                        {money(sub.amount)}
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <div>{sub.paymentMethod}</div>
                        <small style={{ color: 'var(--mu)', fontFamily: 'monospace' }}>{sub.referenceCode}</small>
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <Badge v={sub.status} />
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => {
                              setReviewModal(sub);
                              setReviewNotes(sub.reviewNotes || '');
                            }}
                          >
                            👁️ Review Receipt
                          </button>
                          {sub.status === 'Pending' && (
                            <button
                              type="button"
                              className="btn sm pr"
                              onClick={() => {
                                setReviewModal(sub);
                                setReviewNotes('Receipt verified and payment confirmed.');
                              }}
                            >
                              ✓ Approve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
        <ExportImportControls
          entityKey="fees"
          title="Student Fees"
          columns={[
            { key: 'id', label: 'Fee ID' },
            { key: 'student', label: 'Student', format: r => studentName(r.student) },
            { key: 'term', label: 'Term' },
            { key: 'amount', label: 'Billed Amount', format: r => money(r.amount) },
            { key: 'paid', label: 'Paid Amount', format: r => money(r.paid) },
            { key: 'balance', label: 'Balance Due', format: r => money(r.amount - r.paid) },
            { key: 'status', label: 'Status' },
            { key: 'date', label: 'Date' }
          ]}
          data={filtered}
          fields={[
            { k: 'student', l: 'Student ID', req: 1 },
            { k: 'amount', l: 'Billed Amount', t: 'number', req: 1 },
            { k: 'paid', l: 'Paid Amount', t: 'number' },
            { k: 'term', l: 'Term' },
            { k: 'date', l: 'Date', t: 'date' }
          ]}
          canImport={write && isAdmin}
          onImportComplete={load}
          notify={(msg, type) => setToast(msg)}
        />
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
                          {r.status === 'Pending' ? (
                            isAdmin ? (
                              <button
                                type="button"
                                className="btn sm pr"
                                onClick={() => {
                                  const match = (submissions || []).find(s => s.feeId === r.id && s.status === 'Pending') || {
                                    id: r.pending_submission_id,
                                    feeId: r.id,
                                    studentId: r.student,
                                    term: r.term,
                                    amount: bal,
                                    status: 'Pending'
                                  };
                                  setReviewModal(match);
                                  setReviewNotes('Receipt verified and payment confirmed.');
                                }}
                              >
                                ⏳ Review Receipt
                              </button>
                            ) : (
                              <span className="bd y">⏳ Pending Approval</span>
                            )
                          ) : (
                            bal > 0 && !isParent && write && (
                              <button className="btn sm pr" onClick={() => setModal({ type: 'pay', row: r })}>
                                Pay
                              </button>
                            )
                          )}
                          {bal > 0 && isParent && r.status !== 'Pending' && (
                            <a href="/parent-app" className="btn sm pr">
                              📤 Pay & Submit Receipt
                            </a>
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
                          <button
                            type="button"
                            className="btn sm"
                            title="Generate official exam clearance slip"
                            onClick={() => setClearanceData({
                              id: r.student,
                              name: studentName(r.student),
                              term: r.term,
                              amount: r.amount,
                              paid: r.paid,
                              balance: bal,
                              status: r.status
                            })}
                          >
                            📄 Clearance
                          </button>
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

      {/* Official Clearance Certificate Modal */}
      {clearanceData && (
        <Modal title="Student Financial Clearance & Exam Eligibility" onClose={() => setClearanceData(null)}>
          <div className="print-area" style={{ padding: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid var(--bd)', paddingBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{settings?.school || 'ABC Academy'}</h2>
              <div className="muted">Official Financial Clearance & Examination Eligibility Certificate</div>
              <small className="muted">Academic Year {settings?.year || '2026/27'} · {clearanceData.term}</small>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div><strong>Student Name:</strong> {clearanceData.name}</div>
              <div><strong>Student ID:</strong> {clearanceData.id}</div>
              <div><strong>Billing Term:</strong> {clearanceData.term}</div>
              <div><strong>Account Status:</strong> <Badge v={clearanceData.status} /></div>
            </div>

            <div style={{ background: 'var(--sf)', padding: 14, borderRadius: 8, border: '1px solid var(--bd)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
                <span>Total Term Tuition:</span>
                <strong>{money(clearanceData.amount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
                <span>Total Paid to Date:</span>
                <strong style={{ color: '#059669' }}>{money(clearanceData.paid)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '1.05rem' }}>
                <span>Outstanding Balance:</span>
                <strong style={{ color: clearanceData.balance > 0 ? 'var(--ac)' : '#059669' }}>
                  {money(clearanceData.balance)}
                </strong>
              </div>
            </div>

            <div style={{
              textAlign: 'center',
              padding: 16,
              borderRadius: 8,
              background: clearanceData.balance <= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `2px dashed ${clearanceData.balance <= 0 ? '#059669' : '#dc2626'}`,
              marginBottom: 16
            }}>
              <h3 style={{ margin: 0, color: clearanceData.balance <= 0 ? '#059669' : '#dc2626' }}>
                {clearanceData.balance <= 0 ? '✓ CLEARED FOR TERM EXAMINATIONS' : '⚠️ OUTSTANDING BALANCE — PAYMENT REQUIRED'}
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                {clearanceData.balance <= 0
                  ? 'All term fees and charges are fully settled. The student is authorized to sit for all scheduled examinations.'
                  : 'Please complete payment of the outstanding balance prior to the start of the examination period.'}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, fontSize: 12, color: 'var(--mu)', borderTop: '1px solid var(--bd)', paddingTop: 10 }}>
              <span>Certified on: {new Date().toLocaleDateString()}</span>
              <span>Finance Office & Registrar Seal</span>
            </div>

            <div className="acts" style={{ marginTop: 16 }}>
              <button type="button" className="btn pr" onClick={() => window.print()}>🖨️ Print Clearance Slip</button>
              <button type="button" className="btn" onClick={() => setClearanceData(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Approver Receipt Verification & Approval Modal */}
      {reviewModal && (
        <Modal
          title={`Review Payment Submission — ${reviewModal.referenceCode || reviewModal.id}`}
          onClose={() => setReviewModal(null)}
        >
          <div style={{ padding: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>Student:</strong> {reviewModal.studentName || studentName(reviewModal.studentId || reviewModal.student)}
                {reviewModal.cls ? ` (Class ${reviewModal.cls})` : ''}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Badge v={reviewModal.status} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {reviewModal.status === 'Pending' ? '⏳ Awaiting Decision' : reviewModal.status === 'Approved' ? '✓ Approved' : '✕ Rejected'}
                </span>
              </div>
            </div>

            <div style={{ background: 'var(--hv)', padding: 12, borderRadius: 8, fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Invoice / Term:</span>
                <strong>{reviewModal.feeId} ({reviewModal.term || 'Term 1'})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Amount Submitted:</span>
                <strong style={{ fontSize: '1.1rem', color: 'var(--tx)' }}>{money(reviewModal.amount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Payment Method:</span>
                <strong>{reviewModal.paymentMethod || 'Telebirr'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Reference / Transaction Code:</span>
                <strong style={{ fontFamily: 'monospace' }}>{reviewModal.referenceCode || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Submitted By:</span>
                <span>{reviewModal.parentName || 'Parent'} ({reviewModal.submittedAt ? new Date(reviewModal.submittedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently'})</span>
              </div>
              {reviewModal.reviewedBy && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--bd)', paddingTop: 6 }}>
                  <span>Reviewed By:</span>
                  <strong>{reviewModal.reviewedBy} ({new Date(reviewModal.reviewedAt).toLocaleDateString()})</strong>
                </div>
              )}
            </div>

            {/* Receipt Preview */}
            <h4 style={{ margin: '14px 0 6px', fontSize: '0.95rem' }}>Attached Payment Receipt Document:</h4>
            {reviewModal.receiptFile ? (
              <div style={{ textAlign: 'center', background: 'var(--hv)', padding: 12, borderRadius: 8, border: '1px solid var(--bd)', marginBottom: 14 }}>
                {reviewModal.receiptFile.startsWith('data:image/') || reviewModal.receiptFile.includes('image') ? (
                  <img
                    src={reviewModal.receiptFile}
                    alt="Receipt"
                    style={{ maxWidth: '100%', maxHeight: 350, objectFit: 'contain', borderRadius: 6 }}
                  />
                ) : (
                  <div style={{ padding: 18 }}>
                    <div style={{ fontSize: '2.5rem' }}>📄</div>
                    <p style={{ margin: '8px 0', fontWeight: 600 }}>{reviewModal.receiptFileName || 'receipt.pdf'}</p>
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <a
                    href={reviewModal.receiptFile}
                    target="_blank"
                    rel="noreferrer"
                    download={reviewModal.receiptFileName || 'payment_receipt'}
                    className="btn sm"
                  >
                    📥 Download Original Receipt
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ padding: 16, background: 'var(--hv)', borderRadius: 8, color: 'var(--mu)', textAlign: 'center', marginBottom: 14 }}>
                No receipt file preview available.
              </div>
            )}

            {/* Review Notes */}
            <div className="fld" style={{ marginBottom: 14 }}>
              <label htmlFor="review_notes">Approver Verification Notes / Rejection Reason</label>
              <textarea
                id="review_notes"
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter notes for this approval or reason for rejection (shared with parent)..."
              />
            </div>

            {reviewModal.status === 'Pending' ? (
              <div className="acts" style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setReviewModal(null)}
                  disabled={reviewBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                  onClick={() => handleRejectSubmission(reviewModal)}
                  disabled={reviewBusy}
                >
                  {reviewBusy ? 'Processing...' : '✕ Reject Submission'}
                </button>
                <button
                  type="button"
                  className="btn pr"
                  style={{ flex: 1 }}
                  onClick={() => handleApproveSubmission(reviewModal)}
                  disabled={reviewBusy}
                >
                  {reviewBusy ? 'Processing...' : `✓ Verify & Approve Payment (${money(reviewModal.amount)})`}
                </button>
              </div>
            ) : (
              <div className="acts">
                <button type="button" className="btn" style={{ width: '100%' }} onClick={() => setReviewModal(null)}>
                  Close
                </button>
              </div>
            )}
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
