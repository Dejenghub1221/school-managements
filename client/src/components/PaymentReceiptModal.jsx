import { useSettings } from '../context/SettingsContext.jsx';
import { Modal } from './Modal.jsx';
import { Badge } from './Badge.jsx';

export function PaymentReceiptModal({ receipt, onClose }) {
  const { school, money } = useSettings();

  if (!receipt) return null;

  const isFullExemption = receipt.netDue === 0 || receipt.paymentMethod === 'Exemption / Scholarship';
  const isActivated = receipt.enrollmentStatus === 'Active';

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal title="Official Payment Receipt" onClose={onClose}>
      <div className="receipt-print-container" style={{ padding: '6px 0' }}>
        {/* Printable Receipt Card */}
        <div
          className="receipt-card"
          style={{
            background: 'var(--sf, #ffffff)',
            border: '2px solid var(--bd, #e2e8f0)',
            borderRadius: 12,
            padding: '24px 28px',
            position: 'relative',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
            color: 'var(--tx, #1e293b)'
          }}
        >
          {/* Header Banner */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #047857',
              paddingBottom: 14,
              marginBottom: 18
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#047857', fontWeight: 800 }}>
                {school || 'School Management SC'}
              </h2>
              <div style={{ fontSize: '0.85rem', color: 'var(--mu, #64748b)', marginTop: 2 }}>
                Official Student Enrollment & Fee Payment Receipt
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  display: 'inline-block',
                  background: isActivated ? '#dcfce7' : '#fef3c7',
                  color: isActivated ? '#15803d' : '#b45309',
                  border: `1px solid ${isActivated ? '#86efac' : '#fde68a'}`,
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                {receipt.statusText || (isActivated ? 'ENROLLMENT ACTIVATED' : 'PENDING PAYMENT')}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--mu, #64748b)', marginTop: 4 }}>
                <strong>Receipt No:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{receipt.receiptId}</span>
              </div>
            </div>
          </div>

          {/* Student & Payment Summary Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              background: 'var(--hv, #f8fafc)',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 18,
              fontSize: '0.86rem'
            }}
          >
            <div>
              <span className="muted" style={{ display: 'block', fontSize: '0.76rem', textTransform: 'uppercase' }}>Student Name</span>
              <strong>{receipt.studentName}</strong>
            </div>
            <div>
              <span className="muted" style={{ display: 'block', fontSize: '0.76rem', textTransform: 'uppercase' }}>Student ID</span>
              <strong style={{ fontFamily: 'monospace' }}>{receipt.studentId}</strong>
            </div>
            <div>
              <span className="muted" style={{ display: 'block', fontSize: '0.76rem', textTransform: 'uppercase' }}>Class & Term</span>
              <strong>Class {receipt.cls} · {receipt.term || 'Term 1'}</strong>
            </div>
            <div>
              <span className="muted" style={{ display: 'block', fontSize: '0.76rem', textTransform: 'uppercase' }}>Date Issued</span>
              <strong>{receipt.date || new Date().toISOString().slice(0, 10)}</strong>
            </div>
          </div>

          {/* Fee Calculation Table */}
          <table
            className="rt"
            style={{
              width: '100%',
              marginBottom: 18,
              borderCollapse: 'collapse',
              fontSize: '0.88rem'
            }}
          >
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px' }}>Description</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '8px 10px' }}>
                  Standard Class Tuition & Registration ({receipt.cls})
                </td>
                <td style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600 }}>
                  {money(receipt.baseAmount)}
                </td>
              </tr>
              {Number(receipt.discount) > 0 && (
                <tr style={{ color: '#16a34a' }}>
                  <td style={{ padding: '8px 10px' }}>
                    Approved Discount / Exemption
                    {receipt.discountReason ? ` (${receipt.discountReason})` : ''}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600 }}>
                    - {money(receipt.discount)}
                  </td>
                </tr>
              )}
              <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                <td style={{ padding: '8px 10px' }}>Net Total Due</td>
                <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: '1rem', color: '#0f172a' }}>
                  {money(receipt.netDue)}
                </td>
              </tr>
              <tr style={{ background: '#ecfdf5', fontWeight: 700, color: '#047857' }}>
                <td style={{ padding: '8px 10px' }}>
                  Amount Paid This Transaction ({receipt.paymentMethod || 'Cash'})
                </td>
                <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: '1.05rem' }}>
                  {money(receipt.amountPaid)}
                </td>
              </tr>
              <tr style={{ fontWeight: 700, borderTop: '1px solid #cbd5e1' }}>
                <td style={{ padding: '8px 10px' }}>Remaining Outstanding Balance</td>
                <td
                  style={{
                    textAlign: 'right',
                    padding: '8px 10px',
                    color: Number(receipt.outstandingBalance) > 0 ? '#dc2626' : '#15803d'
                  }}
                >
                  {Number(receipt.outstandingBalance) > 0 ? money(receipt.outstandingBalance) : 'Fully Settled ✓'}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Transaction Metadata Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              paddingTop: 12,
              borderTop: '1px dashed #cbd5e1',
              fontSize: '0.82rem',
              color: 'var(--mu, #64748b)'
            }}
          >
            <div>
              <div><strong>Payment Method:</strong> {receipt.paymentMethod || 'Cash'}</div>
              <div><strong>Reference / Slip #:</strong> <span style={{ fontFamily: 'monospace' }}>{receipt.referenceCode || 'N/A'}</span></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div><strong>Receiving Staff:</strong> {receipt.receivedBy || 'Registrar'}</div>
              <div><strong>Authorized Signature:</strong> _______________________</div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="acts" style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn pr" onClick={handlePrint}>
            🖨️ Print / Download Receipt
          </button>
        </div>
      </div>
    </Modal>
  );
}

