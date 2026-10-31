import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Empty, Modal, Skeleton, Toast } from '../components/index.js';

// The 8 quick access pills from the teacher image
const TEACHER_PILLS = [
  { id: 'classes', label: 'Classes', icon: 'classes' },
  { id: 'attendance', label: 'Attendance', icon: 'attendance' },
  { id: 'exams', label: 'Exams', icon: 'exams' },
  { id: 'addResult', label: 'Add Result', icon: 'addResult' },
  { id: 'lessons', label: 'Lessons', icon: 'lessons' },
  { id: 'announcement', label: 'Announcement', icon: 'announcement' },
  { id: 'timetable', label: 'Timetable', icon: 'timetable' },
  { id: 'topics', label: 'Topics', icon: 'topics' }
];

export default function TeacherApp() {
  const { user } = useAuth();
  const { money } = useSettings();

  // State
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  // Active section pill
  const [activeSection, setActiveSection] = useState('classes');

  // Selected class for class-specific operations
  const [selectedClass, setSelectedClass] = useState('7A');

  // Attendance recording state
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attendanceDraft, setAttendanceDraft] = useState({});
  const [attSaving, setAttSaving] = useState(false);

  // Grade exams / Add result state
  const [gradeDraft, setGradeDraft] = useState({}); // { studentId: { mark, comment } }
  const [gradeSaving, setGradeSaving] = useState(false);

  // Modals
  const [lessonModal, setLessonModal] = useState(false);
  const [topicModal, setTopicModal] = useState(false);
  const [assignmentModal, setAssignmentModal] = useState(false);
  const [messageModal, setMessageModal] = useState(null); // parent object to message
  const [announcementModal, setAnnouncementModal] = useState(false);

  // Form states for modals
  const [newLesson, setNewLesson] = useState({
    courseId: '',
    moduleId: '',
    title: '',
    durationMinutes: 25,
    videoUrl: '',
    content: ''
  });

  const [newTopic, setNewTopic] = useState({
    courseId: '',
    title: '',
    description: ''
  });

  const [newAssignment, setNewAssignment] = useState({
    title: '',
    subject: '',
    cls: '7A',
    due: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  });

  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    content: '',
    targetRole: 'All',
    cls: 'All'
  });

  const [msgDraft, setMsgDraft] = useState({
    subject: 'Academic Progress Update',
    body: '',
    meetingDate: ''
  });

  // Load teacher portal data
  const loadPortal = async () => {
    try {
      setLoading(true);
      const data = await api('/teacher-app/portal');
      setPortal(data);

      if (data.teacher?.classes?.length) {
        setSelectedClass(data.teacher.classes[0]);
      }

      // Initialize attendance draft
      if (data.attendance?.records) {
        setAttendanceDraft(data.attendance.records);
      }

      // Initialize grade draft
      if (data.marks?.length) {
        const gm = {};
        data.marks.forEach(m => {
          gm[m.student_id] = { mark: m.mark, comment: m.comments || '' };
        });
        setGradeDraft(gm);
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

  const teacher = portal?.teacher;
  const classes = teacher?.classes || ['7A', '8A', '8B'];
  const students = portal?.students || [];
  const classSummaries = portal?.classSummaries || [];
  const exams = portal?.exams || [];
  const assignments = portal?.assignments || [];
  const lmsCourses = portal?.lms || [];
  const messages = portal?.messages || [];
  const classParents = portal?.classParents || [];
  const timetable = portal?.timetable;
  const announcements = portal?.announcements || [];

  // Filter students for the selected class
  const classStudents = useMemo(() => {
    return students.filter(s => s.cls === selectedClass);
  }, [students, selectedClass]);

  // Handle Mark All Present shortcut
  const handleMarkAllPresent = () => {
    const updated = { ...attendanceDraft };
    classStudents.forEach(s => {
      updated[s.id] = 'P';
    });
    setAttendanceDraft(updated);
    setToast(`Marked all ${classStudents.length} students in ${selectedClass} as Present.`);
  };

  // Handle attendance status toggle
  const handleAttendanceChange = (studentId, status) => {
    setAttendanceDraft(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  // Save attendance batch
  const handleSaveAttendance = async () => {
    setAttSaving(true);
    try {
      const res = await api('/teacher-app/attendance', {
        method: 'PUT',
        body: {
          date: attendanceDate,
          records: attendanceDraft
        }
      });
      setToast(res.message || 'Attendance saved successfully.');
      loadPortal();
    } catch (e) {
      setToast(e.message);
    } finally {
      setAttSaving(false);
    }
  };

  // Save individual student mark
  const handleSaveMark = async (studentId, subject) => {
    const draft = gradeDraft[studentId] || { mark: 85, comment: '' };
    setGradeSaving(true);
    try {
      await api('/teacher-app/grade', {
        method: 'PUT',
        body: {
          studentId,
          subject,
          mark: Number(draft.mark),
          comment: draft.comment
        }
      });
      setToast(`Mark saved for student ${studentId}.`);
      loadPortal();
    } catch (e) {
      setToast(e.message);
    } finally {
      setGradeSaving(false);
    }
  };

  // Upload new lesson
  const handleCreateLesson = async (e) => {
    e.preventDefault();
    if (!newLesson.courseId || !newLesson.moduleId || !newLesson.title) {
      setToast('Please select course, module, and enter a lesson title.');
      return;
    }
    try {
      await api('/teacher-app/lesson', {
        method: 'POST',
        body: newLesson
      });
      setToast('Lesson uploaded and published to LMS successfully!');
      setLessonModal(false);
      setNewLesson({ courseId: '', moduleId: '', title: '', durationMinutes: 25, videoUrl: '', content: '' });
      loadPortal();
    } catch (e) {
      setToast(e.message);
    }
  };

  // Create new topic / module
  const handleCreateTopic = async (e) => {
    e.preventDefault();
    if (!newTopic.courseId || !newTopic.title) {
      setToast('Please select a course and enter topic title.');
      return;
    }
    try {
      await api('/teacher-app/topic', {
        method: 'POST',
        body: newTopic
      });
      setToast('Topic/Unit created successfully!');
      setTopicModal(false);
      setNewTopic({ courseId: '', title: '', description: '' });
      loadPortal();
    } catch (e) {
      setToast(e.message);
    }
  };

  // Send message to parent
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageModal || !msgDraft.body.trim()) return;

    try {
      await api('/teacher-app/message-parent', {
        method: 'POST',
        body: {
          parentId: messageModal.id,
          parentName: messageModal.name,
          subject: msgDraft.subject,
          body: msgDraft.body,
          meetingDate: msgDraft.meetingDate || null
        }
      });
      setToast(`Message sent directly to ${messageModal.name}.`);
      setMessageModal(null);
      setMsgDraft({ subject: 'Academic Progress Update', body: '', meetingDate: '' });
      loadPortal();
    } catch (e) {
      setToast(e.message);
    }
  };

  // Set new assignment
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!newAssignment.title) return;
    try {
      await api('/teacher-app/assignment', {
        method: 'POST',
        body: {
          ...newAssignment,
          subject: newAssignment.subject || teacher?.subject || 'Science'
        }
      });
      setToast(`Assignment "${newAssignment.title}" set for Class ${newAssignment.cls}.`);
      setAssignmentModal(false);
      loadPortal();
    } catch (e) {
      setToast(e.message);
    }
  };

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
        <Empty title="Could not load Teacher Portal" text={err} />
      </div>
    );
  }

  return (
    <div className="parent-app-container teacher-app-container">
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 0. PAGE HEADER & DATE                                                    */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <div className="parent-portal-header">
        <div>
          <h1 className="parent-portal-title">Teacher Portal</h1>
          <span className="parent-portal-date">{todayStr}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn sm pr"
            onClick={() => setLessonModal(true)}
          >
            + Upload Lesson
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => setAssignmentModal(true)}
          >
            + Set Assignment
          </button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 1. HERO & TAGLINE FROM ATTACHED IMAGE                                   */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <div className="parent-app-hero teacher-app-hero">
        <div className="parent-app-hero-top">
          <div className="parent-app-badge">
            <span className="live-dot" /> {teacher?.subject || 'Science'} Faculty · {teacher?.id}
          </div>
          <span className="parent-greeting">
            Welcome, <strong>{teacher?.name || user?.name || 'Ms. Alemu'}</strong>
          </span>
        </div>

        {/* Exact Headline from Teacher Image */}
        <p className="parent-app-tagline">
          Teachers mark attendance, set assignments, grade exams, upload lessons, and communicate with parents all from a single mobile app.
        </p>

        {/* ── Active Classes Quick Bar ── */}
        <div className="parent-children-bar">
          <span className="parent-label">Assigned Classes:</span>
          <div className="parent-children-list">
            {classSummaries.map((cs) => {
              const active = cs.cls === selectedClass;
              return (
                <button
                  key={cs.cls}
                  type="button"
                  className={`parent-child-chip ${active ? 'active' : ''}`}
                  onClick={() => setSelectedClass(cs.cls)}
                >
                  <span className="parent-child-avatar">{cs.cls}</span>
                  <div className="parent-child-meta">
                    <strong>Class {cs.cls}</strong>
                    <small>{cs.totalStudents} Students</small>
                  </div>
                  <span className={`parent-att-badge ${cs.rate >= 85 ? 'present' : 'other'}`}>
                    {cs.rate}% Present
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 2. THE 8 QUICK ACCESS PILLS (EXACT FROM ATTACHED IMAGE)                 */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      <div className="parent-pills-bar">
        {TEACHER_PILLS.map((pill) => {
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
            </button>
          );
        })}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 3. DEEP-DIVE PANELS FOR EACH PILL                                       */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}

      {/* ── TAB 1: CLASSES ROSTER & DIRECT PARENT CONTACT ── */}
      {activeSection === 'classes' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Class {selectedClass} Student Roster & Parent Directory</h3>
              <p className="muted">Directly message parents or view academic progress for your students.</p>
            </div>
            <div className="tabs" style={{ margin: 0 }}>
              {classes.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`btn sm ${selectedClass === c ? 'pr' : ''}`}
                  onClick={() => setSelectedClass(c)}
                >
                  Class {c}
                </button>
              ))}
            </div>
          </div>

          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th scope="col">Student ID</th>
                  <th scope="col">Student Name</th>
                  <th scope="col">Guardian / Parent</th>
                  <th scope="col">Parent Phone</th>
                  <th scope="col">Today Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {classStudents.map(s => {
                  const att = attendanceDraft[s.id] || 'P';
                  return (
                    <tr key={s.id}>
                      <td data-l="ID"><strong>{s.id}</strong></td>
                      <td data-l="Student Name">{s.name}</td>
                      <td data-l="Guardian">{s.guardianName || 'Parent / Guardian'}</td>
                      <td data-l="Phone">{s.guardianPhone || '—'}</td>
                      <td data-l="Status">
                        <span className={`status-pill ${att === 'P' ? 'status-graded' : att === 'L' ? 'status-pending' : 'status-absent'}`}>
                          {att === 'P' ? '✓ Present' : att === 'L' ? 'Late' : 'Absent'}
                        </span>
                      </td>
                      <td data-l="Actions">
                        <button
                          type="button"
                          className="btn xs pr"
                          onClick={() => {
                            setMessageModal({
                              id: s.guardian || 'P23',
                              name: s.guardianName || `Parent of ${s.name}`,
                              studentName: s.name
                            });
                          }}
                        >
                          💬 Message Parent
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: RECORD ATTENDANCE ── */}
      {activeSection === 'attendance' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Daily Roll Call & Attendance Register</h3>
              <p className="muted">Mark morning attendance for your class. Excused reports from parents appear automatically.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="date"
                className="input"
                value={attendanceDate}
                onChange={e => setAttendanceDate(e.target.value)}
              />
              <button
                type="button"
                className="btn sm"
                onClick={handleMarkAllPresent}
              >
                ✓ All Present
              </button>
              <button
                type="button"
                className="btn sm pr"
                disabled={attSaving}
                onClick={handleSaveAttendance}
              >
                {attSaving ? 'Saving...' : '💾 Save Register'}
              </button>
            </div>
          </div>

          <div className="tw" style={{ marginTop: 14 }}>
            <table className="rt">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Attendance Status</th>
                  <th scope="col">Parent Absence Notice</th>
                </tr>
              </thead>
              <tbody>
                {classStudents.map(s => {
                  const currentSt = attendanceDraft[s.id] || 'P';
                  const absenceReport = portal?.attendance?.reportedAbsences?.[s.id];

                  return (
                    <tr key={s.id}>
                      <td data-l="Student">
                        <strong>{s.name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--mut)' }}>ID: {s.id} · Class {s.cls}</div>
                      </td>
                      <td data-l="Status">
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[
                            { key: 'P', label: 'Present', color: 'green' },
                            { key: 'L', label: 'Late', color: 'orange' },
                            { key: 'A', label: 'Absent', color: 'red' },
                            { key: 'E', label: 'Excused', color: 'blue' }
                          ].map(opt => (
                            <button
                              key={opt.key}
                              type="button"
                              className={`btn xs ${currentSt === opt.key ? 'pr' : ''}`}
                              onClick={() => handleAttendanceChange(s.id, opt.key)}
                            >
                              {opt.key} - {opt.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td data-l="Notice">
                        {absenceReport ? (
                          <span className="bd y" style={{ fontSize: 11 }}>
                            ⚠️ Parent Note: {absenceReport.reason}
                          </span>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>None reported</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: SCHEDULED EXAMS ── */}
      {activeSection === 'exams' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Scheduled Examinations & Assessments</h3>
              <p className="muted">Exams set for your classes. Click to open grading sheets.</p>
            </div>
            <button
              type="button"
              className="btn sm pr"
              onClick={() => setActiveSection('addResult')}
            >
              📝 Grade Students Now
            </button>
          </div>

          <div className="student-exams-grid">
            {exams.map(ex => (
              <div key={ex.id} className="student-exam-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="bd g">Class {ex.cls}</span>
                  <span className="status-pill status-pending">{ex.status}</span>
                </div>
                <h4 style={{ margin: '10px 0 4px', fontSize: '1.15rem' }}>{ex.name}</h4>
                <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 12 }}>
                  <span>📅 Date: <strong>{ex.date}</strong></span>
                </div>
                <div className="exam-syllabus-box">
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Curriculum Evaluation:</span>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--tx)' }}>
                    Standardized Assessment for {teacher?.subject || 'Science'}.
                  </p>
                </div>
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn sm pr"
                    onClick={() => {
                      setSelectedClass(ex.cls === 'All' ? '7A' : ex.cls);
                      setActiveSection('addResult');
                    }}
                  >
                    Enter Marks →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: ADD RESULT / GRADE EXAMS ── */}
      {activeSection === 'addResult' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Grade Exams & Enter Subject Marks: {teacher?.subject || 'Science'}</h3>
              <p className="muted">Evaluate continuous assessment and term exam marks for Class {selectedClass}.</p>
            </div>
            <div className="tabs" style={{ margin: 0 }}>
              {classes.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`btn sm ${selectedClass === c ? 'pr' : ''}`}
                  onClick={() => setSelectedClass(c)}
                >
                  Class {c}
                </button>
              ))}
            </div>
          </div>

          <div className="tw" style={{ marginTop: 14 }}>
            <table className="rt">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col" style={{ width: 120 }}>Score (0-100)</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Teacher Remarks</th>
                  <th scope="col" style={{ width: 110 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {classStudents.map(s => {
                  const draft = gradeDraft[s.id] || { mark: 85, comment: '' };
                  const numMark = Number(draft.mark) || 0;
                  const gradeLetter = numMark >= 90 ? 'A+' : (numMark >= 80 ? 'A' : (numMark >= 70 ? 'B' : (numMark >= 60 ? 'C' : 'D')));

                  return (
                    <tr key={s.id}>
                      <td data-l="Student">
                        <strong>{s.name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--mut)' }}>ID: {s.id}</div>
                      </td>
                      <td data-l="Score">
                        <input
                          type="number"
                          className="input"
                          min="0"
                          max="100"
                          style={{ width: '90px' }}
                          value={draft.mark}
                          onChange={e => {
                            const val = e.target.value;
                            setGradeDraft(prev => ({
                              ...prev,
                              [s.id]: { ...(prev[s.id] || {}), mark: val }
                            }));
                          }}
                        />
                      </td>
                      <td data-l="Grade">
                        <span className={`grade-badge grade-${gradeLetter.charAt(0)}`}>
                          {gradeLetter}
                        </span>
                      </td>
                      <td data-l="Remarks">
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Excellent problem solving skills"
                          style={{ width: '100%' }}
                          value={draft.comment || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setGradeDraft(prev => ({
                              ...prev,
                              [s.id]: { ...(prev[s.id] || {}), comment: val }
                            }));
                          }}
                        />
                      </td>
                      <td data-l="Action">
                        <button
                          type="button"
                          className="btn sm pr"
                          disabled={gradeSaving}
                          onClick={() => handleSaveMark(s.id, teacher?.subject || 'Science')}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 5: LESSONS (LMS) ── */}
      {activeSection === 'lessons' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>e-Learning Courses & Published Lessons</h3>
              <p className="muted">Upload video lectures, worksheets, and lecture notes directly to student portals.</p>
            </div>
            <button
              type="button"
              className="btn pr"
              onClick={() => setLessonModal(true)}
            >
              + Upload Lesson Material
            </button>
          </div>

          <div className="lms-courses-list-grid">
            {lmsCourses.map(crs => (
              <div key={crs.id} className="lms-course-item-card">
                <div className="lms-course-top">
                  <div>
                    <span className="bd g">{crs.cls} · {crs.subject}</span>
                    <h4 style={{ margin: '6px 0 0', fontSize: '1.15rem' }}>{crs.title}</h4>
                  </div>
                  <span className="bd y">{crs.status}</span>
                </div>

                <div className="lms-recent-lessons" style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Course Units & Lessons:</span>
                    <button
                      type="button"
                      className="btn xs"
                      onClick={() => {
                        setNewLesson(prev => ({ ...prev, courseId: crs.id }));
                        setLessonModal(true);
                      }}
                    >
                      + Add Lesson
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {crs.modules?.map(m => (
                      <div key={m.id} style={{ borderBottom: '1px solid var(--bd)', paddingBottom: 8 }}>
                        <strong style={{ fontSize: 13 }}>📌 {m.title}</strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, paddingLeft: 12 }}>
                          {m.lessons?.length ? (
                            m.lessons.map(l => (
                              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                <span>▶ {l.title}</span>
                                <small className="muted">{l.duration_minutes}m</small>
                              </div>
                            ))
                          ) : (
                            <small className="muted">No lessons uploaded yet in this unit.</small>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <a href={`/lms/courses/${crs.id}`} className="btn sm pr" style={{ flex: 1, textAlign: 'center' }}>
                    Open in Full LMS →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 6: ANNOUNCEMENT ── */}
      {activeSection === 'announcement' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Announcements & Class Notices</h3>
              <p className="muted">Broadcast reminders and updates to students and parents.</p>
            </div>
            <button
              type="button"
              className="btn pr"
              onClick={() => setAnnouncementModal(true)}
            >
              + Post Announcement
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {announcements.map(ann => (
              <div key={ann.id} className="parent-announcement-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span className="bd g" style={{ marginRight: 8 }}>Target: {ann.cls || 'All Classes'}</span>
                    <strong style={{ fontSize: '1.05rem' }}>{ann.title}</strong>
                  </div>
                  <small className="muted">{new Date(ann.created_at).toLocaleDateString()}</small>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
                  {ann.content}
                </p>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--mut)' }}>
                  Posted by: {ann.author_name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 7: TIMETABLE ── */}
      {activeSection === 'timetable' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Teaching Timetable & Schedule — {teacher?.name || 'Ms. Alemu'}</h3>
              <p className="muted">Weekly schedule of periods, teaching classes, and assigned room locations.</p>
            </div>
          </div>

          <div className="tw" style={{ marginTop: 14 }}>
            <table className="rt timetable-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 140 }}>Period / Time</th>
                  {timetable?.days?.map(d => (
                    <th key={d} scope="col">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timetable?.periods?.map((row, rIdx) => (
                  <tr key={rIdx} className={row.isBreak ? 'break-row' : ''}>
                    <td data-l="Period">
                      <strong>{row.period}</strong>
                      <div style={{ fontSize: 11, color: 'var(--mut)' }}>{row.time}</div>
                    </td>
                    {row.slots.map((cell, cIdx) => (
                      <td key={cIdx} data-l={cell.day} className={row.isBreak ? 'break-cell' : ''}>
                        {row.isBreak ? (
                          <span className="break-label">{cell.subject}</span>
                        ) : (
                          <div className="cell-content">
                            <span className="bd g">Class {cell.cls}</span>
                            <strong>{cell.subject}</strong>
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
        </div>
      )}

      {/* ── TAB 8: TOPICS & CURRICULUM UNITS ── */}
      {activeSection === 'topics' && (
        <div className="parent-detail-card">
          <div className="parent-card-header">
            <div>
              <h3>Curriculum Topics & Units</h3>
              <p className="muted">Structure course chapters and manage sequential learning modules.</p>
            </div>
            <button
              type="button"
              className="btn pr"
              onClick={() => setTopicModal(true)}
            >
              + Create New Unit / Topic
            </button>
          </div>

          <div className="student-assignments-grid">
            {lmsCourses.flatMap(crs => (crs.modules || []).map(m => ({ ...m, courseTitle: crs.title, courseCls: crs.cls }))).map(topic => (
              <div key={topic.id} className="student-assignment-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="bd g">{topic.courseCls}</span>
                  <span className="status-pill status-graded">
                    {topic.lessons?.length || 0} Lessons
                  </span>
                </div>
                <h4 className="student-assignment-title" style={{ marginTop: 8 }}>{topic.title}</h4>
                <p style={{ fontSize: 13, color: 'var(--mut)', margin: '4px 0 12px' }}>
                  Course: <strong>{topic.courseTitle}</strong>
                </p>
                {topic.description && (
                  <p style={{ fontSize: 13, color: 'var(--tx)', margin: '0 0 12px' }}>
                    {topic.description}
                  </p>
                )}
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn sm pr"
                    onClick={() => {
                      setNewLesson(prev => ({ ...prev, courseId: topic.course_id, moduleId: topic.id }));
                      setLessonModal(true);
                    }}
                  >
                    + Add Lesson to Unit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* 4. MODALS (Upload Lesson, Topic, Assignment, Message Parent)            */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}

      {/* Upload Lesson Modal */}
      {lessonModal && (
        <Modal title="Upload Course Lesson" onClose={() => setLessonModal(false)}>
          <form onSubmit={handleCreateLesson}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Select Course:</label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={newLesson.courseId}
                  onChange={e => setNewLesson(prev => ({ ...prev, courseId: e.target.value }))}
                  required
                >
                  <option value="">-- Choose Course --</option>
                  {lmsCourses.map(c => (
                    <option key={c.id} value={c.id}>{c.title} ({c.cls})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Select Topic / Module:</label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={newLesson.moduleId}
                  onChange={e => setNewLesson(prev => ({ ...prev, moduleId: e.target.value }))}
                  required
                >
                  <option value="">-- Choose Module --</option>
                  {lmsCourses.find(c => c.id === newLesson.courseId)?.modules?.map(m => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Lesson Title:</label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Newton's Laws of Motion: Practical Experiments"
                value={newLesson.title}
                onChange={e => setNewLesson(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Duration (Minutes):</label>
                <input
                  type="number"
                  className="input"
                  style={{ width: '100%' }}
                  value={newLesson.durationMinutes}
                  onChange={e => setNewLesson(prev => ({ ...prev, durationMinutes: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Video Lecture URL:</label>
                <input
                  type="text"
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="https://youtube.com/watch?v=..."
                  value={newLesson.videoUrl}
                  onChange={e => setNewLesson(prev => ({ ...prev, videoUrl: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Lecture Notes & Summary:</label>
              <textarea
                className="input"
                rows={4}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder="Enter core principles, formulas, and homework instructions for students..."
                value={newLesson.content}
                onChange={e => setNewLesson(prev => ({ ...prev, content: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn" onClick={() => setLessonModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn pr">
                ✓ Upload & Publish Lesson
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create Topic Modal */}
      {topicModal && (
        <Modal title="Create New Course Topic / Unit" onClose={() => setTopicModal(false)}>
          <form onSubmit={handleCreateTopic}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Select Course:</label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={newTopic.courseId}
                onChange={e => setNewTopic(prev => ({ ...prev, courseId: e.target.value }))}
                required
              >
                <option value="">-- Choose Course --</option>
                {lmsCourses.map(c => (
                  <option key={c.id} value={c.id}>{c.title} ({c.cls})</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Unit / Topic Title:</label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Unit 3: Chemical Reactions and Compounds"
                value={newTopic.title}
                onChange={e => setNewTopic(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Description & Learning Goals:</label>
              <textarea
                className="input"
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder="Unit goals, key terms, and evaluation criteria..."
                value={newTopic.description}
                onChange={e => setNewTopic(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn" onClick={() => setTopicModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn pr">
                ✓ Save Unit Topic
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Message Parent Modal */}
      {messageModal && (
        <Modal title={`Message Parent: ${messageModal.name}`} onClose={() => setMessageModal(null)}>
          <form onSubmit={handleSendMessage}>
            <div style={{ marginBottom: 12 }}>
              <span className="bd g">Regarding: {messageModal.studentName}</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Subject:</label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={msgDraft.subject}
                onChange={e => setMsgDraft(prev => ({ ...prev, subject: e.target.value }))}
                required
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
                Propose Meeting Consultation Date (Optional):
              </label>
              <input
                type="date"
                className="input"
                style={{ width: '100%' }}
                value={msgDraft.meetingDate}
                onChange={e => setMsgDraft(prev => ({ ...prev, meetingDate: e.target.value }))}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Message to Parent:</label>
              <textarea
                className="input"
                rows={4}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder="Write your note regarding homework, classroom engagement, or consultation availability..."
                value={msgDraft.body}
                onChange={e => setMsgDraft(prev => ({ ...prev, body: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn" onClick={() => setMessageModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn pr">
                📤 Send Message to Parent
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Set Assignment Modal */}
      {assignmentModal && (
        <Modal title="Set New Homework Assignment" onClose={() => setAssignmentModal(false)}>
          <form onSubmit={handleCreateAssignment}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Assignment Title:</label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Chapter 4 Exercises: Photosynthesis Laboratory Report"
                value={newAssignment.title}
                onChange={e => setNewAssignment(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Class:</label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={newAssignment.cls}
                  onChange={e => setNewAssignment(prev => ({ ...prev, cls: e.target.value }))}
                >
                  {classes.map(c => (
                    <option key={c} value={c}>Class {c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Due Date:</label>
                <input
                  type="date"
                  className="input"
                  style={{ width: '100%' }}
                  value={newAssignment.due}
                  onChange={e => setNewAssignment(prev => ({ ...prev, due: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn" onClick={() => setAssignmentModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn pr">
                ✓ Publish Assignment
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
