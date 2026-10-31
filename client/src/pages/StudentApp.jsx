import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Empty, Modal, Skeleton, Toast } from '../components/index.js';

// The 8 quick access pills from the student image
const STUDENT_PILLS = [
  { id: 'assignments', label: 'Assignments', icon: 'assignments' },
  { id: 'timetable', label: 'Timetable', icon: 'timetable' },
  { id: 'results', label: 'Results', icon: 'results' },
  { id: 'lessons', label: 'Lessons', icon: 'lessons' },
  { id: 'exams', label: 'Exams', icon: 'exams' },
  { id: 'announcements', label: 'Announcements', icon: 'announcements' },
  { id: 'attendance', label: 'Attendance', icon: 'attendance' },
  { id: 'library', label: 'Library', icon: 'library' }
];

export default function StudentApp() {
  const { user } = useAuth();
  const { money } = useSettings();

  // State
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  // Active section tab
  const [activeSection, setActiveSection] = useState('assignments');

  // Timetable view mode
  const [timetableMode, setTimetableMode] = useState('today'); // 'today' or 'week'

  // Subject relationship drawer/modal (when clicking a timetable slot or subject)
  const [selectedSubject, setSelectedSubject] = useState(null);

  // Assignment submission modal
  const [submitModal, setSubmitModal] = useState(null); // assignment object
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFileName, setSubmissionFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState('all'); // 'all', 'pending', 'submitted', 'graded'

  // Report card modal
  const [reportCardModal, setReportCardModal] = useState(false);

  // Lesson view modal
  const [activeLessonModal, setActiveLessonModal] = useState(null);

  // Load student portal data
  const loadPortal = async () => {
    try {
      setLoading(true);
      const data = await api('/student-app/portal');
      setPortal(data);
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

  // Handle assignment submission
  const handleSubmitAssignment = async (e) => {
    e.preventDefault();
    if (!submitModal) return;
    if (!submissionText.trim() && !submissionFileName.trim()) {
      setToast('Please provide your solution text or attach a file.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/student-app/submit-assignment', {
        method: 'POST',
        body: {
          assignmentId: submitModal.id,
          content: submissionText,
          fileName: submissionFileName || 'student_solution.pdf',
          fileData: 'Simulated File Submission Content'
        }
      });
      setToast('Assignment submitted successfully!');
      setSubmitModal(null);
      setSubmissionText('');
      setSubmissionFileName('');
      loadPortal();
    } catch (e) {
      setToast(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle lesson mark as completed
  const handleCompleteLesson = async (lessonId) => {
    try {
      await api('/student-app/complete-lesson', {
        method: 'POST',
        body: { lessonId }
      });
      setToast('Lesson marked as completed! Progress updated.');
      loadPortal();
    } catch (e) {
      setToast(e.message);
    }
  };

  const student = portal?.student;
  const attendance = portal?.attendance;
  const academics = portal?.academics;
  const assignments = portal?.assignments || [];
  const exams = portal?.exams || [];
  const timetable = portal?.timetable;
  const lmsCourses = portal?.lmsCourses || [];
  const announcements = portal?.announcements || [];
  const library = portal?.library || [];

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    if (assignmentFilter === 'pending') {
      return assignments.filter(a => a.submission_status === 'Pending');
    }
    if (assignmentFilter === 'submitted') {
      return assignments.filter(a => a.submission_status === 'Submitted');
    }
    if (assignmentFilter === 'graded') {
      return assignments.filter(a => a.submission_status === 'Graded');
    }
    return assignments;
  }, [assignments, assignmentFilter]);

  // Pending assignments count
  const pendingAssignmentsCount = useMemo(() => {
    return assignments.filter(a => a.submission_status === 'Pending').length;
  }, [assignments]);

  // Next class from timetable
  const nextClass = useMemo(() => {
    if (!timetable?.todaySchedule?.length) return null;
    return timetable.todaySchedule[0];
  }, [timetable]);

  // Next exam
  const nextExam = useMemo(() => {
    if (!exams?.length) return null;
    return exams[0];
  }, [exams]);

  const todayStr = new Date().toLocaleDateString('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

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
        <Empty title="Could not load Student Portal" text={err} />
      </div>
    );
  }

  return (
    <div className="parent-app-container student-app-container">
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 0. PAGE HEADER & DATE                                                    */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <div className="parent-portal-header">
        <div>
          <h1 className="parent-portal-title">Student Portal</h1>
          <span className="parent-portal-date">{todayStr}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn sm"
            onClick={() => setReportCardModal(true)}
          >
            📄 Verified Report Card
          </button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 1. HERO & TAGLINE FROM ATTACHED IMAGE                                   */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <div className="parent-app-hero student-app-hero">
        <div className="parent-app-hero-top">
          <div className="parent-app-badge">
            <span className="live-dot" /> Class {student?.cls || '7A'} · Active Student
          </div>
          <span className="parent-greeting">
            Welcome, <strong>{student?.name || user?.name || 'Student'}</strong> (ID: {student?.id})
          </span>
        </div>

        {/* Exact Headline from Student Image */}
        <p className="parent-app-tagline">
          Students access their timetable, assignments, exam results, lesson materials, and announcements all from one mobile app.
        </p>

        {/* ── Today's Interconnected Flow Bar ── */}
        <div className="student-flow-bar">
          <div className="student-flow-chip">
            <div className="student-flow-icon">🕒</div>
            <div className="student-flow-info">
              <span className="student-flow-label">Today's Class</span>
              <strong>{nextClass ? `${nextClass.subject} (${nextClass.room})` : 'Class Schedule'}</strong>
            </div>
            {nextClass && (
              <button
                type="button"
                className="btn xs"
                onClick={() => {
                  setSelectedSubject(nextClass.subject);
                  setActiveSection('timetable');
                }}
              >
                View
              </button>
            )}
          </div>

          <div className="student-flow-chip">
            <div className="student-flow-icon">📝</div>
            <div className="student-flow-info">
              <span className="student-flow-label">Pending Homework</span>
              <strong>{pendingAssignmentsCount} {pendingAssignmentsCount === 1 ? 'task due' : 'tasks due'}</strong>
            </div>
            <button
              type="button"
              className="btn xs"
              onClick={() => setActiveSection('assignments')}
            >
              Submit
            </button>
          </div>

          <div className="student-flow-chip">
            <div className="student-flow-icon">🎓</div>
            <div className="student-flow-info">
              <span className="student-flow-label">Upcoming Exam</span>
              <strong>{nextExam ? nextExam.name : 'No test today'}</strong>
            </div>
            <button
              type="button"
              className="btn xs"
              onClick={() => setActiveSection('exams')}
            >
              Details
            </button>
          </div>

          <div className="student-flow-chip">
            <div className="student-flow-icon">📈</div>
            <div className="student-flow-info">
              <span className="student-flow-label">Current Average</span>
              <strong>{academics?.average}% ({academics?.overallGrade})</strong>
            </div>
            <button
              type="button"
              className="btn xs"
              onClick={() => setActiveSection('results')}
            >
              Report
            </button>
          </div>

          <div className="student-flow-chip">
            <div className="student-flow-icon">✅</div>
            <div className="student-flow-info">
              <span className="student-flow-label">Attendance</span>
              <strong>{attendance?.today} ({attendance?.rate}%)</strong>
            </div>
            <button
              type="button"
              className="btn xs"
              onClick={() => setActiveSection('attendance')}
            >
              Stats
            </button>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 2. THE 8 QUICK ACCESS PILLS (EXACT FROM ATTACHED IMAGE)                 */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <div className="parent-pills-bar">
        {STUDENT_PILLS.map((pill) => {
          const active = activeSection === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              className={`parent-pill-btn ${active ? 'active' : ''}`}
              onClick={() => setActiveSection(pill.id)}
            >
              <Icon name={pill.icon} className="pill-ic" />
              <span>{pill.label}</span>
              {pill.id === 'assignments' && pendingAssignmentsCount > 0 && (
                <span className="pill-badge">{pendingAssignmentsCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 3. DEEP-DIVE PANELS FOR EACH PILL WITH INTERLINKED FLOWS               */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}

      {/* ── TAB 1: ASSIGNMENTS & HOMEWORK ── */}
      {activeSection === 'assignments' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Assignments & Homework Tasks</h3>
              <p className="muted">Track upcoming due dates, submit your solutions, and view teacher grading.</p>
            </div>
            <div className="tabs" style={{ margin: 0 }}>
              <button
                type="button"
                className={`btn sm ${assignmentFilter === 'all' ? 'pr' : ''}`}
                onClick={() => setAssignmentFilter('all')}
              >
                All ({assignments.length})
              </button>
              <button
                type="button"
                className={`btn sm ${assignmentFilter === 'pending' ? 'pr' : ''}`}
                onClick={() => setAssignmentFilter('pending')}
              >
                Pending ({pendingAssignmentsCount})
              </button>
              <button
                type="button"
                className={`btn sm ${assignmentFilter === 'submitted' ? 'pr' : ''}`}
                onClick={() => setAssignmentFilter('submitted')}
              >
                Submitted
              </button>
              <button
                type="button"
                className={`btn sm ${assignmentFilter === 'graded' ? 'pr' : ''}`}
                onClick={() => setAssignmentFilter('graded')}
              >
                Graded
              </button>
            </div>
          </div>

          {filteredAssignments.length === 0 ? (
            <div className="empty-state-box">
              <Icon name="assignments" size={32} />
              <p>No assignments found in this category.</p>
            </div>
          ) : (
            <div className="student-assignments-grid">
              {filteredAssignments.map((a) => {
                const isSubmitted = a.submission_status === 'Submitted' || a.submission_status === 'Graded';
                return (
                  <div key={a.id} className="student-assignment-card">
                    <div className="student-assignment-top">
                      <span className="bd g">{a.subject}</span>
                      <span className={`status-pill ${a.submission_status === 'Graded' ? 'status-graded' : isSubmitted ? 'status-submitted' : 'status-pending'}`}>
                        {a.submission_status}
                      </span>
                    </div>

                    <h4 className="student-assignment-title">{a.title}</h4>
                    <div className="student-assignment-meta">
                      <span>📅 Due: <strong>{a.due}</strong></span>
                      <span>Class: {a.cls}</span>
                    </div>

                    {/* Teacher feedback if graded */}
                    {a.submission_grade && (
                      <div className="student-graded-box">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>Grade: {a.submission_grade}/100</span>
                          <span className="bd y">{a.submission_grade >= 80 ? 'A - Excellent' : 'Good Work'}</span>
                        </div>
                        {a.submission_feedback && (
                          <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                            Teacher Remark: "{a.submission_feedback}"
                          </small>
                        )}
                      </div>
                    )}

                    {/* Interconnected Action Links */}
                    <div className="student-assignment-actions">
                      <button
                        type="button"
                        className={`btn sm ${isSubmitted ? '' : 'pr'}`}
                        onClick={() => {
                          setSubmitModal(a);
                          setSubmissionText(a.submission_content || '');
                        }}
                      >
                        {isSubmitted ? '✏️ Resubmit Solution' : '📤 Submit Work'}
                      </button>

                      {/* Flow Connection to LMS */}
                      <button
                        type="button"
                        className="btn sm"
                        title="Study related course lesson in LMS"
                        onClick={() => {
                          setSelectedSubject(a.subject);
                          setActiveSection('lessons');
                        }}
                      >
                        📚 Study Material
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: TIMETABLE & CLASS SCHEDULE ── */}
      {activeSection === 'timetable' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Class Timetable & Schedule — Class {student?.cls || '7A'}</h3>
              <p className="muted">Click on any period to view related assignments, lesson materials, and subject teacher.</p>
            </div>
            <div className="tabs" style={{ margin: 0 }}>
              <button
                type="button"
                className={`btn sm ${timetableMode === 'today' ? 'pr' : ''}`}
                onClick={() => setTimetableMode('today')}
              >
                Today's Flow
              </button>
              <button
                type="button"
                className={`btn sm ${timetableMode === 'week' ? 'pr' : ''}`}
                onClick={() => setTimetableMode('week')}
              >
                Full Week (Mon - Fri)
              </button>
            </div>
          </div>

          {timetableMode === 'today' ? (
            <div className="student-today-schedule-list">
              {timetable?.todaySchedule?.map((slot, idx) => (
                <div
                  key={idx}
                  className="student-schedule-slot"
                  onClick={() => setSelectedSubject(slot.subject)}
                >
                  <div className="slot-time-box">
                    <strong>{slot.period}</strong>
                    <small>{slot.time}</small>
                  </div>
                  <div className="slot-details">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h4 style={{ margin: 0, fontSize: '1.05rem' }}>{slot.subject}</h4>
                      <span className="bd g">{slot.room}</span>
                    </div>
                    <span className="muted">Instructor: {slot.teacher}</span>
                  </div>
                  <button type="button" className="btn sm">
                    Explore Flow →
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="tw" style={{ marginTop: 12 }}>
              <table className="rt timetable-table">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 120 }}>Period / Time</th>
                    {timetable?.days?.map(d => (
                      <th key={d} scope="col">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timetable?.rows?.map((row, rIdx) => (
                    <tr key={rIdx} className={row.isBreak ? 'break-row' : ''}>
                      <td data-l="Period">
                        <strong>{row.periodNum}</strong>
                        <div style={{ fontSize: 11, color: 'var(--mut)' }}>{row.time}</div>
                      </td>
                      {row.days.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          data-l={timetable.days[cIdx]}
                          className={row.isBreak ? 'break-cell' : 'clickable-subject-cell'}
                          onClick={() => !row.isBreak && setSelectedSubject(cell.subject)}
                        >
                          {row.isBreak ? (
                            <span className="break-label">{cell.subject}</span>
                          ) : (
                            <div className="cell-content">
                              <strong>{cell.subject}</strong>
                              <small>{cell.teacher}</small>
                              <span className="cell-room">{cell.room}</span>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Subject Flow Drawer if subject selected */}
          {selectedSubject && (
            <div className="subject-flow-banner" style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '1.15rem' }}>
                  🔗 Flow & Relationship Hub: <strong>{selectedSubject}</strong>
                </h4>
                <button
                  type="button"
                  className="btn xs"
                  onClick={() => setSelectedSubject(null)}
                >
                  ✕ Close Hub
                </button>
              </div>

              <div className="subject-flow-grid" style={{ marginTop: 14 }}>
                {/* 1. LMS Lessons for this subject */}
                <div className="flow-card">
                  <div className="flow-card-head">
                    <span className="flow-icon">📚</span>
                    <strong>LMS Lessons</strong>
                  </div>
                  <p className="flow-desc">Active modules, lecture videos, and interactive course notes.</p>
                  <button
                    type="button"
                    className="btn sm pr"
                    onClick={() => setActiveSection('lessons')}
                  >
                    Open {selectedSubject} Lessons →
                  </button>
                </div>

                {/* 2. Assignments for this subject */}
                <div className="flow-card">
                  <div className="flow-card-head">
                    <span className="flow-icon">📝</span>
                    <strong>Assignments Due</strong>
                  </div>
                  <p className="flow-desc">
                    {assignments.filter(a => a.subject === selectedSubject).length} homework tasks listed for this subject.
                  </p>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setActiveSection('assignments')}
                  >
                    View & Submit Tasks →
                  </button>
                </div>

                {/* 3. Exams for this subject */}
                <div className="flow-card">
                  <div className="flow-card-head">
                    <span className="flow-icon">🎓</span>
                    <strong>Upcoming Exams</strong>
                  </div>
                  <p className="flow-desc">Scheduled midterm & final exam syllabus topics.</p>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setActiveSection('exams')}
                  >
                    Check Exam Dates →
                  </button>
                </div>

                {/* 4. Results & My Marks */}
                <div className="flow-card">
                  <div className="flow-card-head">
                    <span className="flow-icon">📊</span>
                    <strong>My Score & Grade</strong>
                  </div>
                  <p className="flow-desc">
                    Current Mark:{' '}
                    <strong>
                      {academics?.marks?.find(m => m.subject === selectedSubject)?.mark || '85'}% (
                      {academics?.marks?.find(m => m.subject === selectedSubject)?.grade || 'A'}
                      )
                    </strong>
                  </p>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setActiveSection('results')}
                  >
                    View Academic Results →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: RESULTS & ACADEMIC PERFORMANCE ── */}
      {activeSection === 'results' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Academic Results & Progress</h3>
              <p className="muted">Official subject marks, continuous assessment breakdown, and verified report cards.</p>
            </div>
            <button
              type="button"
              className="btn pr"
              onClick={() => setReportCardModal(true)}
            >
              📄 View Official Report Card
            </button>
          </div>

          {/* Academic Summary Banner */}
          <div className="results-summary-banner">
            <div className="results-stat-box">
              <span className="results-stat-num">{academics?.average}%</span>
              <span className="results-stat-lbl">Cumulative Average</span>
            </div>
            <div className="results-stat-box">
              <span className="results-stat-num">{academics?.overallGrade}</span>
              <span className="results-stat-lbl">Overall Letter Grade</span>
            </div>
            <div className="results-stat-box">
              <span className="results-stat-num">{academics?.gpa?.toFixed(2)}</span>
              <span className="results-stat-lbl">Grade Point Average (GPA)</span>
            </div>
            <div className="results-stat-box">
              <span className="results-stat-num">{academics?.marks?.length || 6}</span>
              <span className="results-stat-lbl">Subjects Evaluated</span>
            </div>
          </div>

          {/* Subject Grade Breakdown */}
          <div className="results-subjects-grid" style={{ marginTop: 20 }}>
            {academics?.marks?.map((m) => (
              <div key={m.subject} className="results-subject-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '1.05rem' }}>{m.subject}</h4>
                  <span className={`grade-badge grade-${m.grade?.charAt(0)}`}>{m.grade}</span>
                </div>

                <div className="results-progress-bar-wrap" style={{ margin: '12px 0 6px' }}>
                  <div
                    className="results-progress-bar"
                    style={{
                      width: `${m.mark}%`,
                      background: m.mark >= 80 ? 'var(--ac)' : m.mark >= 60 ? '#f39c12' : '#e74c3c'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--mut)' }}>
                  <span>Score: <strong>{m.mark}/100</strong></span>
                  <span>{m.label}</span>
                </div>

                <div className="results-comment-box" style={{ marginTop: 10 }}>
                  <small className="muted">"{m.comments}"</small>
                </div>

                {/* Relationship Links */}
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn xs"
                    onClick={() => {
                      setSelectedSubject(m.subject);
                      setActiveSection('lessons');
                    }}
                  >
                    📚 Open Lessons
                  </button>
                  <button
                    type="button"
                    className="btn xs"
                    onClick={() => {
                      setSelectedSubject(m.subject);
                      setActiveSection('assignments');
                    }}
                  >
                    📝 Homework
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: LESSONS & LMS MATERIALS ── */}
      {activeSection === 'lessons' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>e-Learning & Lesson Materials</h3>
              <p className="muted">Access video lectures, rich chapter notes, quizzes, and downloadable resources.</p>
            </div>
            <a href="/lms" className="btn pr">
              🚀 Full LMS Portal
            </a>
          </div>

          <div className="lms-courses-list-grid">
            {lmsCourses.map((crs) => {
              const total = crs.total_lessons || crs.recentLessons?.length || 4;
              const completed = crs.completed_lessons || 0;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

              return (
                <div key={crs.id} className="lms-course-item-card">
                  <div className="lms-course-top">
                    <div>
                      <span className="bd g">{crs.subject}</span>
                      <h4 style={{ margin: '6px 0 0', fontSize: '1.15rem' }}>{crs.title}</h4>
                      <small className="muted">Instructor: {crs.instructor || 'Class Teacher'}</small>
                    </div>
                    <span className="lms-pct-pill">{pct}% Done</span>
                  </div>

                  <div className="results-progress-bar-wrap" style={{ margin: '14px 0 16px' }}>
                    <div className="results-progress-bar" style={{ width: `${pct}%`, background: 'var(--ac)' }} />
                  </div>

                  {/* Recent Lessons in this course */}
                  <div className="lms-recent-lessons">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Course Lessons:</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      {crs.recentLessons?.map((les) => (
                        <div
                          key={les.id}
                          className="lms-lesson-row"
                          onClick={() => setActiveLessonModal({ ...les, courseTitle: crs.title, subject: crs.subject })}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="lesson-play-ic">▶</span>
                            <span>{les.title}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <small className="muted">{les.duration_mins}m</small>
                            {les.completed ? (
                              <span className="bd g" style={{ fontSize: 11 }}>✓ Done</span>
                            ) : (
                              <button
                                type="button"
                                className="btn xs pr"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCompleteLesson(les.id);
                                }}
                              >
                                Mark Done
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    <a href={`/lms/courses/${crs.id}`} className="btn sm pr" style={{ flex: 1, textAlign: 'center' }}>
                      Continue Course →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 5: EXAMS ── */}
      {activeSection === 'exams' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Scheduled Examinations</h3>
              <p className="muted">Upcoming tests, midterm assessments, and syllabus revision guides.</p>
            </div>
            <button
              type="button"
              className="btn sm"
              onClick={() => setActiveSection('results')}
            >
              📊 Past Exam Scores
            </button>
          </div>

          <div className="student-exams-grid">
            {exams.map((ex) => (
              <div key={ex.id} className="student-exam-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="bd g">{ex.cls}</span>
                  <span className="status-pill status-pending">{ex.status}</span>
                </div>

                <h4 style={{ margin: '10px 0 4px', fontSize: '1.15rem' }}>{ex.name}</h4>
                <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 12 }}>
                  <span>📅 Exam Date: <strong>{ex.date}</strong></span>
                </div>

                <div className="exam-syllabus-box">
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Revision Topics:</span>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--tx)' }}>
                    Chapters 1 to 4 · Core Principles, Problem Solving, and Practical Applications.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn sm pr"
                    onClick={() => setActiveSection('lessons')}
                  >
                    📚 Revise in LMS
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setActiveSection('timetable')}
                  >
                    🕒 Timetable
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 6: ANNOUNCEMENTS ── */}
      {activeSection === 'announcements' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Official School & Class Announcements</h3>
              <p className="muted">Important messages from the administration and subject teachers.</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {announcements.map((ann) => (
              <div key={ann.id} className="parent-announcement-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span className="bd g" style={{ marginRight: 8 }}>{ann.cls || 'All Classes'}</span>
                    <strong style={{ fontSize: '1.05rem' }}>{ann.title}</strong>
                  </div>
                  <small className="muted">{new Date(ann.created_at).toLocaleDateString()}</small>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
                  {ann.content}
                </p>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--mut)' }}>
                  Posted by: {ann.author_name} ({ann.author_role})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 7: ATTENDANCE ── */}
      {activeSection === 'attendance' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Attendance Records</h3>
              <p className="muted">Daily morning roll call and 30-day attendance consistency metrics.</p>
            </div>
          </div>

          <div className="results-summary-banner">
            <div className="results-stat-box">
              <span className="results-stat-num" style={{ color: 'var(--ac)' }}>{attendance?.rate}%</span>
              <span className="results-stat-lbl">Attendance Rate</span>
            </div>
            <div className="results-stat-box">
              <span className="results-stat-num">{attendance?.stats?.present}</span>
              <span className="results-stat-lbl">Days Present</span>
            </div>
            <div className="results-stat-box">
              <span className="results-stat-num">{attendance?.stats?.late}</span>
              <span className="results-stat-lbl">Days Late</span>
            </div>
            <div className="results-stat-box">
              <span className="results-stat-num">{attendance?.stats?.absent}</span>
              <span className="results-stat-lbl">Days Absent</span>
            </div>
          </div>

          {/* 30-day History Table */}
          <div className="tw" style={{ marginTop: 20 }}>
            <table className="rt">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Roll Call Note</th>
                </tr>
              </thead>
              <tbody>
                {attendance?.history?.slice(0, 15).map((att, idx) => (
                  <tr key={idx}>
                    <td data-l="Date">{att.date}</td>
                    <td data-l="Status">
                      <span className={`status-pill ${att.status === 'P' ? 'status-graded' : att.status === 'L' ? 'status-pending' : 'status-absent'}`}>
                        {att.status === 'P' ? '✓ Present' : att.status === 'L' ? 'Late' : 'Absent'}
                      </span>
                    </td>
                    <td data-l="Roll Call Note">
                      {att.status === 'P' ? 'Present on time for morning registration.' : 'Marked during class check.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 8: LIBRARY ── */}
      {activeSection === 'library' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>School Library & Resource Catalogue</h3>
              <p className="muted">Browse available textbooks, reference guides, and recommended reading for your subjects.</p>
            </div>
            <a href="/library" className="btn sm">
              Browse All Books
            </a>
          </div>

          <div className="student-assignments-grid">
            {library.map((book) => (
              <div key={book.id} className="student-assignment-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="bd g">{book.id}</span>
                  <span className="status-pill status-graded">
                    {book.copies - (book.issued || 0)} Available
                  </span>
                </div>
                <h4 className="student-assignment-title">{book.title}</h4>
                <div className="student-assignment-meta">
                  <span>Author: <strong>{book.author}</strong></span>
                  <span>Total Copies: {book.copies}</span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn sm pr"
                    onClick={() => setToast(`Reserved "${book.title}". Please collect from library desk.`)}
                  >
                    📖 Reserve Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 4. MODALS & INTERACTIVE FLOWS                                           */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}

      {/* Assignment Submit Modal */}
      {submitModal && (
        <Modal title={`Submit Work: ${submitModal.title}`} onClose={() => setSubmitModal(null)}>
          <form onSubmit={handleSubmitAssignment}>
            <div style={{ marginBottom: 14 }}>
              <span className="bd g">{submitModal.subject}</span>
              <p style={{ margin: '8px 0 0', fontSize: 14 }}>
                Due Date: <strong>{submitModal.due}</strong> · Class: {submitModal.cls}
              </p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
                Your Answer / Submission Notes:
              </label>
              <textarea
                className="input"
                rows={5}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder="Type your solution, answer notes, or paste links to your project repository / Google Drive here..."
                value={submissionText}
                onChange={e => setSubmissionText(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
                Simulate File Attachment (Optional):
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. algebra_assignment_dejenie.pdf"
                value={submissionFileName}
                onChange={e => setSubmissionFileName(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setSubmitModal(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn pr"
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : '✓ Confirm & Submit Work'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Lesson View Modal */}
      {activeLessonModal && (
        <Modal title={activeLessonModal.title} onClose={() => setActiveLessonModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="bd g">{activeLessonModal.subject}</span>
              <span className="muted">Duration: {activeLessonModal.duration_mins} mins</span>
            </div>

            <div className="lms-video-player-box" style={{ background: '#0f172a', borderRadius: 8, padding: 24, textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎬</div>
              <h4 style={{ margin: '0 0 6px', color: '#fff' }}>{activeLessonModal.title}</h4>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                Video Lecture Stream · Ready to Play
              </p>
            </div>

            <div>
              <h4 style={{ margin: '10px 0 6px' }}>Lesson Summary & Objectives</h4>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                In this unit, students master fundamental concepts with step-by-step worked examples,
                practical problem-solving techniques, and real-world applications.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setActiveLessonModal(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn pr"
                onClick={() => {
                  handleCompleteLesson(activeLessonModal.id);
                  setActiveLessonModal(null);
                }}
              >
                ✓ Mark Lesson Completed
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Official Verified Report Card Modal */}
      {reportCardModal && (
        <Modal title="Verified Academic Report Card" onClose={() => setReportCardModal(false)}>
          <div className="print-area" style={{ padding: 16 }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid var(--bd)', paddingBottom: 16, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{portal?.school?.school || 'ABC Academy'}</h2>
              <div className="muted" style={{ marginTop: 4 }}>
                Official Academic Performance Report · Academic Year {portal?.school?.year || '2026/27'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
              <div><strong>Student Name:</strong> {student?.name}</div>
              <div><strong>Student ID:</strong> {student?.id}</div>
              <div><strong>Class:</strong> {student?.cls}</div>
              <div><strong>Overall Average:</strong> {academics?.average}% ({academics?.overallGrade})</div>
              <div><strong>Attendance Rate:</strong> {attendance?.rate}%</div>
              <div><strong>Status:</strong> <span className="bd g">Promoted</span></div>
            </div>

            <table className="rt" style={{ width: '100%', marginBottom: 18 }}>
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Mark</th>
                  <th scope="col">Grade</th>
                  <th scope="col">GPA</th>
                  <th scope="col">Teacher Remarks</th>
                </tr>
              </thead>
              <tbody>
                {academics?.marks?.map(m => (
                  <tr key={m.subject}>
                    <td data-l="Subject"><strong>{m.subject}</strong></td>
                    <td data-l="Mark">{m.mark}/100</td>
                    <td data-l="Grade"><span className="bd g">{m.grade}</span></td>
                    <td data-l="GPA">{m.gpa.toFixed(2)}</td>
                    <td data-l="Teacher Remarks">{m.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--mut)' }}>
                Certified digitally by School Examination Board.
              </div>
              <button
                type="button"
                className="btn pr"
                onClick={() => window.print()}
              >
                🖨️ Print / Save PDF
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
