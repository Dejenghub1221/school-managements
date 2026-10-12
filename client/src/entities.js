export const CLS = ['7A', '7B', '8A', '8B', '9A', '9B'];
export const SUB = ['Mathematics', 'English', 'Science', 'History', 'Geography', 'ICT'];

const name = (list, id, fallback = id) => (list || []).find(x => x.id === id)?.name || fallback;

export const ENT = {
  students: {
    title: 'Student',
    label: 'Students',
    flt: 'cls',
    rels: ['parents'],
    hasProfile: true,
    cols: [
      ['id', 'ID'],
      ['name', 'Name'],
      ['cls', 'Class'],
      ['gender', 'Gender'],
      ['phone', 'Contact'],
      ['status', 'Status']
    ],
    fields: [
      { k: 'name', l: 'Full name', req: 1 },
      { k: 'cls', l: 'Class', t: 'select', o: CLS, req: 1, def: CLS[0] },
      { k: 'gender', l: 'Gender', t: 'select', o: ['Female', 'Male'], req: 1, def: 'Female' },
      { k: 'dob', l: 'Date of birth', t: 'date' },
      { k: 'phone', l: 'Phone', t: 'tel', req: 1 },
      { k: 'guardian', l: 'Parent or guardian', t: 'select', rel: 'parents' },
      { k: 'status', l: 'Status', t: 'select', o: ['Active', 'Inactive', 'Suspended'], req: 1, def: 'Active' },
      { k: 'address', l: 'Address', t: 'text' }
    ]
  },
  teachers: {
    title: 'Teacher',
    label: 'Teachers',
    flt: 'subject',
    cols: [
      ['id', 'ID'],
      ['name', 'Name'],
      ['subject', 'Subject'],
      ['classes', 'Classes', r => (r.classes || []).join(', ')],
      ['phone', 'Phone'],
      ['status', 'Status']
    ],
    fields: [
      { k: 'name', l: 'Full name', req: 1 },
      { k: 'subject', l: 'Subject', t: 'select', o: SUB, req: 1, def: SUB[0] },
      { k: 'classes', l: 'Assigned classes', t: 'checks', o: CLS },
      { k: 'phone', l: 'Phone', t: 'tel', req: 1 },
      { k: 'email', l: 'Email', t: 'email' },
      { k: 'status', l: 'Status', t: 'select', o: ['Active', 'On leave'], req: 1, def: 'Active' }
    ]
  },
  classes: {
    title: 'Class',
    label: 'Classes',
    rels: ['teachers', 'students'],
    cols: [
      ['name', 'Class'],
      ['teacher', 'Class teacher', (r, x) => name(x.teachers, r.teacher)],
      ['room', 'Room'],
      ['n', 'Students', (r, x) => (x.students || []).filter(s => s.cls === r.name).length]
    ],
    fields: [
      { k: 'name', l: 'Class name', req: 1 },
      { k: 'teacher', l: 'Class teacher', t: 'select', rel: 'teachers', req: 1 },
      { k: 'room', l: 'Room', t: 'text' }
    ]
  },
  subjects: {
    title: 'Subject',
    label: 'Subjects',
    rels: ['teachers'],
    cols: [
      ['name', 'Subject'],
      ['code', 'Code'],
      ['tc', 'Teachers', (r, x) => (x.teachers || []).filter(t => t.subject === r.name).map(t => t.name).join(', ') || 'Unassigned']
    ],
    fields: [
      { k: 'name', l: 'Subject name', req: 1 },
      { k: 'code', l: 'Code', t: 'text', req: 1 }
    ]
  },
  exams: {
    title: 'Exam',
    label: 'Exams',
    flt: 'status',
    cols: [
      ['name', 'Exam'],
      ['cls', 'Class'],
      ['date', 'Date'],
      ['status', 'Status']
    ],
    fields: [
      { k: 'name', l: 'Exam name', req: 1 },
      { k: 'cls', l: 'Class', t: 'select', o: ['All', ...CLS], req: 1, def: 'All' },
      { k: 'date', l: 'Date', t: 'date', req: 1 },
      { k: 'status', l: 'Status', t: 'select', o: ['Scheduled', 'Completed'], req: 1, def: 'Scheduled' }
    ]
  },
  assignments: {
    title: 'Assignment',
    label: 'Assignments',
    flt: 'cls',
    cols: [
      ['title', 'Title'],
      ['subject', 'Subject'],
      ['cls', 'Class'],
      ['due', 'Due date'],
      ['status', 'Status']
    ],
    fields: [
      { k: 'title', l: 'Title', req: 1 },
      { k: 'subject', l: 'Subject', t: 'select', o: SUB, req: 1, def: SUB[0] },
      { k: 'cls', l: 'Class', t: 'select', o: CLS, req: 1, def: CLS[0] },
      { k: 'due', l: 'Due date', t: 'date', req: 1 },
      { k: 'status', l: 'Status', t: 'select', o: ['Open', 'Closed'], req: 1, def: 'Open' }
    ]
  },
  parents: {
    title: 'Parent',
    label: 'Parents',
    rels: ['students'],
    cols: [
      ['name', 'Name'],
      ['phone', 'Phone'],
      ['email', 'Email'],
      ['ch', 'Children', (r, x) => (x.students || []).filter(s => s.guardian === r.id).map(s => s.name).join(', ') || 'None linked']
    ],
    fields: [
      { k: 'name', l: 'Full name', req: 1 },
      { k: 'phone', l: 'Phone', t: 'tel', req: 1 },
      { k: 'email', l: 'Email', t: 'email' }
    ]
  },
  library: {
    title: 'Book',
    label: 'Library',
    cols: [
      ['title', 'Title'],
      ['author', 'Author'],
      ['copies', 'Copies'],
      ['issued', 'Issued'],
      ['avail', 'Available', r => r.copies - r.issued]
    ],
    fields: [
      { k: 'title', l: 'Title', req: 1 },
      { k: 'author', l: 'Author', req: 1 },
      { k: 'copies', l: 'Copies', t: 'number', req: 1 },
      { k: 'issued', l: 'Issued', t: 'number' }
    ],
    validate: v => (Number(v.issued || 0) > Number(v.copies || 0) ? 'Issued copies cannot exceed total copies.' : '')
  },
  fees: {
    title: 'Fee record',
    label: 'Fees & Payments',
    flt: 'status',
    rels: ['students'],
    cols: [
      ['id', 'ID'],
      ['student', 'Student', (r, x) => name(x.students, r.student)],
      ['term', 'Term'],
      ['amount', 'Billed'],
      ['paid', 'Paid'],
      ['balance', 'Balance', r => r.amount - r.paid],
      ['status', 'Status']
    ],
    fields: [
      { k: 'student', l: 'Student', t: 'select', rel: 'students', req: 1 },
      { k: 'term', l: 'Term', t: 'select', o: ['Term 1', 'Term 2', 'Term 3'], req: 1 },
      { k: 'amount', l: 'Amount billed', t: 'number', req: 1 },
      { k: 'paid', l: 'Paid so far', t: 'number' }
    ],
    validate: v => (Number(v.paid || 0) > Number(v.amount || 0) ? 'Paid amount cannot exceed the amount billed.' : '')
  }
};
