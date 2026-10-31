import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Empty, Modal, Skeleton, Toast } from '../components/index.js';

// The 8 quick access pills from design mockup
const QUICK_PILLS = [
  { id: 'attendance', label: 'Attendance', icon: 'attendance' },
  { id: 'fees', label: 'Fee Payment', icon: 'feePayment' },
  { id: 'results', label: 'Results', icon: 'results' },
  { id: 'messages', label: 'Messages', icon: 'messages' },
  { id: 'announcements', label: 'Announcements', icon: 'announcements' },
  { id: 'homework', label: 'Homework', icon: 'homework' },
  { id: 'timetable', label: 'Timetable', icon: 'timetable' },
  { id: 'reportCard', label: 'Report Card', icon: 'reportCard' }
];

export default function ParentApp() {
  const { user } = useAuth();
  const { money } = useSettings();

  // State
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  // Child selection & active tab
  const [activeChildId, setActiveChildId] = useState(null);
  const [activeSection, setActiveSection] = useState('attendance'); // one of QUICK_PILLS ids

  // Modals
  const [payModal, setPayModal] = useState(null); // fee object to pay
  const [payMethod, setPayMethod] = useState('Telebirr');
  const [payAmount, setPayAmount] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const [messageModal, setMessageModal] = useState(false);
  const [msgRecipient, setMsgRecipient] = useState('');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [msgMeetingDate, setMsgMeetingDate] = useState('');
  const [msgBusy, setMsgBusy] = useState(false);

  const [absenceModal, setAbsenceModal] = useState(false);
  const [absDate, setAbsDate] = useState('');
  const [absReason, setAbsReason] = useState('Medical appointment');
  const [absBusy, setAbsBusy] = useState(false);

  const [reportCardModal, setReportCardModal] = useState(null); // child object

  // Load portal data
  const loadPortal = async () => {
    try {
      setLoading(true);
      const data = await api('/parent-app/portal');
      setPortal(data);
      if (data.children?.length && !activeChildId) {
        setActiveChildId(data.children[0].id);
      }
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, [user]);

  // Selected child
  const selectedChild = useMemo(() => {
    if (!portal?.children?.length) return null;
    return portal.children.find(c => c.id === activeChildId) || portal.children[0];
  }, [portal, activeChildId]);

  // Handle Pay Online
  const handlePayFee = async (e) => {
    e.preventDefault();
    if (!payModal || !selectedChild) return;
    const amount = Number(payAmount) || (payModal.amount - payModal.paid);
    if (amount <= 0) {
      setToast('Please enter a valid amount.');
      return;
    }

    setPayBusy(true);
    try {
      const res = await api('/parent-app/pay-fee', {
        method: 'POST',
        body: {
          feeId: payModal.id,
          studentId: selectedChild.id,
          amount,
          paymentMethod: payMethod
        }
      });
      setReceiptData(res.receipt);
      setPayModal(null);
      setPayAmount('');
      setToast('Payment recorded successfully! 🎉 Digital receipt generated.');
      loadPortal();
    } catch (e) {
      setToast(e.message);
    } finally {
      setPayBusy(false);
    }
  };

  // Handle Send Direct Message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!msgRecipient || !msgBody.trim()) {
      setToast('Please select a recipient and enter your message.');
      return;
    }

    setMsgBusy(true);
    try {
      const teacherObj = (portal?.teachers || []).find(t => t.id === msgRecipient);
      await api('/parent-app/message', {
        method: 'POST',
        body: {
          recipientId: msgRecipient,
          recipientRole: 'teacher',
          recipientName: teacherObj ? teacherObj.name : 'School Staff',
          subject: msgSubject || 'Parent Inquiry',
          body: msgBody.trim(),
          meetingDate: msgMeetingDate || null
        }
      });
      setMessageModal(false);
      setMsgSubject('');
      setMsgBody('');
      setMsgMeetingDate('');
      setToast('Message sent to teacher! They will reply soon.');
      loadPortal();
    } catch (e) {
      setToast(e.message);
    } finally {
      setMsgBusy(false);
    }
  };

  // Handle Report Advance Absence
  const handleReportAbsence = async (e) => {
    e.preventDefault();
    if (!selectedChild || !absDate || !absReason.trim()) {
      setToast('Please specify date and reason.');
      return;
    }

    setAbsBusy(true);
    try {
      await api('/parent-app/report-absence', {
        method: 'POST',
        body: {
          studentId: selectedChild.id,
          date: absDate,
          reason: absReason.trim()
        }
      });
      setAbsenceModal(false);
      setAbsDate('');
      setToast('Absence reported to administration and class teacher.');
      loadPortal();
    } catch (e) {
      setToast(e.message);
    } finally {
      setAbsBusy(false);
    }
  };

  if (loading && !portal) {
    return (
      <div className="parent-app-container">
        <Skeleton />
      </div>
    );
  }

  if (err && !portal) {
    return (
      <div className="parent-app-container">
        <Empty title="Could not load Parent Portal" text={err} />
      </div>
    );
  }

  const children = portal?.children || [];

  const todayStr = new Date().toLocaleDateString('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="parent-app-container">
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 0. PAGE HEADER MATCHING IMAGE 2                                         */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <div className="parent-portal-header">
        <div>
          <h1 className="parent-portal-title">Family portal</h1>
          <span className="parent-portal-date">{todayStr}</span>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 1. HERO & TAGLINE FROM IMAGE 1                                          */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <div className="parent-app-hero">
        <div className="parent-app-hero-top">
          <div className="parent-app-badge">
            <span className="live-dot" /> Verified Family Portal
          </div>
          <span className="parent-greeting">
            Welcome, <strong>{portal?.parent?.name || user?.name || 'Parent'}</strong>
          </span>
        </div>

        {/* Exact Headline from Image 1 */}
        <p className="parent-app-tagline">
          Parents monitor attendance, track fee balances, view exam results, and receive real-time school announcements — all from their phone.
        </p>

        {/* ── Multi-child Selector ── */}
        {children.length > 0 && (
          <div className="parent-children-bar">
            <span className="parent-label">Monitoring child:</span>
            <div className="parent-children-list">
              {children.map((c) => {
                const active = c.id === activeChildId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`parent-child-chip ${active ? 'active' : ''}`}
                    onClick={() => setActiveChildId(c.id)}
                  >
                    <span className="parent-child-avatar">
                      {c.name.charAt(0)}
                    </span>
                    <div className="parent-child-meta">
                      <strong>{c.name}</strong>
                      <small>Grade {c.cls} · {c.id}</small>
                    </div>
                    <span className={`parent-att-badge ${c.todayAttendance?.status === 'Present' ? 'present' : 'other'}`}>
                      {c.todayAttendance?.status === 'Present' ? '✓ Present' : c.todayAttendance?.status || 'Active'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 2. QUICK ACCESS PILLS BAR (EXACT MATCH TO IMAGE 1)                      */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <div className="parent-pills-bar" aria-label="Quick Access Features">
        {QUICK_PILLS.map((pill) => {
          const active = activeSection === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              className={`parent-pill-btn ${active ? 'active' : ''}`}
              onClick={() => {
                setActiveSection(pill.id);
                const el = document.getElementById(`section-${pill.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <Icon name={pill.icon} className="pill-icon" />
              <span>{pill.label}</span>
            </button>
          );
        })}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 3. "WHAT PARENTS CAN ACCESS" 6-CARD GRID (EXACT MATCH TO IMAGE 2)        */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <section className="parent-access-section">
        <div className="parent-section-header">
          <h2 className="parent-section-title">What Parents Can Access</h2>
          <p className="parent-section-subtitle">
            Transparent, real-time visibility into your child's school life — right from your phone.
          </p>
        </div>

        <div className="parent-cards-grid">
          {/* Card 1: Attendance Notifications */}
          <div
            className={`parent-feature-card ${activeSection === 'attendance' ? 'highlighted' : ''}`}
            onClick={() => setActiveSection('attendance')}
          >
            <div className="parent-card-icon-wrap blue">
              <Icon name="announcements" />
            </div>
            <h3 className="parent-card-title">Attendance Notifications</h3>
            <p className="parent-card-desc">
              Receive instant push notifications when your child is marked absent or present each school day.
            </p>
            <div className="parent-card-footer">
              <div className="parent-card-stat">
                <span className="stat-label">Today's Status</span>
                <span className="stat-val green">
                  {selectedChild?.todayAttendance?.status || 'Present'} ✓
                </span>
              </div>
              <span className="parent-card-link">View Attendance →</span>
            </div>
          </div>

          {/* Card 2: Exam Results */}
          <div
            className={`parent-feature-card ${activeSection === 'results' || activeSection === 'reportCard' ? 'highlighted' : ''}`}
            onClick={() => setActiveSection('results')}
          >
            <div className="parent-card-icon-wrap emerald">
              <Icon name="reportCard" />
            </div>
            <h3 className="parent-card-title">Exam Results</h3>
            <p className="parent-card-desc">
              Access verified digital report cards and track academic progress throughout the year.
            </p>
            <div className="parent-card-footer">
              <div className="parent-card-stat">
                <span className="stat-label">Term GPA</span>
                <span className="stat-val purple">
                  {selectedChild?.academic?.average || 88}% ({selectedChild?.academic?.grade || 'A'})
                </span>
              </div>
              <span className="parent-card-link">Check Grades →</span>
            </div>
          </div>

          {/* Card 3: Homework Updates */}
          <div
            className={`parent-feature-card ${activeSection === 'homework' ? 'highlighted' : ''}`}
            onClick={() => setActiveSection('homework')}
          >
            <div className="parent-card-icon-wrap amber">
              <Icon name="homework" />
            </div>
            <h3 className="parent-card-title">Homework Updates</h3>
            <p className="parent-card-desc">
              View daily assignments to ensure your child stays on top of their coursework.
            </p>
            <div className="parent-card-footer">
              <div className="parent-card-stat">
                <span className="stat-label">Active Tasks</span>
                <span className="stat-val amber">
                  {selectedChild?.homework?.length || 0} Assignments
                </span>
              </div>
              <span className="parent-card-link">Review Work →</span>
            </div>
          </div>

          {/* Card 4: School Announcements */}
          <div
            className={`parent-feature-card ${activeSection === 'announcements' ? 'highlighted' : ''}`}
            onClick={() => setActiveSection('announcements')}
          >
            <div className="parent-card-icon-wrap rose">
              <Icon name="announcements" />
            </div>
            <h3 className="parent-card-title">School Announcements</h3>
            <p className="parent-card-desc">
              Never miss an important update, parent-teacher meeting, or school holiday notice.
            </p>
            <div className="parent-card-footer">
              <div className="parent-card-stat">
                <span className="stat-label">New Notices</span>
                <span className="stat-val rose">
                  {portal?.announcements?.length || 0} Alerts
                </span>
              </div>
              <span className="parent-card-link">Read Notices →</span>
            </div>
          </div>

          {/* Card 5: Fee Updates */}
          <div
            className={`parent-feature-card ${activeSection === 'fees' ? 'highlighted' : ''}`}
            onClick={() => setActiveSection('fees')}
          >
            <div className="parent-card-icon-wrap teal">
              <Icon name="feePayment" />
            </div>
            <h3 className="parent-card-title">Fee Updates</h3>
            <p className="parent-card-desc">
              Get timely reminders for term fees, pay online, and view digital receipts for past payments.
            </p>
            <div className="parent-card-footer">
              <div className="parent-card-stat">
                <span className="stat-label">Remaining Balance</span>
                <span className="stat-val teal">
                  {money(selectedChild?.fees?.balance || 0)}
                </span>
              </div>
              <span className="parent-card-link">Pay Online →</span>
            </div>
          </div>

          {/* Card 6: Direct Messaging */}
          <div
            className={`parent-feature-card ${activeSection === 'messages' ? 'highlighted' : ''}`}
            onClick={() => setActiveSection('messages')}
          >
            <div className="parent-card-icon-wrap violet">
              <Icon name="messages" />
            </div>
            <h3 className="parent-card-title">Direct Messaging</h3>
            <p className="parent-card-desc">
              Communicate directly with teachers and the school office through secure in-app messaging.
            </p>
            <div className="parent-card-footer">
              <div className="parent-card-stat">
                <span className="stat-label">Faculty Available</span>
                <span className="stat-val violet">
                  {portal?.teachers?.length || 0} Teachers
                </span>
              </div>
              <span className="parent-card-link">Open Chat →</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 4. INTERACTIVE DEEP-DIVE PANELS                                          */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {selectedChild && (
        <div className="parent-detail-wrapper" id={`section-${activeSection}`}>
          {/* ── SECTION: ATTENDANCE ── */}
          {activeSection === 'attendance' && (
            <div className="parent-panel card">
              <div className="parent-panel-header">
                <div>
                  <h3 className="parent-panel-title">📅 Live Attendance Monitor — {selectedChild.name}</h3>
                  <p className="parent-panel-subtitle">
                    Automated morning check-in and historical attendance records for Class {selectedChild.cls}.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn pr"
                  onClick={() => setAbsenceModal(true)}
                >
                  + Report Planned Absence
                </button>
              </div>

              {/* Status summary banner */}
              <div className="parent-stat-banner">
                <div className="stat-block">
                  <span className="stat-title">Today's Status</span>
                  <span className="stat-big-val green">
                    {selectedChild.todayAttendance?.status} ✓
                  </span>
                  <small>Recorded at 08:15 AM</small>
                </div>
                <div className="stat-block">
                  <span className="stat-title">Monthly Attendance Rate</span>
                  <span className="stat-big-val">
                    {selectedChild.attendance?.rate || 100}%
                  </span>
                  <div className="lms-progress-track" style={{ width: 140, height: 6, marginTop: 4 }}>
                    <div
                      className="lms-progress-fill"
                      style={{ width: `${selectedChild.attendance?.rate || 100}%` }}
                    />
                  </div>
                </div>
                <div className="stat-block">
                  <span className="stat-title">School Days Attended</span>
                  <span className="stat-big-val blue">
                    {selectedChild.attendance?.present || 0} Days
                  </span>
                  <small>Absent: {selectedChild.attendance?.absent || 0} · Late: {selectedChild.attendance?.late || 0}</small>
                </div>
              </div>

              {/* Attendance Log Table */}
              <h4 style={{ margin: '20px 0 10px', fontSize: '1rem' }}>Recent Attendance History</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--bd)', color: 'var(--mu)', fontSize: '0.85rem' }}>
                      <th style={{ padding: '8px 12px' }}>Date</th>
                      <th style={{ padding: '8px 12px' }}>Day</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                      <th style={{ padding: '8px 12px' }}>Verification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedChild.attendance?.recent || []).map((att, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{att.date}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {new Date(att.date).toLocaleDateString('en-US', { weekday: 'long' })}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            className="lms-pill"
                            style={{
                              background: att.status === 'P' ? 'rgba(16, 185, 129, 0.15)' : att.status === 'L' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: att.status === 'P' ? '#059669' : att.status === 'L' ? '#d97706' : '#dc2626',
                              fontWeight: 600
                            }}
                          >
                            {att.status === 'P' ? '✓ Present' : att.status === 'L' ? '⏱ Late' : '✕ Absent'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: 'var(--mu)' }}>
                          Verified by Class Teacher
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SECTION: FEE PAYMENT ── */}
          {activeSection === 'fees' && (
            <div className="parent-panel card">
              <div className="parent-panel-header">
                <div>
                  <h3 className="parent-panel-title">💳 Fee Balances & Online Payment — {selectedChild.name}</h3>
                  <p className="parent-panel-subtitle">
                    Transparent billing, term tuition schedules, online payments, and instant digital receipts.
                  </p>
                </div>
              </div>

              {/* Balance Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, margin: '14px 0 20px' }}>
                <div style={{ background: 'var(--hv)', padding: 16, borderRadius: 10, border: '1px solid var(--bd)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--mu)' }}>Outstanding Balance</span>
                  <h4 style={{ margin: '6px 0 0', fontSize: '1.6rem', color: selectedChild.fees?.balance > 0 ? 'var(--ac)' : '#059669' }}>
                    {money(selectedChild.fees?.balance || 0)}
                  </h4>
                </div>
                <div style={{ background: 'var(--hv)', padding: 16, borderRadius: 10, border: '1px solid var(--bd)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--mu)' }}>Total Billed (Term 1)</span>
                  <h4 style={{ margin: '6px 0 0', fontSize: '1.6rem' }}>
                    {money(selectedChild.fees?.totalBilled || 0)}
                  </h4>
                </div>
                <div style={{ background: 'var(--hv)', padding: 16, borderRadius: 10, border: '1px solid var(--bd)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--mu)' }}>Total Paid to Date</span>
                  <h4 style={{ margin: '6px 0 0', fontSize: '1.6rem', color: '#059669' }}>
                    {money(selectedChild.fees?.totalPaid || 0)}
                  </h4>
                </div>
              </div>

              {/* Invoices List */}
              <h4 style={{ margin: '16px 0 10px', fontSize: '1rem' }}>Term Fee Invoices</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--bd)', color: 'var(--mu)', fontSize: '0.85rem' }}>
                      <th style={{ padding: '8px 12px' }}>Invoice ID</th>
                      <th style={{ padding: '8px 12px' }}>Term</th>
                      <th style={{ padding: '8px 12px' }}>Total Amount</th>
                      <th style={{ padding: '8px 12px' }}>Paid</th>
                      <th style={{ padding: '8px 12px' }}>Balance</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                      <th style={{ padding: '8px 12px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedChild.fees?.invoices || []).map((fee) => (
                      <tr key={fee.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{fee.id}</td>
                        <td style={{ padding: '10px 12px' }}>{fee.term}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{money(fee.amount)}</td>
                        <td style={{ padding: '10px 12px', color: '#059669' }}>{money(fee.paid)}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: fee.balance > 0 ? 'var(--ac)' : 'var(--mu)' }}>
                          {money(fee.balance)}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Badge v={fee.status === 'Paid' ? 'Paid' : fee.status === 'Partial' ? 'Active' : 'Unpaid'} />
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {fee.balance > 0 ? (
                            <button
                              type="button"
                              className="btn sm pr"
                              onClick={() => {
                                setPayModal(fee);
                                setPayAmount(String(fee.balance));
                              }}
                            >
                              💳 Pay Online
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 600 }}>
                              ✓ Settled
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SECTION: EXAM RESULTS & REPORT CARD ── */}
          {(activeSection === 'results' || activeSection === 'reportCard') && (
            <div className="parent-panel card">
              <div className="parent-panel-header">
                <div>
                  <h3 className="parent-panel-title">📊 Academic Performance & Official Report Card</h3>
                  <p className="parent-panel-subtitle">
                    Continuous assessments, subject grades, and verified end-of-term marks for {selectedChild.name}.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn pr"
                  onClick={() => setReportCardModal(selectedChild)}
                >
                  📄 View & Print Report Card
                </button>
              </div>

              {/* GPA Metric Banner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'var(--acs)', padding: 18, borderRadius: 12, margin: '14px 0 20px', border: '1px solid var(--ac)' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--ac)' }}>
                  {selectedChild.academic?.average}%
                </div>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                    Overall Term Grade: {selectedChild.academic?.grade} ({selectedChild.academic?.classRank})
                  </div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--mu)', marginTop: 4 }}>
                    Official grade verified across {selectedChild.academic?.marks?.length || 0} core academic subjects.
                  </div>
                </div>
              </div>

              {/* Subject Marks Breakdown */}
              <h4 style={{ margin: '16px 0 10px', fontSize: '1rem' }}>Subject Marks & Evaluations</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {(selectedChild.academic?.marks || []).map((m, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--sf)',
                      border: '1px solid var(--bd)',
                      borderRadius: 10,
                      padding: 14
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '1.05rem' }}>{m.subject}</strong>
                      <span
                        className="lms-pill"
                        style={{
                          background: m.mark >= 80 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: m.mark >= 80 ? '#059669' : '#2563eb',
                          fontWeight: 700
                        }}
                      >
                        {m.mark}% ({m.grade})
                      </span>
                    </div>

                    <div className="lms-progress-track" style={{ height: 6, margin: '10px 0 8px' }}>
                      <div
                        className="lms-progress-fill"
                        style={{
                          width: `${m.mark}%`,
                          background: m.mark >= 80 ? '#059669' : 'var(--ac)'
                        }}
                      />
                    </div>

                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--mu)', fontStyle: 'italic' }}>
                      Teacher note: "{m.comments}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SECTION: HOMEWORK ── */}
          {activeSection === 'homework' && (
            <div className="parent-panel card">
              <div className="parent-panel-header">
                <div>
                  <h3 className="parent-panel-title">📓 Daily Homework & Coursework Tracker</h3>
                  <p className="parent-panel-subtitle">
                    Track homework assignments, deadlines, and teacher grading feedback for Class {selectedChild.cls}.
                  </p>
                </div>
              </div>

              {!selectedChild.homework?.length ? (
                <Empty title="No active homework" text="All current coursework assignments have been reviewed." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                  {selectedChild.homework.map((hw) => (
                    <div
                      key={hw.id}
                      style={{
                        background: 'var(--sf)',
                        border: '1px solid var(--bd)',
                        borderRadius: 10,
                        padding: 16,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="lms-pill" style={{ background: 'var(--hv)', color: 'var(--tx)' }}>
                            {hw.subject}
                          </span>
                          <strong style={{ fontSize: '1.05rem' }}>{hw.title}</strong>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--mu)', marginTop: 6 }}>
                          ⏱ Due Date: <strong>{hw.due}</strong> · Submission Status:{' '}
                          <span style={{ fontWeight: 600, color: hw.status === 'Graded' ? '#059669' : hw.status === 'Submitted' ? '#2563eb' : '#d97706' }}>
                            {hw.status}
                          </span>
                        </div>
                        {hw.feedback && (
                          <div style={{ fontSize: '0.82rem', color: 'var(--tx)', marginTop: 6, fontStyle: 'italic' }}>
                            💬 Teacher Feedback: "{hw.feedback}"
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        {hw.grade !== null ? (
                          <span className="lms-pill" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontSize: '0.95rem', fontWeight: 700 }}>
                            Score: {hw.grade}%
                          </span>
                        ) : (
                          <span className="lms-pill" style={{ background: 'var(--acs)', color: 'var(--ac)' }}>
                            In Progress
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SECTION: SCHOOL ANNOUNCEMENTS ── */}
          {activeSection === 'announcements' && (
            <div className="parent-panel card">
              <div className="parent-panel-header">
                <div>
                  <h3 className="parent-panel-title">📢 Official School & Class Announcements</h3>
                  <p className="parent-panel-subtitle">
                    Real-time administrative notices, parent-teacher meetings, and holiday schedules.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                {(portal?.announcements || []).map((ann) => (
                  <div
                    key={ann.id}
                    style={{
                      background: 'var(--sf)',
                      borderLeft: '4px solid var(--ac)',
                      borderTop: '1px solid var(--bd)',
                      borderRight: '1px solid var(--bd)',
                      borderBottom: '1px solid var(--bd)',
                      borderRadius: 8,
                      padding: 16
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '1.1rem' }}>{ann.title}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--mu)' }}>
                        {new Date(ann.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <p style={{ margin: '8px 0', fontSize: '0.92rem', lineHeight: 1.5 }}>
                      {ann.content}
                    </p>
                    <div style={{ display: 'flex', gap: 10, fontSize: '0.8rem', color: 'var(--mu)' }}>
                      <span>👤 Author: {ann.author_name} ({ann.author_role})</span>
                      <span>🎯 Target: {ann.target_role} ({ann.cls === 'All' ? 'School-wide' : `Class ${ann.cls}`})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SECTION: DIRECT MESSAGING ── */}
          {activeSection === 'messages' && (
            <div className="parent-panel card">
              <div className="parent-panel-header">
                <div>
                  <h3 className="parent-panel-title">💬 Direct Messaging & Teacher Communications</h3>
                  <p className="parent-panel-subtitle">
                    Secure channel to communicate directly with your child's teachers and administration.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn pr"
                  onClick={() => {
                    if (portal?.teachers?.length) setMsgRecipient(portal.teachers[0].id);
                    setMessageModal(true);
                  }}
                >
                  ✉️ Compose Message / Book Meeting
                </button>
              </div>

              {/* Message thread list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                {!portal?.messages?.length ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--mu)', background: 'var(--hv)', borderRadius: 10 }}>
                    No messages in inbox yet. Click "Compose Message" to contact your child's teacher.
                  </div>
                ) : (
                  portal.messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        background: msg.sender_role === 'parent' ? 'var(--acs)' : 'var(--sf)',
                        border: '1px solid var(--bd)',
                        borderRadius: 10,
                        padding: 16
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{msg.subject || 'Parent Inquiry'}</strong>
                          <span style={{ fontSize: '0.85rem', color: 'var(--mu)', marginLeft: 8 }}>
                            From: {msg.sender_name} ({msg.sender_role}) ➔ To: {msg.recipient_name}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--mu)' }}>
                          {new Date(msg.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: '0.92rem' }}>
                        {msg.body}
                      </p>
                      {msg.meeting_date && (
                        <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--ac)', fontWeight: 600 }}>
                          📅 Requested Meeting Date: {msg.meeting_date}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── SECTION: TIMETABLE ── */}
          {activeSection === 'timetable' && (
            <div className="parent-panel card">
              <div className="parent-panel-header">
                <div>
                  <h3 className="parent-panel-title">📅 Weekly Class Timetable — Class {selectedChild.cls}</h3>
                  <p className="parent-panel-subtitle">
                    Daily period schedule and assigned subject instructors.
                  </p>
                </div>
              </div>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--bd)', color: 'var(--mu)', fontSize: '0.85rem' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Period / Time</th>
                      <th style={{ padding: '10px 14px' }}>Monday</th>
                      <th style={{ padding: '10px 14px' }}>Tuesday</th>
                      <th style={{ padding: '10px 14px' }}>Wednesday</th>
                      <th style={{ padding: '10px 14px' }}>Thursday</th>
                      <th style={{ padding: '10px 14px' }}>Friday</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedChild.timetable?.periods || []).map((p) => (
                      <tr key={p.period} style={{ borderBottom: '1px solid var(--bd)' }}>
                        <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600 }}>
                          <div>Period {p.period}</div>
                          <small style={{ color: 'var(--mu)', fontWeight: 400 }}>{p.time}</small>
                        </td>
                        {p.schedule.map((slot, i) => (
                          <td key={i} style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{slot.subject}</div>
                            <small style={{ color: 'var(--mu)' }}>{slot.teacher}</small>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 5. FUNCTIONAL MODALS                                                     */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}

      {/* Online Fee Payment Modal */}
      {payModal && (
        <Modal title={`Pay Fee Online — ${payModal.term}`} onClose={() => setPayModal(null)}>
          <form onSubmit={handlePayFee}>
            <div style={{ background: 'var(--hv)', padding: 12, borderRadius: 8, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Invoice Total:</span>
                <strong>{money(payModal.amount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: 4 }}>
                <span>Remaining Balance:</span>
                <strong style={{ color: 'var(--ac)' }}>{money(payModal.balance)}</strong>
              </div>
            </div>

            <div className="fld">
              <label htmlFor="pay_method">Payment Method</label>
              <select id="pay_method" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="Telebirr">Telebirr (Ethiopian Digital Wallet)</option>
                <option value="CBE Birr">Commercial Bank of Ethiopia (CBE Birr)</option>
                <option value="Bank Card">Credit / Debit Card (Visa, Mastercard)</option>
                <option value="Direct Transfer">Bank Wire Transfer</option>
              </select>
            </div>

            <div className="fld">
              <label htmlFor="pay_amt">Payment Amount *</label>
              <input
                id="pay_amt"
                type="number"
                step="any"
                required
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="Enter amount to pay..."
              />
            </div>

            <div className="acts">
              <button type="button" className="btn" onClick={() => setPayModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn pr" disabled={payBusy}>
                {payBusy ? 'Processing...' : `Confirm Payment (${money(Number(payAmount) || 0)}) ➔`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Verified Digital Receipt Modal */}
      {receiptData && (
        <Modal title="Verified Digital Receipt" onClose={() => setReceiptData(null)}>
          <div style={{ textAlign: 'center', padding: 10 }}>
            <div style={{ fontSize: '3rem' }}>🧾</div>
            <h3 style={{ margin: '6px 0 2px' }}>Payment Confirmation</h3>
            <span className="lms-pill" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: 700 }}>
              VERIFIED TRANSACTION ✓
            </span>

            <div style={{ background: 'var(--hv)', padding: 16, borderRadius: 10, textAlign: 'left', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Receipt Number:</span>
                <strong style={{ fontFamily: 'monospace' }}>{receiptData.receiptId}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Student ID:</span>
                <strong>{receiptData.studentId}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Term:</span>
                <strong>{receiptData.term}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Payment Method:</span>
                <strong>{receiptData.paymentMethod}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Reference Code:</span>
                <strong style={{ fontFamily: 'monospace' }}>{receiptData.referenceCode}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--bd)', paddingTop: 8 }}>
                <span>Amount Paid:</span>
                <strong style={{ fontSize: '1.2rem', color: '#059669' }}>{money(receiptData.amountPaid)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Remaining Balance:</span>
                <strong>{money(receiptData.remainingBalance)}</strong>
              </div>
            </div>

            <div className="acts" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn pr"
                style={{ flex: 1 }}
                onClick={() => {
                  window.print();
                }}
              >
                🖨 Print / Save Receipt
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setReceiptData(null)}
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Official Digital Report Card Modal */}
      {reportCardModal && (
        <Modal title={`Official Report Card — ${reportCardModal.name}`} onClose={() => setReportCardModal(null)}>
          <div style={{ border: '2px solid var(--bd)', borderRadius: 12, padding: 20, background: 'var(--sf)' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid var(--bd)', paddingBottom: 14 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.4rem' }}>ACADEMY OF EXCELLENCE</h2>
              <div style={{ fontSize: '0.85rem', color: 'var(--mu)' }}>OFFICIAL STUDENT ACADEMIC REPORT CARD · TERM 1</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '14px 0', fontSize: '0.9rem' }}>
              <div><strong>Student Name:</strong> {reportCardModal.name}</div>
              <div><strong>Student ID:</strong> {reportCardModal.id}</div>
              <div><strong>Grade & Class:</strong> {reportCardModal.cls}</div>
              <div><strong>Attendance Rate:</strong> {reportCardModal.attendance?.rate}%</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: 10 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--bd)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '8px' }}>Subject</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Mark</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Grade</th>
                  <th style={{ padding: '8px' }}>Teacher Remarks</th>
                </tr>
              </thead>
              <tbody>
                {(reportCardModal.academic?.marks || []).map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--bd)', fontSize: '0.88rem' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{m.subject}</td>
                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700 }}>{m.mark}%</td>
                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: 'var(--ac)' }}>{m.grade}</td>
                    <td style={{ padding: '8px', fontStyle: 'italic', color: 'var(--mu)' }}>{m.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, borderTop: '2px solid var(--bd)', paddingTop: 12 }}>
              <div>
                <strong>Term Average:</strong>{' '}
                <span style={{ fontSize: '1.2rem', color: '#059669', fontWeight: 800 }}>
                  {reportCardModal.academic?.average}%
                </span>{' '}
                ({reportCardModal.academic?.grade})
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--mu)' }}>
                <span>Principal Stamp:</span> <strong>Verified ✓</strong>
              </div>
            </div>
          </div>

          <div className="acts" style={{ marginTop: 16 }}>
            <button type="button" className="btn pr" onClick={() => window.print()}>
              🖨 Print / Download PDF
            </button>
            <button type="button" className="btn" onClick={() => setReportCardModal(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Direct Message Modal */}
      {messageModal && (
        <Modal title="Contact Teacher / School Office" onClose={() => setMessageModal(false)}>
          <form onSubmit={handleSendMessage}>
            <div className="fld">
              <label htmlFor="msg_rec">Select Recipient *</label>
              <select id="msg_rec" required value={msgRecipient} onChange={(e) => setMsgRecipient(e.target.value)}>
                {(portal?.teachers || []).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.subject} (Class {t.cls || selectedChild?.cls})
                  </option>
                ))}
              </select>
            </div>

            <div className="fld">
              <label htmlFor="msg_sub">Subject</label>
              <input
                id="msg_sub"
                value={msgSubject}
                onChange={(e) => setMsgSubject(e.target.value)}
                placeholder="e.g. Question regarding upcoming Math exam..."
              />
            </div>

            <div className="fld">
              <label htmlFor="msg_body">Message Body *</label>
              <textarea
                id="msg_body"
                rows="4"
                required
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                placeholder="Type your message to the teacher..."
              />
            </div>

            <div className="fld">
              <label htmlFor="msg_date">Optional: Propose Parent-Teacher Meeting Date</label>
              <input
                id="msg_date"
                type="date"
                value={msgMeetingDate}
                onChange={(e) => setMsgMeetingDate(e.target.value)}
              />
            </div>

            <div className="acts">
              <button type="button" className="btn" onClick={() => setMessageModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn pr" disabled={msgBusy}>
                {msgBusy ? 'Sending...' : 'Send Message ➔'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Report Advance Absence Modal */}
      {absenceModal && (
        <Modal title={`Report Advance Absence — ${selectedChild?.name}`} onClose={() => setAbsenceModal(false)}>
          <form onSubmit={handleReportAbsence}>
            <div className="fld">
              <label htmlFor="abs_date">Date of Absence *</label>
              <input
                id="abs_date"
                type="date"
                required
                value={absDate}
                onChange={(e) => setAbsDate(e.target.value)}
              />
            </div>

            <div className="fld">
              <label htmlFor="abs_reason">Reason for Absence *</label>
              <select id="abs_reason" value={absReason} onChange={(e) => setAbsReason(e.target.value)}>
                <option value="Medical appointment">Medical / Dental appointment</option>
                <option value="Illness / Sick leave">Illness / Sick leave</option>
                <option value="Family emergency">Family emergency</option>
                <option value="Travel / Out of town">Family travel</option>
                <option value="Religious observance">Religious observance</option>
              </select>
            </div>

            <div className="acts">
              <button type="button" className="btn" onClick={() => setAbsenceModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn pr" disabled={absBusy}>
                {absBusy ? 'Submitting...' : 'Submit Notice ➔'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
