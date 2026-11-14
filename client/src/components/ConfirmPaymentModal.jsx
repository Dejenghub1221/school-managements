import { useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Modal } from './Modal.jsx';

export function ConfirmPaymentModal({ student, fee, onPaymentSuccess, onClose }) {
  const { user } = useAuth();
  const { money } = useSettings();

  const balance = fee ? Math.max(0, Number(fee.amount) - Number(fee.paid)) : 500;
  const isPending = student?.status === 'Pending Payment';

  const [amount, setAmount] = useState(balance > 0 ? balance : 250);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceCode, setReferenceCode] = useState('');
  const [receivedBy, setReceivedBy] = useState(user?.name || user?.username || 'Registrar');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    const numAmt = Number(amount);
    if (!numAmt || numAmt <= 0) {
      setErr('Please enter a valid payment amount.');
      return;
    }
    if (numAmt > balance) {
      setErr(`Payment amount (${money(numAmt)}) cannot exceed outstanding balance (${money(balance)}).`);
      return;
    }

    setBusy(true);
    setErr('');
    try {
      const res = await api(`/students/${student.id}/confirm-payment`, {
        method: 'POST',
        body: {
          amount: numAmt,
          paymentMethod,
          referenceCode: referenceCode.trim() || undefined,
          receivedBy: receivedBy.trim(),
          notes: notes.trim()
        }
      });

      if (onPaymentSuccess) {
        onPaymentSuccess(res);
      }
    } catch (x) {
      setErr(x.message || 'Payment confirmation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`💳 Record Payment: ${student.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        {isPending && (
          <div
            style={{
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderLeft: '4px solid #d97706',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: '0.85rem',
              color: '#92400e'
            }}
          >
            <strong>⚠️ Pending Payment:</strong> Completing this payment will verify registration and immediately activate <strong>{student.name}</strong>'s enrollment to <strong>Active</strong> status.
          </div>
        )}

        {/* Current Balance Summary Card */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            background: 'var(--hv, #f8fafc)',
            padding: '12px 14px',
            borderRadius: 8,
            marginBottom: 16,
            textAlign: 'center'
          }}
        >
          <div>
            <div className="muted" style={{ fontSize: '0.78rem' }}>Total Fee Due</div>
            <strong style={{ fontSize: '0.95rem' }}>{money(fee?.amount || 500)}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '0.78rem' }}>Paid So Far</div>
            <strong style={{ fontSize: '0.95rem', color: '#16a34a' }}>{money(fee?.paid || 0)}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '0.78rem' }}>Outstanding Balance</div>
            <strong style={{ fontSize: '1rem', color: '#dc2626' }}>{money(balance)}</strong>
          </div>
        </div>

        <div className="fld">
          <label htmlFor="pay_amt">Payment Amount to Collect *</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              id="pay_amt"
              type="number"
              step="any"
              min="1"
              max={balance}
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn sm"
              onClick={() => setAmount(balance)}
              title="Set to full outstanding balance"
            >
              Full Balance ({money(balance)})
            </button>
            {balance > 250 && (
              <button
                type="button"
                className="btn sm"
                onClick={() => setAmount(Math.round(balance / 2))}
                title="Set to 50% installment"
              >
                50% ({money(Math.round(balance / 2))})
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="fld">
            <label htmlFor="pay_method">Payment Method *</label>
            <select
              id="pay_method"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
            >
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="CBE Birr / Telebirr">CBE Birr / Telebirr</option>
              <option value="Card / POS">Card / POS</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>

          <div className="fld">
            <label htmlFor="pay_ref">Reference / Slip Code</label>
            <input
              id="pay_ref"
              type="text"
              placeholder="e.g. TRX-948271 or Cash-01"
              value={referenceCode}
              onChange={e => setReferenceCode(e.target.value)}
            />
          </div>
        </div>

        <div className="fld">
          <label htmlFor="pay_staff">Receiving Staff Member *</label>
          <input
            id="pay_staff"
            type="text"
            required
            value={receivedBy}
            onChange={e => setReceivedBy(e.target.value)}
          />
        </div>

        <div className="fld">
          <label htmlFor="pay_notes">Notes / Remarks (Optional)</label>
          <input
            id="pay_notes"
            type="text"
            placeholder="e.g. Term 1 installment payment verified by bursar"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {err && <p className="err" role="alert">{err}</p>}

        <div className="acts" style={{ marginTop: 18 }}>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn pr" disabled={busy}>
            {busy ? 'Processing Payment…' : `Confirm & Issue Receipt (${money(amount)})`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

