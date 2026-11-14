import { useState } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';
import { Badge } from './Badge.jsx';
import { Icon } from '../icons.jsx';
import { ConfirmPaymentModal } from './ConfirmPaymentModal.jsx';
import { PaymentReceiptModal } from './PaymentReceiptModal.jsx';

export function StudentProfile({ profile, onBack, onEdit, onDelete, canWrite, onReportCard, onRefresh }) {
  const { money } = useSettings();
  const [payModal, setPayModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  if (!profile || !profile.student) return null;
  const { student, guardian, attendance, academic, fees, payments = [], feeSummary } = profile;
  const initials = student.name.split(' ').map(x => x[0]).join('').slice(0, 2);

  const isPendingPayment = student.status === 'Pending Payment';
  const primaryFee = (fees && fees.length > 0) ? fees[0] : null;

  const totalBilled = feeSummary?.totalBilled ?? (fees ? fees.reduce((acc, f) => acc + f.amount, 0) : 0);
  const totalPaid = feeSummary?.totalPaid ?? (fees ? fees.reduce((acc, f) => acc + f.paid, 0) : 0);
  const totalDiscount = feeSummary?.totalDiscount ?? (fees ? fees.reduce((acc, f) => acc + (f.discount || 0), 0) : 0);
  const outstandingBalance = feeSummary?.outstandingBalance ?? Math.max(0, totalBilled - totalPaid);

  const handlePaymentSuccess = res => {
    setPayModal(false);
    if (res?.receipt) {
      setSelectedReceipt(res.receipt);
    }
    if (onRefresh) {
      onRefresh();
    }
  };

  return (
    <div>
      <div className="head">
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {onBack && <button className="btn" onClick={onBack}>Back to students</button>}
          {onReportCard && (
            <button className="btn" onClick={() => onReportCard(student)}>
              📄 Report card
            </button>
          )}
        </span>
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

      {/* Pending Payment Alert Banner */}
      {isPendingPayment && (
        <div
          style={{
            background: '#fef3c7',
            border: '1px solid #fde68a',
            borderLeft: '5px solid #d97706',
            borderRadius: 10,
            padding: '14px 18px',
            marginBottom: 18,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            color: '#92400e'
          }}
        >
          <div>
            <strong style={{ fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚠️</span> Enrollment Inactive — Pending Mandatory Fee Payment
            </strong>
            <p style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
              Student registration has been created, but enrollment is withheld until initial fee payment is verified.
              Outstanding balance: <strong>{money(outstandingBalance)}</strong>.
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              className="btn sm pr"
              style={{ background: '#d97706', borderColor: '#b45309' }}
              onClick={() => setPayModal(true)}
            >
              💳 Record & Verify Payment
            </button>
          )}
        </div>
      )}

      <div className="prof">
        <div className="av" aria-hidden="true">{initials}</div>
        <div>
          <h1>{student.name}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {student.id} · Class {student.cls} · <Badge v={student.status} />
            {student.enrolled_at && (
              <span style={{ marginLeft: 8, fontSize: '0.82rem' }}>
                · Enrolled: {new Date(student.enrolled_at).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h2>Details</h2>
          <dl style={{ marginTop: 10 }}>
            <dt>Registration Status</dt>
            <dd><Badge v={student.status} /></dd>
            <dt>Gender</dt><dd>{student.gender}</dd>
            <dt>Date of birth</dt><dd>{student.dob || '—'}</dd>
            <dt>Phone</dt><dd>{student.phone || '—'}</dd>
            <dt>Guardian</dt><dd>{guardian?.name || '—'}</dd>
            {guardian?.phone && <><dt>Guardian phone</dt><dd>{guardian.phone}</dd></>}
            {guardian?.email && <><dt>Guardian email</dt><dd>{guardian.email}</dd></>}
            <dt>Address</dt><dd>{student.address || '—'}</dd>
            {Number(student.discount_applied) > 0 && (
              <>
                <dt>Discount Applied</dt>
                <dd style={{ color: '#16a34a', fontWeight: 600 }}>
                  {money(student.discount_applied)} {student.discount_reason ? `(${student.discount_reason})` : ''}
                </dd>
              </>
            )}
          </dl>
        </div>

        <div className="card">
          <h2>Progress</h2>
          <dl style={{ marginTop: 10 }}>
            <dt>Attendance rate</dt>
            <dd>
              {attendance?.rate ?? 0}% ({attendance?.P ?? 0} present, {attendance?.A ?? 0} absent, {attendance?.L ?? 0} late, {attendance?.E ?? 0} excused)
            </dd>
            <dt>Average mark</dt>
            <dd>
              {academic ? `${Number(academic.average).toFixed(1)}% · Grade ` : '—'}
              {academic?.grade && <Badge v={academic.grade} />}
            </dd>
          </dl>
        </div>
      </div>

      {/* FEES & PAYMENT HISTORY SECTION (Visible to Admin, Student, Parent) */}
      {fees !== null && fees !== undefined && (
        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>💰 Mandatory Fees & Payment History</h2>
              <span className="muted" style={{ fontSize: '0.84rem' }}>
                Class {student.cls} Fee Structure, approved exemptions, installments, and payment receipts
              </span>
            </div>
            {canWrite && outstandingBalance > 0 && (
              <button
                type="button"
                className="btn sm pr"
                onClick={() => setPayModal(true)}
              >
                + Record Payment ({money(outstandingBalance)} Due)
              </button>
            )}
          </div>

          {/* Fee Summary Stat Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 18
            }}
          >
            <div style={{ background: 'var(--hv)', padding: '12px 14px', borderRadius: 8 }}>
              <span className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase' }}>Total Net Due</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{money(totalBilled)}</div>
              {totalDiscount > 0 && (
                <small style={{ color: '#16a34a', fontSize: '0.76rem' }}>Exemption: {money(totalDiscount)}</small>
              )}
            </div>
            <div style={{ background: 'var(--hv)', padding: '12px 14px', borderRadius: 8 }}>
              <span className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase' }}>Total Paid</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a' }}>{money(totalPaid)}</div>
              <small className="muted" style={{ fontSize: '0.76rem' }}>{payments.length} transaction(s)</small>
            </div>
            <div style={{ background: 'var(--hv)', padding: '12px 14px', borderRadius: 8 }}>
              <span className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase' }}>Outstanding Balance</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: outstandingBalance > 0 ? '#dc2626' : '#15803d' }}>
                {outstandingBalance > 0 ? money(outstandingBalance) : 'Fully Settled ✓'}
              </div>
              <small className="muted" style={{ fontSize: '0.76rem' }}>
                Status: <Badge v={isPendingPayment ? 'Pending Payment' : outstandingBalance > 0 ? 'Partial' : 'Paid'} />
              </small>
            </div>
            <div style={{ background: 'var(--hv)', padding: '12px 14px', borderRadius: 8 }}>
              <span className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase' }}>Enrollment Status</span>
              <div style={{ marginTop: 4 }}><Badge v={student.status} /></div>
              <small className="muted" style={{ fontSize: '0.76rem' }}>
                {student.status === 'Active' ? 'Enrollment Verified' : 'Awaiting Payment'}
              </small>
            </div>
          </div>

          {/* Payment History Table */}
          <h3 style={{ fontSize: '0.92rem', marginBottom: 8, color: 'var(--tx)' }}>
            Official Payment Receipts & Transaction Log
          </h3>
          {payments.length === 0 ? (
            <div style={{ padding: '16px', background: 'var(--hv)', borderRadius: 8, textAlign: 'center', color: 'var(--mu)' }}>
              No payments recorded yet for this student.
            </div>
          ) : (
            <div className="tw" style={{ overflowX: 'auto' }}>
              <table className="rt" style={{ fontSize: '0.86rem' }}>
                <thead>
                  <tr>
                    <th>Receipt No</th>
                    <th>Date</th>
                    <th>Amount Paid</th>
                    <th>Method</th>
                    <th>Transaction Ref</th>
                    <th>Received By</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id || p.receiptId}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {p.receiptId || p.id}
                      </td>
                      <td>{p.date}</td>
                      <td style={{ fontWeight: 700, color: '#16a34a' }}>
                        {money(p.amount)}
                      </td>
                      <td>{p.paymentMethod || 'Cash'}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--mu)' }}>
                        {p.referenceCode || p.receiptId}
                      </td>
                      <td>{p.receivedBy || 'Staff'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() =>
                            setSelectedReceipt({
                              receiptId: p.receiptId || p.id,
                              studentId: student.id,
                              studentName: student.name,
                              cls: student.cls,
                              term: p.term || 'Term 1',
                              baseAmount: totalBilled,
                              discount: totalDiscount,
                              netDue: totalBilled,
                              amountPaid: p.amount,
                              outstandingBalance,
                              paymentMethod: p.paymentMethod || 'Cash',
                              referenceCode: p.referenceCode || p.receiptId,
                              date: p.date,
                              receivedBy: p.receivedBy || 'Staff',
                              enrollmentStatus: student.status,
                              statusText: student.status === 'Active' ? 'ENROLLMENT ACTIVATED' : 'CONFIRMED PAYMENT'
                            })
                          }
                          title="View & Print Official Receipt"
                        >
                          🧾 View Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {payModal && (
        <ConfirmPaymentModal
          student={student}
          fee={primaryFee}
          onPaymentSuccess={handlePaymentSuccess}
          onClose={() => setPayModal(false)}
        />
      )}

      {selectedReceipt && (
        <PaymentReceiptModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  );
}
