import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Empty, Modal, ConfirmModal, Skeleton, Toast } from '../components/index.js';

const SUBJECTS = ['All', 'Mathematics', 'English', 'Science', 'History', 'Geography', 'ICT'];
const CLASSES = ['All', '7A', '7B', '8A', '8B', '9A', '9B'];
const GRADIENTS = ['gradient-teal', 'gradient-blue', 'gradient-purple', 'gradient-amber', 'gradient-rose', 'gradient-emerald'];

export default function Lms() {
  const { user, can } = useAuth();
  const write = can('lms') || user?.role === 'admin' || user?.role === 'teacher';
  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent';

  // State
  const [courses, setCourses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [subFilter, setSubFilter] = useState('All');
  const [clsFilter, setClsFilter] = useState('All');

  // Active course & navigation
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [courseDetail, setCourseDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('curriculum'); // 'curriculum' | 'classroom' | 'quizzes' | 'materials' | 'discussions' | 'gradebook'
  const [activeLesson, setActiveLesson] = useState(null);

  // Modals
  const [courseModal, setCourseModal] = useState(false);
  const [moduleModal, setModuleModal] = useState(false);
  const [lessonModal, setLessonModal] = useState(false);
  const [quizModal, setQuizModal] = useState(false);
  const [quizRunner, setQuizRunner] = useState(null); // active quiz for student
  const [materialModal, setMaterialModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Discussion state
  const [discMessage, setDiscMessage] = useState('');
  const [discBusy, setDiscBusy] = useState(false);

  // Quiz runner state
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);

  // Load courses and stats
  const loadData = async () => {
    try {
      setLoading(true);
      const [crsData, statsData] = await Promise.all([
        api('/lms/courses'),
        api('/lms/stats').catch(() => null)
      ]);
      setCourses(crsData || []);
      setStats(statsData);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Load single course details when selected
  const loadCourseDetail = async (id) => {
    try {
      const data = await api(`/lms/courses/${id}`);
      setCourseDetail(data);
      // Auto-select first lesson if none selected
      const allLessons = [];
      data.modules?.forEach(m => m.lessons?.forEach(l => allLessons.push(l)));
      if (allLessons.length && !activeLesson) {
        // Pick first uncompleted lesson, or the first lesson
        const nextUnfinished = allLessons.find(l => !l.completed) || allLessons[0];
        setActiveLesson(nextUnfinished);
      }
    } catch (e) {
      setToast(e.message);
    }
  };

  useEffect(() => {
    if (activeCourseId) {
      loadCourseDetail(activeCourseId);
    } else {
      setCourseDetail(null);
      setActiveLesson(null);
    }
  }, [activeCourseId]);

  // Toggle lesson completion
  const handleToggleLessonProgress = async (lessonId, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      await api(`/lms/lessons/${lessonId}/progress`, {
        method: 'POST',
        body: { completed: newStatus }
      });
      // Refresh course detail & courses list to reflect updated %
      if (activeCourseId) {
        loadCourseDetail(activeCourseId);
      }
      loadData();
      setToast(newStatus ? 'Lesson marked as completed! 🎉' : 'Lesson marked as incomplete.');
    } catch (e) {
      setToast(e.message);
    }
  };

  // Submit discussion message
  const handleSendDiscussion = async (e) => {
    e.preventDefault();
    if (!discMessage.trim() || !activeCourseId) return;
    setDiscBusy(true);
    try {
      await api('/lms/discussions', {
        method: 'POST',
        body: {
          courseId: activeCourseId,
          lessonId: activeLesson?.id || null,
          message: discMessage.trim()
        }
      });
      setDiscMessage('');
      loadCourseDetail(activeCourseId);
    } catch (e) {
      setToast(e.message);
    } finally {
      setDiscBusy(false);
    }
  };

  // Start quiz in runner
  const handleStartQuiz = (quiz) => {
    setQuizRunner(quiz);
    setQuizAnswers({});
    setQuizResult(null);
  };

  // Submit quiz attempt
  const handleSubmitQuiz = async () => {
    if (!quizRunner) return;
    const questions = quizRunner.questions || [];
    const formattedAnswers = questions.map((_, idx) => quizAnswers[idx] !== undefined ? quizAnswers[idx] : null);

    setQuizSubmitting(true);
    try {
      const res = await api(`/lms/quizzes/${quizRunner.id}/attempt`, {
        method: 'POST',
        body: { answers: formattedAnswers }
      });
      setQuizResult(res);
      // Reload course detail to update bestScore & hasPassed
      if (activeCourseId) loadCourseDetail(activeCourseId);
      loadData();
    } catch (e) {
      setToast(e.message);
    } finally {
      setQuizSubmitting(false);
    }
  };

  // Filtered courses
  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      const matchSearch = !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.subject.toLowerCase().includes(search.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(search.toLowerCase());
      const matchSub = subFilter === 'All' || c.subject === subFilter;
      const matchCls = clsFilter === 'All' || c.cls === clsFilter || c.cls === 'All';
      return matchSearch && matchSub && matchCls;
    });
  }, [courses, search, subFilter, clsFilter]);

  if (loading && !courses.length) {
    return (
      <div className="lms-container">
        <Skeleton />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. SINGLE COURSE CLASSROOM & DETAIL VIEW
  // ════════════════════════════════════════════════════════════════════════════
  if (activeCourseId && courseDetail) {
    const allCourseLessons = [];
    courseDetail.modules?.forEach(m => m.lessons?.forEach(l => allCourseLessons.push(l)));
    const currentLessonIdx = allCourseLessons.findIndex(l => l.id === activeLesson?.id);
    const prevLesson = currentLessonIdx > 0 ? allCourseLessons[currentLessonIdx - 1] : null;
    const nextLesson = currentLessonIdx >= 0 && currentLessonIdx < allCourseLessons.length - 1 ? allCourseLessons[currentLessonIdx + 1] : null;

    return (
      <div className="lms-container">
        {toast && <Toast msg={toast} onClose={() => setToast('')} />}

        {/* Course Hero Banner */}
        <div className="lms-hero">
          <div className={`lms-hero-banner ${courseDetail.thumbnail || 'gradient-teal'}`}>
            <div className="lms-hero-top">
              <button
                type="button"
                className="lms-back-btn"
                onClick={() => setActiveCourseId(null)}
              >
                ← Back to Courses
              </button>
              <div className="lms-badge-group">
                <span className="lms-pill">{courseDetail.subject}</span>
                <span className="lms-pill">Class: {courseDetail.cls}</span>
                <span className="lms-pill">{courseDetail.status || 'Published'}</span>
              </div>
            </div>

            <h1 className="lms-hero-title">{courseDetail.title}</h1>

            <div className="lms-hero-meta">
              <span>👤 Instructor: <strong>{courseDetail.teacher_name || 'Assigned Faculty'}</strong></span>
              <span>📚 {courseDetail.modules?.length || 0} Modules</span>
              <span>📖 {allCourseLessons.length} Lessons</span>
              {isStudent && courseDetail.progressPercentage !== undefined && (
                <span>🏆 Progress: <strong>{courseDetail.progressPercentage}%</strong> ({courseDetail.completedLessons}/{courseDetail.totalLessons})</span>
              )}
            </div>

            {isStudent && (
              <div className="lms-progress-wrap" style={{ maxWidth: 450, marginTop: 4 }}>
                <div className="lms-progress-track" style={{ height: 10 }}>
                  <div
                    className="lms-progress-fill"
                    style={{ width: `${courseDetail.progressPercentage || 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Navigation Tabs */}
          <nav className="lms-tab-nav" aria-label="Course Sections">
            <button
              type="button"
              className={`lms-tab-btn ${activeTab === 'curriculum' ? 'active' : ''}`}
              onClick={() => setActiveTab('curriculum')}
            >
              📑 Curriculum & Lessons
            </button>
            <button
              type="button"
              className={`lms-tab-btn ${activeTab === 'classroom' ? 'active' : ''}`}
              onClick={() => setActiveTab('classroom')}
            >
              🎥 Lesson Classroom
            </button>
            <button
              type="button"
              className={`lms-tab-btn ${activeTab === 'quizzes' ? 'active' : ''}`}
              onClick={() => setActiveTab('quizzes')}
            >
              📝 Quizzes & Tests ({courseDetail.quizzes?.length || 0})
            </button>
            <button
              type="button"
              className={`lms-tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
              onClick={() => setActiveTab('materials')}
            >
              📂 Documents & Resources ({courseDetail.materials?.length || 0})
            </button>
            <button
              type="button"
              className={`lms-tab-btn ${activeTab === 'discussions' ? 'active' : ''}`}
              onClick={() => setActiveTab('discussions')}
            >
              💬 Q&A & Discussions ({courseDetail.discussions?.length || 0})
            </button>
            {(user?.role === 'admin' || user?.role === 'teacher') && (
              <button
                type="button"
                className={`lms-tab-btn ${activeTab === 'gradebook' ? 'active' : ''}`}
                onClick={() => setActiveTab('gradebook')}
              >
                📊 Class Progress & Gradebook
              </button>
            )}
          </nav>

          {/* Tab Content */}
          <div className="lms-tab-content">
            {/* ── Tab 1: Curriculum ── */}
            {activeTab === 'curriculum' && (
              <div className="lms-curriculum">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Course Modules & Units</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--mu)', fontSize: '0.9rem' }}>
                      Click on any lesson to launch into the Interactive Lesson Classroom.
                    </p>
                  </div>
                  {write && (
                    <button
                      type="button"
                      className="btn pr"
                      onClick={() => setModuleModal(true)}
                    >
                      + Add Module
                    </button>
                  )}
                </div>

                {!courseDetail.modules?.length ? (
                  <Empty title="No curriculum modules yet" text="Add your first module or unit to get started." />
                ) : (
                  courseDetail.modules.map((mod, modIdx) => (
                    <div className="lms-module" key={mod.id}>
                      <div className="lms-module-header">
                        <div>
                          <h3 className="lms-module-title">
                            <span>Unit {modIdx + 1}: {mod.title}</span>
                          </h3>
                          {mod.description && (
                            <div className="lms-module-desc">{mod.description}</div>
                          )}
                        </div>
                        {write && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLessonModal(mod.id);
                              }}
                            >
                              + Lesson
                            </button>
                            <button
                              type="button"
                              className="btn sm dg"
                              title="Delete module"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete({ type: 'module', id: mod.id, name: mod.title });
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="lms-lesson-list">
                        {!mod.lessons?.length ? (
                          <div style={{ padding: '14px 18px', color: 'var(--mu)', fontSize: '0.88rem' }}>
                            No lessons added to this unit yet.
                          </div>
                        ) : (
                          mod.lessons.map((les) => (
                            <div className="lms-lesson-row" key={les.id}>
                              <div
                                className="lms-lesson-left"
                                onClick={() => {
                                  setActiveLesson(les);
                                  setActiveTab('classroom');
                                }}
                              >
                                {isStudent && (
                                  <button
                                    type="button"
                                    className={`lms-lesson-check ${les.completed ? 'done' : ''}`}
                                    title={les.completed ? 'Completed' : 'Mark as completed'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleLessonProgress(les.id, les.completed);
                                    }}
                                  >
                                    {les.completed ? '✓' : ''}
                                  </button>
                                )}
                                <div>
                                  <div className="lms-lesson-title">
                                    {les.title}
                                  </div>
                                  <div className="lms-lesson-meta">
                                    <span>⏱️ {les.duration_minutes || 20} mins</span>
                                    {les.video_url && <span>🎥 Video Lecture</span>}
                                    {les.resources?.length > 0 && <span>📎 {les.resources.length} Attachments</span>}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="btn sm pr"
                                  onClick={() => {
                                    setActiveLesson(les);
                                    setActiveTab('classroom');
                                  }}
                                >
                                  Open Lesson ➔
                                </button>
                                {write && (
                                  <button
                                    type="button"
                                    className="btn sm dg"
                                    onClick={() => setConfirmDelete({ type: 'lesson', id: les.id, name: les.title })}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Tab 2: Interactive Lesson Classroom / Player ── */}
            {activeTab === 'classroom' && (
              <div className="lms-player-container">
                {!activeLesson ? (
                  <Empty title="Select a lesson" text="Choose a lesson from the curriculum to begin studying." />
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h2 style={{ fontSize: '1.35rem', margin: 0 }}>{activeLesson.title}</h2>
                        <span style={{ fontSize: '0.85rem', color: 'var(--mu)' }}>
                          Estimated study duration: {activeLesson.duration_minutes || 20} minutes
                        </span>
                      </div>
                      {isStudent && (
                        <button
                          type="button"
                          className={`btn ${activeLesson.completed ? '' : 'pr'}`}
                          onClick={() => handleToggleLessonProgress(activeLesson.id, activeLesson.completed)}
                        >
                          {activeLesson.completed ? '✓ Completed (Click to undo)' : 'Mark as Completed ✓'}
                        </button>
                      )}
                    </div>

                    {/* Video Embed Player */}
                    {activeLesson.video_url && (
                      <div className="lms-video-box">
                        {activeLesson.video_url.includes('youtube.com') || activeLesson.video_url.includes('youtu.be') ? (
                          <iframe
                            src={`https://www.youtube.com/embed/${activeLesson.video_url.split('v=')[1]?.split('&')[0] || activeLesson.video_url.split('/').pop()}`}
                            title={activeLesson.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : (
                          <div style={{ color: '#fff', display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                            <span style={{ fontSize: '2rem' }}>🎥</span>
                            <span>Video Resource: <a href={activeLesson.video_url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>{activeLesson.video_url}</a></span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lecture Notes & Reading */}
                    <div className="lms-notes-card">
                      <h3 style={{ borderBottom: '1px solid var(--bd)', paddingBottom: 10, marginTop: 0 }}>
                        📖 Lecture Notes & Core Concepts
                      </h3>
                      <div
                        className="lms-notes-body"
                        dangerouslySetInnerHTML={{
                          __html: (activeLesson.content || 'No lecture notes provided yet for this lesson.')
                            .replace(/\n\n/g, '<br/><br/>')
                            .replace(/### (.*)/g, '<h3>$1</h3>')
                            .replace(/#### (.*)/g, '<h4>$1</h4>')
                            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                        }}
                      />

                      {/* Downloadable lesson attachments */}
                      {activeLesson.resources?.length > 0 && (
                        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--bd)' }}>
                          <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>📎 Lesson Attachments & Handouts</h4>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {activeLesson.resources.map((res, i) => (
                              <a
                                key={i}
                                href={res.url || '#'}
                                className="btn sm"
                                download
                                onClick={(e) => {
                                  if (res.url === '#' || !res.url) {
                                    e.preventDefault();
                                    setToast('Download resource simulated successfully!');
                                  }
                                }}
                              >
                                📄 {res.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Lesson Bottom Navigation */}
                    <div className="lms-lesson-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={!prevLesson}
                        onClick={() => prevLesson && setActiveLesson(prevLesson)}
                      >
                        ← Previous: {prevLesson?.title || 'None'}
                      </button>

                      <button
                        type="button"
                        className="btn pr"
                        disabled={!nextLesson}
                        onClick={() => nextLesson && setActiveLesson(nextLesson)}
                      >
                        Next Lesson: {nextLesson?.title || 'End of Course'} →
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Tab 3: Quizzes & Knowledge Checks ── */}
            {activeTab === 'quizzes' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Assessments & Quizzes</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--mu)', fontSize: '0.9rem' }}>
                      Self-assessment knowledge checks with immediate grading and explanations.
                    </p>
                  </div>
                  {write && (
                    <button
                      type="button"
                      className="btn pr"
                      onClick={() => setQuizModal(true)}
                    >
                      + Create Quiz
                    </button>
                  )}
                </div>

                {!courseDetail.quizzes?.length ? (
                  <Empty title="No quizzes yet" text="Quizzes and practice assessments will appear here." />
                ) : (
                  courseDetail.quizzes.map((quiz) => (
                    <div className="lms-quiz-card" key={quiz.id}>
                      <div className="lms-quiz-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{quiz.title}</h3>
                          {quiz.bestScore !== null && quiz.bestScore !== undefined && (
                            <Badge v={quiz.hasPassed ? 'Passed' : 'Attempted'} />
                          )}
                        </div>
                        <p style={{ margin: '4px 0', color: 'var(--mu)', fontSize: '0.88rem' }}>
                          {quiz.description || 'Standard topic knowledge check.'}
                        </p>
                        <div style={{ display: 'flex', gap: 14, fontSize: '0.82rem', color: 'var(--mu)', marginTop: 4 }}>
                          <span>⏱️ {quiz.time_limit_minutes || 15} mins</span>
                          <span>🎯 Passing Score: {quiz.passing_score || 70}%</span>
                          <span>❓ {quiz.question_count || quiz.questions?.length || 0} Questions</span>
                          {quiz.bestScore !== null && quiz.bestScore !== undefined && (
                            <span>🏆 Your High Score: <strong>{quiz.bestScore}%</strong></span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn pr"
                          onClick={() => handleStartQuiz(quiz)}
                        >
                          {quiz.attemptCount > 0 ? 'Retake Quiz' : 'Start Quiz 🚀'}
                        </button>
                        {write && (
                          <button
                            type="button"
                            className="btn sm dg"
                            onClick={() => setConfirmDelete({ type: 'quiz', id: quiz.id, name: quiz.title })}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Tab 4: Materials & Reference Documents ── */}
            {activeTab === 'materials' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Course Documents & Reference Library</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--mu)', fontSize: '0.9rem' }}>
                      Downloadable syllabi, textbooks, cheat sheets, and homework exercise files.
                    </p>
                  </div>
                  {write && (
                    <button
                      type="button"
                      className="btn pr"
                      onClick={() => setMaterialModal(true)}
                    >
                      + Add Material
                    </button>
                  )}
                </div>

                {!courseDetail.materials?.length ? (
                  <Empty title="No materials uploaded" text="Upload course materials, reading lists, or syllabi." />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                    {courseDetail.materials.map((mat) => (
                      <div
                        key={mat.id}
                        style={{
                          background: 'var(--sf)',
                          border: '1px solid var(--bd)',
                          borderRadius: 10,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: '1.6rem' }}>
                            {mat.file_type === 'PDF' ? '📕' : mat.file_type === 'Slides' ? '📊' : '📄'}
                          </span>
                          <span className="lms-pill" style={{ background: 'var(--hv)', color: 'var(--tx)' }}>
                            {mat.file_type || 'Document'}
                          </span>
                        </div>
                        <strong style={{ fontSize: '0.98rem' }}>{mat.title}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--mu)' }}>
                          Size: {mat.file_size || '1.0 MB'} · Added {new Date(mat.uploaded_at).toLocaleDateString()}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
                          <a
                            href={mat.file_url || '#'}
                            className="btn sm pr"
                            style={{ flex: 1, textAlign: 'center' }}
                            onClick={(e) => {
                              if (mat.file_url === '#' || !mat.file_url) {
                                e.preventDefault();
                                setToast(`Downloaded ${mat.title} successfully!`);
                              }
                            }}
                          >
                            ⬇ Download
                          </a>
                          {write && (
                            <button
                              type="button"
                              className="btn sm dg"
                              onClick={() => setConfirmDelete({ type: 'material', id: mat.id, name: mat.title })}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 5: Discussions & Q&A Forum ── */}
            {activeTab === 'discussions' && (
              <div>
                <h2 style={{ fontSize: '1.2rem', margin: '0 0 4px' }}>Course Q&A & Discussion Forum</h2>
                <p style={{ margin: '0 0 16px', color: 'var(--mu)', fontSize: '0.9rem' }}>
                  Ask questions, collaborate on assignments, and clarify questions with your teacher and classmates.
                </p>

                <div className="lms-disc-thread">
                  {!courseDetail.discussions?.length ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--mu)' }}>
                      No questions asked yet. Be the first to start a conversation!
                    </div>
                  ) : (
                    courseDetail.discussions.map((msg) => (
                      <div className="lms-disc-msg" key={msg.id}>
                        <div className="lms-disc-msg-header">
                          <span className="lms-disc-author">
                            {msg.author_role === 'teacher' ? '👨‍🏫' : '🎓'} {msg.author_name}
                            <span className="lms-pill" style={{ background: msg.author_role === 'teacher' ? 'var(--ac)' : 'var(--hv)', color: msg.author_role === 'teacher' ? '#fff' : 'var(--tx)' }}>
                              {msg.author_role}
                            </span>
                          </span>
                          <span className="lms-disc-time">
                            {new Date(msg.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="lms-disc-body">{msg.message}</div>
                      </div>
                    ))
                  )}
                </div>

                {/* Message input */}
                <form onSubmit={handleSendDiscussion} style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <input
                    type="text"
                    placeholder="Type your question or comment here..."
                    value={discMessage}
                    onChange={(e) => setDiscMessage(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn pr" disabled={discBusy || !discMessage.trim()}>
                    {discBusy ? 'Posting...' : 'Post Message ➔'}
                  </button>
                </form>
              </div>
            )}

            {/* ── Tab 6: Gradebook & Class Progress (Teacher/Admin) ── */}
            {activeTab === 'gradebook' && (
              <div>
                <h2 style={{ fontSize: '1.2rem', margin: '0 0 4px' }}>Class Progress & Student Roster</h2>
                <p style={{ margin: '0 0 16px', color: 'var(--mu)', fontSize: '0.9rem' }}>
                  Real-time monitoring of each enrolled student’s lesson completion in {courseDetail.cls}.
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--bd)', color: 'var(--mu)', fontSize: '0.85rem' }}>
                        <th style={{ padding: '10px 14px' }}>Student ID</th>
                        <th style={{ padding: '10px 14px' }}>Name</th>
                        <th style={{ padding: '10px 14px' }}>Class</th>
                        <th style={{ padding: '10px 14px' }}>Completed Lessons</th>
                        <th style={{ padding: '10px 14px' }}>Progress</th>
                        <th style={{ padding: '10px 14px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(courseDetail.enrolledStudents || []).map((stu) => (
                        <tr key={stu.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600 }}>{stu.id}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>{stu.name}</td>
                          <td style={{ padding: '12px 14px' }}>{stu.cls}</td>
                          <td style={{ padding: '12px 14px' }}>{stu.completed_lessons} / {stu.totalLessons}</td>
                          <td style={{ padding: '12px 14px', minWidth: 160 }}>
                            <div className="lms-progress-wrap">
                              <div className="lms-progress-track">
                                <div className="lms-progress-fill" style={{ width: `${stu.progressPercent}%` }} />
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--mu)' }}>{stu.progressPercent}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <Badge v={stu.progressPercent === 100 ? 'Completed' : stu.progressPercent > 0 ? 'Active' : 'Unpaid'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Modals within Course Detail ── */}

        {/* Add Module Modal */}
        {moduleModal && (
          <Modal title="Add New Curriculum Module" onClose={() => setModuleModal(false)}>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const f = e.target;
              try {
                await api('/lms/modules', {
                  method: 'POST',
                  body: {
                    courseId: activeCourseId,
                    title: f.title.value,
                    description: f.description.value,
                    orderIndex: Number(f.orderIndex.value) || 0
                  }
                });
                setModuleModal(false);
                loadCourseDetail(activeCourseId);
                setToast('Module added successfully!');
              } catch (err) { setToast(err.message); }
            }}>
              <div className="fld">
                <label htmlFor="mod_title">Module Title *</label>
                <input id="mod_title" name="title" required placeholder="e.g. Unit 3: Quadratic Functions" />
              </div>
              <div className="fld">
                <label htmlFor="mod_desc">Description</label>
                <textarea id="mod_desc" name="description" rows="3" placeholder="Brief summary of key concepts covered in this module..." />
              </div>
              <div className="fld">
                <label htmlFor="mod_order">Sort Order Index</label>
                <input id="mod_order" name="orderIndex" type="number" defaultValue={(courseDetail.modules?.length || 0) + 1} />
              </div>
              <div className="acts">
                <button type="button" className="btn" onClick={() => setModuleModal(false)}>Cancel</button>
                <button type="submit" className="btn pr">Save Module</button>
              </div>
            </form>
          </Modal>
        )}

        {/* Add Lesson Modal */}
        {lessonModal && (
          <Modal title="Add New Lesson" onClose={() => setLessonModal(false)}>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const f = e.target;
              try {
                await api('/lms/lessons', {
                  method: 'POST',
                  body: {
                    courseId: activeCourseId,
                    moduleId: lessonModal, // holds moduleId
                    title: f.title.value,
                    videoUrl: f.videoUrl.value,
                    durationMinutes: Number(f.durationMinutes.value) || 25,
                    content: f.content.value
                  }
                });
                setLessonModal(false);
                loadCourseDetail(activeCourseId);
                setToast('Lesson created successfully!');
              } catch (err) { setToast(err.message); }
            }}>
              <div className="fld">
                <label htmlFor="les_title">Lesson Title *</label>
                <input id="les_title" name="title" required placeholder="e.g. Solving Linear Systems by Elimination" />
              </div>
              <div className="fld">
                <label htmlFor="les_video">Video URL (YouTube / Vimeo / MP4)</label>
                <input id="les_video" name="videoUrl" placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              <div className="fld">
                <label htmlFor="les_dur">Estimated Duration (Minutes)</label>
                <input id="les_dur" name="durationMinutes" type="number" defaultValue={25} />
              </div>
              <div className="fld">
                <label htmlFor="les_content">Lecture Notes / Study Content (Markdown supported)</label>
                <textarea id="les_content" name="content" rows="6" placeholder="Provide full explanatory notes, formulas, step-by-step procedures, and examples..." />
              </div>
              <div className="acts">
                <button type="button" className="btn" onClick={() => setLessonModal(false)}>Cancel</button>
                <button type="submit" className="btn pr">Publish Lesson</button>
              </div>
            </form>
          </Modal>
        )}

        {/* Add Quiz Modal */}
        {quizModal && (
          <Modal title="Create New Quiz" onClose={() => setQuizModal(false)}>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const f = e.target;
              const q1 = {
                id: 1,
                question: f.q1_text.value,
                options: [f.q1_o1.value, f.q1_o2.value, f.q1_o3.value, f.q1_o4.value],
                correct_index: Number(f.q1_correct.value),
                explanation: f.q1_expl.value
              };
              try {
                await api('/lms/quizzes', {
                  method: 'POST',
                  body: {
                    courseId: activeCourseId,
                    title: f.title.value,
                    description: f.description.value,
                    passingScore: Number(f.passingScore.value) || 70,
                    timeLimitMinutes: Number(f.timeLimitMinutes.value) || 15,
                    questions: [q1]
                  }
                });
                setQuizModal(false);
                loadCourseDetail(activeCourseId);
                setToast('Quiz created successfully!');
              } catch (err) { setToast(err.message); }
            }}>
              <div className="fld">
                <label htmlFor="qz_title">Quiz Title *</label>
                <input id="qz_title" name="title" required placeholder="e.g. Unit Checkpoint: Linear Equations" />
              </div>
              <div className="fld">
                <label htmlFor="qz_desc">Instructions / Description</label>
                <textarea id="qz_desc" name="description" rows="2" placeholder="Instructions for students..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="fld">
                  <label htmlFor="qz_pass">Passing Score (%)</label>
                  <input id="qz_pass" name="passingScore" type="number" defaultValue={70} />
                </div>
                <div className="fld">
                  <label htmlFor="qz_time">Time Limit (Mins)</label>
                  <input id="qz_time" name="timeLimitMinutes" type="number" defaultValue={15} />
                </div>
              </div>

              {/* Sample Question Builder */}
              <div style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: 12, marginTop: 12, background: 'var(--hv)' }}>
                <strong style={{ fontSize: '0.9rem' }}>Question 1</strong>
                <div className="fld" style={{ marginTop: 6 }}>
                  <label htmlFor="q1_text">Question Prompt *</label>
                  <input id="q1_text" name="q1_text" required placeholder="e.g. What is the solution to 2x + 6 = 14?" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="fld">
                    <label htmlFor="q1_o1">Option A</label>
                    <input id="q1_o1" name="q1_o1" required defaultValue="x = 4" />
                  </div>
                  <div className="fld">
                    <label htmlFor="q1_o2">Option B</label>
                    <input id="q1_o2" name="q1_o2" required defaultValue="x = 5" />
                  </div>
                  <div className="fld">
                    <label htmlFor="q1_o3">Option C</label>
                    <input id="q1_o3" name="q1_o3" required defaultValue="x = 8" />
                  </div>
                  <div className="fld">
                    <label htmlFor="q1_o4">Option D</label>
                    <input id="q1_o4" name="q1_o4" required defaultValue="x = 10" />
                  </div>
                </div>
                <div className="fld" style={{ marginTop: 6 }}>
                  <label htmlFor="q1_correct">Correct Option Index (0 = A, 1 = B, 2 = C, 3 = D)</label>
                  <select id="q1_correct" name="q1_correct">
                    <option value="0">Option A</option>
                    <option value="1">Option B</option>
                    <option value="2">Option C</option>
                    <option value="3">Option D</option>
                  </select>
                </div>
                <div className="fld" style={{ marginTop: 6 }}>
                  <label htmlFor="q1_expl">Explanation / Rationale</label>
                  <input id="q1_expl" name="q1_expl" defaultValue="Subtract 6: 2x = 8. Divide by 2: x = 4." />
                </div>
              </div>

              <div className="acts">
                <button type="button" className="btn" onClick={() => setQuizModal(false)}>Cancel</button>
                <button type="submit" className="btn pr">Save Quiz</button>
              </div>
            </form>
          </Modal>
        )}

        {/* Add Material Modal */}
        {materialModal && (
          <Modal title="Add Course Material" onClose={() => setMaterialModal(false)}>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const f = e.target;
              try {
                await api('/lms/materials', {
                  method: 'POST',
                  body: {
                    courseId: activeCourseId,
                    title: f.title.value,
                    fileType: f.fileType.value,
                    fileUrl: f.fileUrl.value || '#',
                    fileSize: f.fileSize.value || '1.2 MB'
                  }
                });
                setMaterialModal(false);
                loadCourseDetail(activeCourseId);
                setToast('Material added successfully!');
              } catch (err) { setToast(err.message); }
            }}>
              <div className="fld">
                <label htmlFor="mat_title">Document Title *</label>
                <input id="mat_title" name="title" required placeholder="e.g. Term 1 Complete Syllabus & Exam Blueprint" />
              </div>
              <div className="fld">
                <label htmlFor="mat_type">Material Type</label>
                <select id="mat_type" name="fileType">
                  <option value="PDF">PDF Document</option>
                  <option value="Document">Word / Worksheet</option>
                  <option value="Slides">Presentation Slides</option>
                  <option value="Spreadsheet">Excel / Data Table</option>
                  <option value="Link">External Link</option>
                </select>
              </div>
              <div className="fld">
                <label htmlFor="mat_url">File URL / Download Link</label>
                <input id="mat_url" name="fileUrl" placeholder="https://... or #" defaultValue="#" />
              </div>
              <div className="fld">
                <label htmlFor="mat_size">Estimated File Size</label>
                <input id="mat_size" name="fileSize" defaultValue="1.5 MB" />
              </div>
              <div className="acts">
                <button type="button" className="btn" onClick={() => setMaterialModal(false)}>Cancel</button>
                <button type="submit" className="btn pr">Upload Resource</button>
              </div>
            </form>
          </Modal>
        )}

        {/* Interactive Quiz Runner Modal */}
        {quizRunner && (
          <Modal
            title={`Assessment: ${quizRunner.title}`}
            onClose={() => {
              setQuizRunner(null);
              setQuizResult(null);
            }}
          >
            {!quizResult ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--mu)' }}>
                    ⏱️ Time limit: {quizRunner.time_limit_minutes || 15} mins · Passing: {quizRunner.passing_score || 70}%
                  </span>
                  <span className="lms-pill" style={{ background: 'var(--acs)', color: 'var(--ac)' }}>
                    {(quizRunner.questions || []).length} Questions
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {(quizRunner.questions || []).map((q, qIdx) => (
                    <div className="lms-quiz-q-card" key={q.id || qIdx}>
                      <strong style={{ fontSize: '1rem', color: 'var(--tx)' }}>
                        {qIdx + 1}. {q.question}
                      </strong>
                      <div className="lms-quiz-options">
                        {(q.options || []).map((opt, optIdx) => (
                          <label
                            key={optIdx}
                            className={`lms-quiz-opt ${quizAnswers[qIdx] === optIdx ? 'selected' : ''}`}
                          >
                            <input
                              type="radio"
                              name={`question_${qIdx}`}
                              checked={quizAnswers[qIdx] === optIdx}
                              onChange={() => setQuizAnswers(prev => ({ ...prev, [qIdx]: optIdx }))}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="acts" style={{ marginTop: 18 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setQuizRunner(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn pr"
                    disabled={quizSubmitting || Object.keys(quizAnswers).length === 0}
                    onClick={handleSubmitQuiz}
                  >
                    {quizSubmitting ? 'Evaluating Answers...' : 'Submit Assessment ➔'}
                  </button>
                </div>
              </div>
            ) : (
              /* Quiz Results Screen */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    padding: 18,
                    borderRadius: 12,
                    textAlign: 'center',
                    background: quizResult.passed ? 'rgba(16, 185, 129, 0.12)' : 'var(--dgs)',
                    color: quizResult.passed ? '#065f46' : 'var(--dg)'
                  }}
                >
                  <div style={{ fontSize: '2.5rem' }}>{quizResult.passed ? '🎉' : '⚠️'}</div>
                  <h3 style={{ margin: '8px 0 4px', fontSize: '1.4rem' }}>
                    {quizResult.passed ? 'Assessment Passed!' : 'Needs Review'}
                  </h3>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>
                    {quizResult.score}%
                  </div>
                  <div style={{ fontSize: '0.9rem', marginTop: 4 }}>
                    You got {quizResult.correctCount} out of {quizResult.totalQuestions} questions correct.
                    (Passing score: {quizResult.passingScore}%)
                  </div>
                </div>

                <h4 style={{ margin: '10px 0 0' }}>Answer Review & Explanations:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(quizResult.review || []).map((rev, idx) => (
                    <div
                      key={idx}
                      className={`lms-quiz-review-item ${rev.isCorrect ? 'correct' : 'wrong'}`}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {idx + 1}. {rev.question}
                      </div>
                      <div style={{ fontSize: '0.88rem' }}>
                        Your Answer: <strong>{rev.selectedIndex !== null ? rev.options[rev.selectedIndex] : 'None'}</strong> {rev.isCorrect ? '✅' : '❌'}
                      </div>
                      {!rev.isCorrect && (
                        <div style={{ fontSize: '0.88rem', color: '#065f46' }}>
                          Correct Answer: <strong>{rev.options[rev.correctIndex]}</strong>
                        </div>
                      )}
                      {rev.explanation && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--mu)', marginTop: 4, fontStyle: 'italic' }}>
                          💡 {rev.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="acts">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setQuizRunner(null);
                      setQuizResult(null);
                    }}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    className="btn pr"
                    onClick={() => {
                      setQuizAnswers({});
                      setQuizResult(null);
                    }}
                  >
                    Retake Quiz ↺
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {/* Confirm Delete Modal */}
        {confirmDelete && (
          <ConfirmModal
            title={`Delete ${confirmDelete.type}?`}
            msg={`Are you sure you want to delete <strong>${confirmDelete.name}</strong>? This cannot be undone.`}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={async () => {
              try {
                if (confirmDelete.type === 'module') {
                  await api(`/lms/modules/${confirmDelete.id}`, { method: 'DELETE' });
                } else if (confirmDelete.type === 'lesson') {
                  await api(`/lms/lessons/${confirmDelete.id}`, { method: 'DELETE' });
                } else if (confirmDelete.type === 'quiz') {
                  await api(`/lms/quizzes/${confirmDelete.id}`, { method: 'DELETE' });
                } else if (confirmDelete.type === 'material') {
                  await api(`/lms/materials/${confirmDelete.id}`, { method: 'DELETE' });
                }
                setConfirmDelete(null);
                loadCourseDetail(activeCourseId);
                loadData();
                setToast(`${confirmDelete.type} deleted.`);
              } catch (e) {
                setToast(e.message);
              }
            }}
          />
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. MAIN LMS COURSES CATALOG / MY LEARNING VIEW
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="lms-container">
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}

      {/* LMS Header & Quick Stats */}
      {stats && (
        <div className="lms-stats-grid">
          <div className="lms-stat-card">
            <div className="lms-stat-icon green">🎓</div>
            <div className="lms-stat-info">
              <span className="lms-stat-label">{isStudent ? 'Enrolled Courses' : 'Active Courses'}</span>
              <span className="lms-stat-val">{stats.totalCourses || courses.length}</span>
            </div>
          </div>

          <div className="lms-stat-card">
            <div className="lms-stat-icon blue">📖</div>
            <div className="lms-stat-info">
              <span className="lms-stat-label">{isStudent ? 'Completed Lessons' : 'Total Lessons'}</span>
              <span className="lms-stat-val">
                {isStudent ? `${stats.completedLessons} / ${stats.totalLessons}` : stats.totalLessons || 0}
              </span>
            </div>
          </div>

          <div className="lms-stat-card">
            <div className="lms-stat-icon purple">📊</div>
            <div className="lms-stat-info">
              <span className="lms-stat-label">{isStudent ? 'Overall Progress' : 'Total Quizzes'}</span>
              <span className="lms-stat-val">
                {isStudent ? `${stats.overallProgress}%` : stats.totalQuizzes || 0}
              </span>
            </div>
          </div>

          <div className="lms-stat-card">
            <div className="lms-stat-icon amber">🏆</div>
            <div className="lms-stat-info">
              <span className="lms-stat-label">Quiz Avg Score</span>
              <span className="lms-stat-val">{stats.quizAvgScore || 0}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar & Filters */}
      <div className="lms-toolbar">
        <div className="lms-filters">
          <input
            type="search"
            className="lms-search-input"
            placeholder="Search courses or topics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select value={subFilter} onChange={(e) => setSubFilter(e.target.value)}>
            {SUBJECTS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Subjects' : s}</option>)}
          </select>

          <select value={clsFilter} onChange={(e) => setClsFilter(e.target.value)}>
            {CLASSES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Classes' : `Class ${c}`}</option>)}
          </select>
        </div>

        {write && (
          <button
            type="button"
            className="btn pr"
            onClick={() => setCourseModal(true)}
          >
            + Create New Course
          </button>
        )}
      </div>

      {/* Course Cards Grid */}
      {!filteredCourses.length ? (
        <Empty
          title="No courses found"
          text={search || subFilter !== 'All' ? 'Try adjusting your filters or search keywords.' : 'No courses have been published yet.'}
        />
      ) : (
        <div className="lms-courses-grid">
          {filteredCourses.map((c, idx) => (
            <div className="lms-card" key={c.id}>
              <div className={`lms-card-banner ${c.thumbnail || GRADIENTS[idx % GRADIENTS.length]}`}>
                <div className="lms-badge-group">
                  <span className="lms-pill">{c.subject}</span>
                  <span className="lms-pill">{c.cls === 'All' ? 'School-wide' : `Grade ${c.cls}`}</span>
                </div>
                <span className="lms-pill" style={{ opacity: 0.9 }}>
                  {c.status || 'Published'}
                </span>
              </div>

              <div className="lms-card-body">
                <h3 className="lms-card-title">{c.title}</h3>
                <p className="lms-card-desc">{c.description || 'Comprehensive curriculum modules and interactive quizzes.'}</p>

                {/* Progress bar if student */}
                {isStudent && c.progressPercentage !== undefined && (
                  <div className="lms-progress-wrap">
                    <div className="lms-progress-header">
                      <span>Course Progress</span>
                      <span>{c.progressPercentage}%</span>
                    </div>
                    <div className="lms-progress-track">
                      <div className="lms-progress-fill" style={{ width: `${c.progressPercentage}%` }} />
                    </div>
                  </div>
                )}

                <div className="lms-card-meta">
                  <span>👤 {c.teacher_name || 'Assigned Faculty'}</span>
                  <span>📖 {c.lesson_count || 0} Lessons</span>
                </div>

                <div className="lms-card-actions">
                  <button
                    type="button"
                    className="btn pr"
                    style={{ flex: 1 }}
                    onClick={() => setActiveCourseId(c.id)}
                  >
                    {isStudent && (c.completedLessons || 0) > 0 ? 'Continue Learning ➔' : 'Enter Course ➔'}
                  </button>

                  {write && (
                    <button
                      type="button"
                      className="btn sm dg"
                      title="Delete Course"
                      onClick={() => setConfirmDelete({ type: 'course', id: c.id, name: c.title })}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Course Modal */}
      {courseModal && (
        <Modal title="Create New Course" onClose={() => setCourseModal(false)}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const f = e.target;
            try {
              await api('/lms/courses', {
                method: 'POST',
                body: {
                  title: f.title.value,
                  subject: f.subject.value,
                  cls: f.cls.value,
                  description: f.description.value,
                  thumbnail: f.thumbnail.value,
                  status: 'Published'
                }
              });
              setCourseModal(false);
              loadData();
              setToast('Course created successfully! 🎉');
            } catch (err) {
              setToast(err.message);
            }
          }}>
            <div className="fld">
              <label htmlFor="crs_title">Course Title *</label>
              <input id="crs_title" name="title" required placeholder="e.g. Grade 8A - Physical Science & Lab Chemistry" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="fld">
                <label htmlFor="crs_sub">Subject *</label>
                <select id="crs_sub" name="subject" required>
                  {SUBJECTS.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="fld">
                <label htmlFor="crs_cls">Class Target *</label>
                <select id="crs_cls" name="cls" required>
                  {CLASSES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Classes' : c}</option>)}
                </select>
              </div>
            </div>

            <div className="fld">
              <label htmlFor="crs_desc">Description</label>
              <textarea id="crs_desc" name="description" rows="3" placeholder="Course goals, syllabus overview, and expected outcomes..." />
            </div>

            <div className="fld">
              <label htmlFor="crs_thumb">Color Theme Banner</label>
              <select id="crs_thumb" name="thumbnail">
                <option value="gradient-teal">Teal & Emerald</option>
                <option value="gradient-blue">Ocean Blue</option>
                <option value="gradient-purple">Royal Purple</option>
                <option value="gradient-amber">Warm Amber</option>
                <option value="gradient-rose">Vibrant Rose</option>
                <option value="gradient-emerald">Forest Green</option>
              </select>
            </div>

            <div className="acts">
              <button type="button" className="btn" onClick={() => setCourseModal(false)}>Cancel</button>
              <button type="submit" className="btn pr">Create Course</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm Delete Course Modal */}
      {confirmDelete && confirmDelete.type === 'course' && (
        <ConfirmModal
          title="Delete Course?"
          msg={`Are you sure you want to delete course <strong>${confirmDelete.name}</strong>? All associated modules, lessons, and quizzes will be deleted.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try {
              await api(`/lms/courses/${confirmDelete.id}`, { method: 'DELETE' });
              setConfirmDelete(null);
              loadData();
              setToast('Course deleted successfully.');
            } catch (e) {
              setToast(e.message);
            }
          }}
        />
      )}
    </div>
  );
}
