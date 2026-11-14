import { useState, useEffect } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Modal } from './Modal.jsx';
import { CLS } from '../config/entities.js';

export function StudentRegistrationFeeModal({ rels = {}, onSaveSuccess, onCancel }) {
  const { user } = useAuth();
  const { money } = useSettings();

  // Step 1: Student Information
  const [name, setName] = useState('');
  const [cls, setCls] = useState(CLS[0] || '7A');
  const [gender, setGender] = useState('Female');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [guardian, setGuardian] = useState('');
  const [address, setAddress] = useState('');

  // Step 2: Fee Structure & Calculations
  const [baseFee, setBaseFee] = useState(500);
  const [minInitialPayment, setMinInitialPayment] = useState(250);
  const [feeTerm, setFeeTerm] = useState('Term 1');
  const [feeLoading, setFeeLoading] = useState(false);

  // Discounts / Exemptions
  const [discountType, setDiscountType] = useState('none'); // 'none' | 'percentage' | 'amount' | 'full_exemption'
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  // Step 3: Payment Details
  const [paymentOption, setPaymentOption] = useState('full'); // 'full' | 'installment' | 'deferred'
  const [paidAmount, setPaidAmount] = useState(500);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceCode, setReferenceCode] = useState('');
  const [receivedBy, setReceivedBy] = useState(user?.name || user?.username || 'Registrar');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // Duplicate Check & Retry
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [retryStudentId, setRetryStudentId] = useState(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // 1. Fetch fee structure whenever class changes
  useEffect(() => {
    let active = true;
    setFeeLoading(true);
    api(`/students/fee-structures?cls=${encodeURIComponent(cls)}`)
      .then(fs => {
        if (!active) return;
        const amt = Number(fs?.amount || 500);
        const minInit = Number(fs?.min_initial_payment || Math.round(amt * 0.5));
        setBaseFee(amt);
        setMinInitialPayment(minInit);
        setFeeTerm(fs?.term || 'Term 1');
      })
      .catch(() => {
        if (!active) return;
        const gradeNum = parseInt(cls, 10) || 7;
        const fallback = gradeNum >= 9 ? 700 : gradeNum >= 8 ? 600 : 500;
        setBaseFee(fallback);
        setMinInitialPayment(Math.round(fallback * 0.5));
      })
      .finally(() => {
        if (active) setFeeLoading(false);
      });
    return () => { active = false; };
  }, [cls]);

  // 2. Calculate net amount due
  let calculatedDiscount = 0;
  if (discountType === 'full_exemption') {
    calculatedDiscount = baseFee;
  } else if (discountType === 'percentage' && Number(discountValue) > 0) {
    calculatedDiscount = Math.min(baseFee, Math.round((baseFee * Number(discountValue)) / 100 * 100) / 100);
  } else if (discountType === 'amount' && Number(discountValue) > 0) {
    calculatedDiscount = Math.min(baseFee, Number(discountValue));
  }
  const netDue = Math.max(0, Math.round((baseFee - calculatedDiscount) * 100) / 100);

  // Sync paidAmount when calculations or paymentOption changes
  useEffect(() => {
    if (discountType === 'full_exemption' || netDue === 0) {
      setPaidAmount(0);
      setPaymentOption('full');
    } else if (paymentOption === 'full') {
      setPaidAmount(netDue);
    } else if (paymentOption === 'installment') {
      setPaidAmount(Math.min(netDue, minInitialPayment));
    } else if (paymentOption === 'deferred') {
      setPaidAmount(0);
    }
  }, [netDue, paymentOption, discountType, minInitialPayment]);

  // 3. Duplicate check when Name or Class changes
  useEffect(() => {
    if (!name.trim() || !cls) {
      setDuplicateWarning(null);
      return;
    }
    const timer = setTimeout(() => {
      api('/students/check-duplicate', {
        method: 'POST',
        body: { name: name.trim(), cls }
      })
        .then(res => {
          if (res.exists) {
            setDuplicateWarning(res);
          } else {
            setDuplicateWarning(null);
          }
        })
        .catch(() => {});
    }, 450);
    return () => clearTimeout(timer);
  }, [name, cls]);

  // Projected enrollment status
  const isExemption = netDue === 0 || discountType === 'full_exemption';
  const numPaid = Number(paidAmount) || 0;
  let projectedStatus = 'Pending Payment';

  if (isExemption || numPaid >= netDue) {
    projectedStatus = 'Active';
  } else if (paymentOption === 'installment' && numPaid >= minInitialPayment) {
    projectedStatus = 'Active';
  } else {
    projectedStatus = 'Pending Payment';
  }

  const handleUseExisting = () => {
    if (duplicateWarning?.student) {
      setRetryStudentId(duplicateWarning.student.id);
      setName(duplicateWarning.student.name);
      setPhone(duplicateWarning.student.phone || '');
      setDuplicateWarning(null);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!name.trim()) return setErr('Please enter student full name.');
    if (!cls) return setErr('Please select a class.');
    if (!phone.trim()) return setErr('Please enter phone number.');

    if (calculatedDiscount > 0 && !discountReason.trim()) {
      return setErr('Please specify the administrator approval justification / reason for the discount.');
    }

    if (paymentOption === 'installment' && numPaid < minInitialPayment && !isExemption) {
      return setErr(`Installment payment requires at least the minimum initial payment of ${money(minInitialPayment)}.`);
    }

    setBusy(true);
    setErr('');

    try {
      const res = await api('/students/register-with-fee', {
        method: 'POST',
        body: {
          student: {
            name: name.trim(),
            cls,
            gender,
            dob: dob || null,
            phone: phone.trim(),
            guardian: guardian || null,
            address: address.trim(),
            retryStudentId
          },
          payment: {
            term: feeTerm,
            baseAmount: baseFee,
            discountType,
            discountValue: Number(discountValue) || 0,
            discountReason: discountReason.trim() || undefined,
            applyInstallment: paymentOption === 'installment',
            amount: numPaid,
            paymentMethod,
            referenceCode: referenceCode.trim() || undefined,
            receivedBy: receivedBy.trim(),
            date: paymentDate,
            notes: notes.trim()
          }
        }
      });

      if (onSaveSuccess) {
        onSaveSuccess(res);
      }
    } catch (x) {
      setErr(x.message || 'Student registration failed. Please review details and try again.');
    } finally {
      setBusy(false);
    }
  };

  const parentsList = rels.parents || [];

  return (
    <Modal title="Student Registration & Mandatory Fee Payment" onClose={onCancel}>
      <form onSubmit={handleSubmit} noValidate style={{ maxHeight: '78vh', overflowY: 'auto', paddingRight: 4 }}>
        {/* Status Indicator Banner */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            background: projectedStatus === 'Active' ? '#ecfdf5' : '#fef3c7',
            border: `1px solid ${projectedStatus === 'Active' ? '#a7f3d0' : '#fde68a'}`,
            color: projectedStatus === 'Active' ? '#065f46' : '#92400e'
          }}
        >
          <div>
            <strong style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.92rem' }}>
              <span>{projectedStatus === 'Active' ? '✓' : '⚠️'}</span>
              Projected Enrollment Status: {projectedStatus.toUpperCase()}
            </strong>
            <span style={{ fontSize: '0.8rem', display: 'block', marginTop: 2 }}>
              {projectedStatus === 'Active'
                ? isExemption
                  ? 'Full scholarship/exemption approved: enrollment will activate immediately.'
                  : paymentOption === 'installment'
                  ? 'Required initial installment satisfied: enrollment will activate immediately.'
                  : 'Full mandatory fee paid: enrollment will activate immediately.'
                : 'Payment is deferred or below threshold: enrollment will remain Pending Payment until verified.'}
            </span>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: '0.78rem',
              fontWeight: 700,
              background: projectedStatus === 'Active' ? '#10b981' : '#f59e0b',
              color: '#ffffff'
            }}
          >
            {projectedStatus}
          </span>
        </div>

        {/* Duplicate Warning Prompt */}
        {duplicateWarning && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderLeft: '4px solid #ef4444',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 16,
              fontSize: '0.86rem',
              color: '#991b1b'
            }}
          >
            <strong>⚠️ Potential Duplicate Registration:</strong>
            <p style={{ margin: '4px 0 8px' }}>
              A student named <strong>{duplicateWarning.student.name}</strong> is already registered in Class{' '}
              <strong>{duplicateWarning.student.cls}</strong> (ID: {duplicateWarning.student.id}, Status:{' '}
              {duplicateWarning.student.status}).
            </p>
            {duplicateWarning.isPending ? (
              <button
                type="button"
                className="btn sm"
                style={{ background: '#b91c1c', color: '#fff', borderColor: '#991b1b' }}
                onClick={handleUseExisting}
              >
                Resume & Complete Payment for Existing Student ({duplicateWarning.student.id})
              </button>
            ) : (
              <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                This student is already actively enrolled. Duplicate active registrations are prohibited.
              </span>
            )}
          </div>
        )}

        {retryStudentId && (
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 14,
              fontSize: '0.84rem',
              color: '#1e40af'
            }}
          >
            ✓ Retrying registration for existing student ID: <strong>{retryStudentId}</strong>
          </div>
        )}

        {/* SECTION 1: Student Information */}
        <h3 style={{ fontSize: '0.98rem', borderBottom: '1px solid var(--bd)', paddingBottom: 6, marginBottom: 12 }}>
          1. Student Information
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div className="fld">
            <label htmlFor="st_name">Full Name *</label>
            <input
              id="st_name"
              type="text"
              required
              placeholder="e.g. Abebe Bikila"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="fld">
            <label htmlFor="st_cls">Assigned Class *</label>
            <select id="st_cls" value={cls} onChange={e => setCls(e.target.value)}>
              {CLS.map(c => (
                <option key={c} value={c}>Class {c}</option>
              ))}
            </select>
          </div>

          <div className="fld">
            <label htmlFor="st_gender">Gender *</label>
            <select id="st_gender" value={gender} onChange={e => setGender(e.target.value)}>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </div>

          <div className="fld">
            <label htmlFor="st_dob">Date of Birth</label>
            <input
              id="st_dob"
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
            />
          </div>

          <div className="fld">
            <label htmlFor="st_phone">Contact Phone *</label>
            <input
              id="st_phone"
              type="tel"
              required
              placeholder="0911223344"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>

          <div className="fld">
            <label htmlFor="st_guard">Parent / Guardian</label>
            <select id="st_guard" value={guardian} onChange={e => setGuardian(e.target.value)}>
              <option value="">-- Select Parent / Guardian --</option>
              {parentsList.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.phone || p.id})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="fld" style={{ marginTop: 4 }}>
          <label htmlFor="st_addr">Residential Address</label>
          <input
            id="st_addr"
            type="text"
            placeholder="e.g. Bole Sub-city, Woreda 03, Addis Ababa"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </div>

        {/* SECTION 2: Mandatory Fee Calculation & Approved Discounts */}
        <h3 style={{ fontSize: '0.98rem', borderBottom: '1px solid var(--bd)', paddingBottom: 6, margin: '20px 0 12px' }}>
          2. Mandatory Class Fee & Approved Discounts
        </h3>

        <div
          style={{
            background: 'var(--hv, #f8fafc)',
            border: '1px solid var(--bd, #e2e8f0)',
            borderRadius: 8,
            padding: '14px',
            marginBottom: 16
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <span className="muted" style={{ fontSize: '0.82rem' }}>Automated Fee Calculation:</span>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#047857' }}>
                Class {cls} · {feeTerm} Mandatory Tuition Fee
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>Standard Base Fee</span>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{money(baseFee)}</div>
            </div>
          </div>

          {/* Discount / Exemption Row */}
          <div
            style={{
              paddingTop: 10,
              borderTop: '1px dashed var(--bd)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12
            }}
          >
            <div className="fld" style={{ margin: 0 }}>
              <label htmlFor="disc_type">Administrator Discount / Exemption</label>
              <select
                id="disc_type"
                value={discountType}
                onChange={e => setDiscountType(e.target.value)}
              >
                <option value="none">No Discount (Standard Fee)</option>
                <option value="percentage">Percentage Discount (%)</option>
                <option value="amount">Fixed Amount Discount ($)</option>
                <option value="full_exemption">Full Exemption / 100% Scholarship</option>
              </select>
            </div>

            {discountType === 'percentage' && (
              <div className="fld" style={{ margin: 0 }}>
                <label htmlFor="disc_val">Discount Percentage (%)</label>
                <input
                  id="disc_val"
                  type="number"
                  min="1"
                  max="100"
                  placeholder="e.g. 15"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                />
              </div>
            )}

            {discountType === 'amount' && (
              <div className="fld" style={{ margin: 0 }}>
                <label htmlFor="disc_val">Discount Amount ($)</label>
                <input
                  id="disc_val"
                  type="number"
                  min="1"
                  max={baseFee}
                  placeholder="e.g. 100"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                />
              </div>
            )}

            {discountType !== 'none' && (
              <div className="fld" style={{ margin: 0, gridColumn: 'span 2' }}>
                <label htmlFor="disc_rsn">Approval Justification / Note *</label>
                <input
                  id="disc_rsn"
                  type="text"
                  required
                  placeholder="e.g. Merit Scholarship approved by Principal Dr. Bekele"
                  value={discountReason}
                  onChange={e => setDiscountReason(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Real-time Net Total Display */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
              paddingTop: 10,
              borderTop: '2px solid var(--bd)',
              fontSize: '1rem',
              fontWeight: 700
            }}
          >
            <span>Total Net Amount Due:</span>
            <span style={{ fontSize: '1.25rem', color: '#0f172a' }}>
              {money(netDue)}{' '}
              {calculatedDiscount > 0 && (
                <small style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 500 }}>
                  (Saved {money(calculatedDiscount)})
                </small>
              )}
            </span>
          </div>
        </div>

        {/* SECTION 3: Payment Details & Terms */}
        <h3 style={{ fontSize: '0.98rem', borderBottom: '1px solid var(--bd)', paddingBottom: 6, margin: '20px 0 12px' }}>
          3. Payment Verification & Receipt Details
        </h3>

        {!isExemption && (
          <div className="fld">
            <label>Payment Terms</label>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="pay_term"
                  checked={paymentOption === 'full'}
                  onChange={() => setPaymentOption('full')}
                />
                Full Payment ({money(netDue)})
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="pay_term"
                  checked={paymentOption === 'installment'}
                  onChange={() => setPaymentOption('installment')}
                />
                Installment (Min. Initial: {money(minInitialPayment)})
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="pay_term"
                  checked={paymentOption === 'deferred'}
                  onChange={() => setPaymentOption('deferred')}
                />
                Zero / Deferred (Status: Pending Payment)
              </label>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div className="fld">
            <label htmlFor="pay_amt">
              Amount to Collect Now * {paymentOption === 'installment' && `(Min. ${money(minInitialPayment)})`}
            </label>
            <input
              id="pay_amt"
              type="number"
              step="any"
              min="0"
              max={netDue}
              disabled={isExemption || paymentOption === 'deferred'}
              value={paidAmount}
              onChange={e => setPaidAmount(e.target.value)}
            />
          </div>

          <div className="fld">
            <label htmlFor="pay_method">Payment Method *</label>
            <select
              id="pay_method"
              disabled={isExemption || paymentOption === 'deferred'}
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
            <label htmlFor="pay_ref">Transaction Slip / Ref #</label>
            <input
              id="pay_ref"
              type="text"
              disabled={isExemption || paymentOption === 'deferred'}
              placeholder="e.g. TRX-884920 or Cash-01"
              value={referenceCode}
              onChange={e => setReferenceCode(e.target.value)}
            />
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="fld">
            <label htmlFor="pay_date">Payment Date *</label>
            <input
              id="pay_date"
              type="date"
              required
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
            />
          </div>

          <div className="fld">
            <label htmlFor="pay_notes">Payment Notes</label>
            <input
              id="pay_notes"
              type="text"
              placeholder="e.g. Registration fee paid at finance desk"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Balance Track Summary */}
        <div
          style={{
            background: 'var(--sf, #ffffff)',
            border: '1px solid var(--bd, #e2e8f0)',
            borderRadius: 8,
            padding: '10px 14px',
            marginTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.88rem'
          }}
        >
          <div>
            <span>Amount Received: <strong>{money(numPaid)}</strong></span>
          </div>
          <div>
            <span>Outstanding Balance: </span>
            <strong style={{ color: Math.max(0, netDue - numPaid) > 0 ? '#dc2626' : '#15803d' }}>
              {Math.max(0, netDue - numPaid) > 0 ? money(netDue - numPaid) : 'Zero Balance ✓'}
            </strong>
          </div>
        </div>

        {err && <p className="err" role="alert" style={{ marginTop: 12 }}>{err}</p>}

        {/* Actions */}
        <div className="acts" style={{ marginTop: 18 }}>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn pr"
            disabled={busy || (duplicateWarning && !duplicateWarning.isPending && !retryStudentId)}
          >
            {busy
              ? 'Registering & Processing...'
              : projectedStatus === 'Active'
              ? `Confirm Registration & Activate (${money(numPaid)})`
              : 'Save as Pending Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

