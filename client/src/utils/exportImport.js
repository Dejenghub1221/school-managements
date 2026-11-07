import * as XLSX from 'xlsx';

/**
 * Clean string for PDF stream (escape parentheses and backslashes)
 */
function escapePdfText(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');
}

/**
 * Generate a standalone, valid PDF 1.4 binary file for tabular reports
 */
export function generatePdfBlob({ title, subtitle, columns, data, schoolName = 'School Management SC', academicYear = '' }) {
  const width = 842;   // A4 Landscape points
  const height = 595;
  const margin = 36;
  const usableWidth = width - margin * 2;
  const rowHeight = 16;
  const headerHeight = 22;
  const startY = 490;
  const bottomY = 48;
  const rowsPerPage = Math.floor((startY - bottomY) / rowHeight);

  // Calculate proportional column widths
  const totalWeight = columns.reduce((acc, c) => acc + (c.width || 1), 0);
  const colWidths = columns.map(c => Math.floor(usableWidth * ((c.width || 1) / totalWeight)));

  const totalPages = Math.max(1, Math.ceil(data.length / rowsPerPage));
  const pagesData = [];

  for (let p = 0; p < totalPages; p++) {
    const pageRows = data.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    let stream = '';

    // Header banner: School Name & Report Title
    stream += `0.02 0.47 0.34 rg\n`; // Emerald #047857
    stream += `${margin} 540 ${usableWidth} 28 re f\n`;

    stream += `1 1 1 rg\n`;
    stream += `BT /F2 13 Tf ${margin + 10} 550 Td (${escapePdfText(schoolName)}) Tj ET\n`;
    if (academicYear) {
      stream += `BT /F1 9 Tf ${width - margin - 140} 550 Td (Year: ${escapePdfText(academicYear)}) Tj ET\n`;
    }

    // Subtitle & Timestamp
    stream += `0.15 0.23 0.33 rg\n`;
    stream += `BT /F2 11 Tf ${margin} 522 Td (${escapePdfText(title)}) Tj ET\n`;
    const metaText = `Generated: ${new Date().toLocaleDateString()} · Total Records: ${data.length} · Page ${p + 1} of ${totalPages}`;
    stream += `0.45 0.52 0.60 rg\n`;
    stream += `BT /F1 8 Tf ${width - margin - 240} 522 Td (${escapePdfText(metaText)}) Tj ET\n`;

    // Table Header Row
    stream += `0.94 0.96 0.98 rg\n`;
    stream += `${margin} ${startY} ${usableWidth} ${headerHeight} re f\n`;
    stream += `0.80 0.85 0.90 RG 0.7 w\n`;
    stream += `${margin} ${startY} ${usableWidth} ${headerHeight} re S\n`;

    // Table Header Text
    let currentX = margin;
    columns.forEach((col, i) => {
      const w = colWidths[i];
      stream += `0.10 0.20 0.30 rg\n`;
      stream += `BT /F2 8.5 Tf ${currentX + 6} ${startY + 6} Td (${escapePdfText(String(col.label).slice(0, 30))}) Tj ET\n`;
      currentX += w;
    });

    // Table Rows
    let y = startY - rowHeight;
    pageRows.forEach((row, rowIndex) => {
      // Zebra background
      if (rowIndex % 2 === 1) {
        stream += `0.97 0.98 0.99 rg\n`;
        stream += `${margin} ${y} ${usableWidth} ${rowHeight} re f\n`;
      }

      // Border bottom
      stream += `0.90 0.92 0.94 RG 0.4 w\n`;
      stream += `${margin} ${y} m ${width - margin} ${y} l S\n`;

      // Cells
      let cellX = margin;
      columns.forEach((col, colIndex) => {
        const w = colWidths[colIndex];
        const rawVal = col.format ? col.format(row) : (row[col.key] ?? '');
        const val = escapePdfText(String(rawVal ?? '').slice(0, Math.floor(w / 4.5)));
        stream += `0.15 0.18 0.22 rg\n`;
        stream += `BT /F1 8 Tf ${cellX + 6} ${y + 4} Td (${val}) Tj ET\n`;
        cellX += w;
      });

      y -= rowHeight;
    });

    // Page footer
    stream += `0.55 0.60 0.65 rg\n`;
    stream += `BT /F1 7.5 Tf ${margin} 28 Td (School Management System · Official Export) Tj ET\n`;
    stream += `BT /F1 7.5 Tf ${width - margin - 80} 28 Td (Page ${p + 1} of ${totalPages}) Tj ET\n`;

    pagesData.push(stream);
  }

  // Assemble PDF document objects
  const objects = [];
  const addObject = content => {
    objects.push(content);
    return objects.length;
  };

  // Obj 1: Catalog
  addObject(`<< /Type /Catalog /Pages 2 0 R >>`);

  // Obj 2: Pages (Kids placeholder)
  const pageObjNums = [];
  for (let i = 0; i < totalPages; i++) {
    pageObjNums.push(3 + i * 2);
  }
  const kidsStr = pageObjNums.map(n => `${n} 0 R`).join(' ');
  addObject(`<< /Type /Pages /Kids [${kidsStr}] /Count ${totalPages} >>`);

  // Fonts: Helvetica and Helvetica-Bold
  const fontRegularNum = 3 + totalPages * 2;
  const fontBoldNum = fontRegularNum + 1;

  // Build page objects & content streams
  for (let i = 0; i < totalPages; i++) {
    const contentObjNum = 4 + i * 2;
    // Page obj
    addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontRegularNum} 0 R /F2 ${fontBoldNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>`);
    // Content stream obj
    const streamContent = pagesData[i];
    const streamLength = new TextEncoder().encode(streamContent).length;
    addObject(`<< /Length ${streamLength} >>\nstream\n${streamContent}endstream`);
  }

  // Add Font objects
  addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);

  // Format PDF file
  const chunks = ['%PDF-1.4\n'];
  const byteOffsets = [];
  let currentOffset = new TextEncoder().encode(chunks[0]).length;

  for (let i = 0; i < objects.length; i++) {
    byteOffsets.push(currentOffset);
    const objStr = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    chunks.push(objStr);
    currentOffset += new TextEncoder().encode(objStr).length;
  }

  // Xref
  const xrefOffset = currentOffset;
  let xrefStr = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < byteOffsets.length; i++) {
    xrefStr += `${String(byteOffsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  chunks.push(xrefStr);

  // Trailer
  const trailerStr = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(trailerStr);

  return new Blob(chunks, { type: 'application/pdf' });
}

/**
 * Trigger browser download of a Blob
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/**
 * 1. EXCEL EXPORT (.xlsx)
 */
export function exportToExcel({ filename = 'export', title = 'Report', columns = [], data = [], schoolName = 'School Management SC' }) {
  const wb = XLSX.utils.book_new();

  // Create formatted table data
  const headers = columns.map(c => c.label);
  const rows = data.map(row => columns.map(c => (c.format ? c.format(row) : (row[c.key] ?? ''))));

  const aoa = [
    [schoolName],
    [`${title} · Generated on ${new Date().toLocaleDateString()}`],
    [],
    headers,
    ...rows
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Set column widths based on longest cell content
  ws['!cols'] = columns.map((c, colIndex) => {
    let maxLen = c.label.length;
    for (const r of rows) {
      const len = String(r[colIndex] ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
  });

  const sheetName = title.slice(0, 31).replace(/[\\/?*[\]]/g, '') || 'Data';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * 2. PDF EXPORT (.pdf)
 */
export function exportToPdf({ filename = 'export', title = 'Report', subtitle = '', columns = [], data = [], schoolName = 'School Management SC', academicYear = '' }) {
  const blob = generatePdfBlob({ title, subtitle, columns, data, schoolName, academicYear });
  downloadBlob(blob, `${filename}.pdf`);
}

/**
 * 3. CSV EXPORT (.csv)
 */
export function exportToCsv({ filename = 'export', columns = [], data = [] }) {
  const escapeCell = val => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headers = columns.map(c => escapeCell(c.label)).join(',');
  const lines = data.map(row =>
    columns.map(c => escapeCell(c.format ? c.format(row) : (row[c.key] ?? ''))).join(',')
  );

  // Prepend UTF-8 BOM so Excel & editors parse special characters correctly
  const csvContent = '\uFEFF' + [headers, ...lines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

/**
 * 4. WORD EXPORT (.docx / .doc)
 */
export function exportToWord({ filename = 'export', title = 'Report', columns = [], data = [], schoolName = 'School Management SC', academicYear = '' }) {
  const headers = columns.map(c => `<th style="background-color:#047857; color:#ffffff; font-weight:bold; padding:8pt 10pt; text-align:left; border:1pt solid #047857; font-size:10pt;">${c.label}</th>`).join('');

  const rowsHtml = data.map((row, idx) => {
    const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
    const cells = columns.map(c => {
      const val = c.format ? c.format(row) : (row[c.key] ?? '');
      return `<td style="padding:6pt 10pt; border:1pt solid #cbd5e1; font-size:9.5pt; color:#1e293b;">${String(val ?? '')}</td>`;
    }).join('');
    return `<tr style="background-color:${bg};">${cells}</tr>`;
  }).join('');

  const docHtml = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${title}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page WordSection1 {
      size: 842.0pt 595.0pt;
      mso-page-orientation: landscape;
      margin: 0.8in 0.8in 0.8in 0.8in;
      mso-header-margin: 0.5in;
      mso-footer-margin: 0.5in;
    }
    div.WordSection1 { page: WordSection1; }
    body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; }
    h1 { color: #047857; font-size: 18pt; margin: 0 0 4pt 0; }
    .subhead { color: #475569; font-size: 11pt; font-weight: bold; margin: 0 0 4pt 0; }
    .meta { color: #64748b; font-size: 9.5pt; margin: 0 0 16pt 0; border-bottom: 2pt solid #047857; padding-bottom: 8pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 10pt; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    .footer { margin-top: 24pt; font-size: 8.5pt; color: #94a3b8; text-align: right; border-top: 1pt solid #e2e8f0; padding-top: 6pt; }
  </style>
</head>
<body>
  <div class="WordSection1">
    <h1>${schoolName}</h1>
    <div class="subhead">${title} ${academicYear ? `· Academic Year ${academicYear}` : ''}</div>
    <div class="meta">Exported on ${new Date().toLocaleDateString()} · Total Records: ${data.length}</div>
    <table>
      <thead>
        <tr>${headers}</tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <div class="footer">School Management SC — Confidential Administrative Record</div>
  </div>
</body>
</html>
`;

  const blob = new Blob([docHtml], { type: 'application/msword;charset=utf-8' });
  downloadBlob(blob, `${filename}.doc`);
}

/**
 * 5. DOWNLOAD IMPORT TEMPLATE (.csv or .xlsx)
 */
export function downloadImportTemplate({ entityKey, filename, format = 'csv', fields = [] }) {
  // Built-in schemas & sample data for all entity types
  const schemas = {
    students: {
      cols: ['name', 'cls', 'gender', 'dob', 'phone', 'guardian', 'status', 'address'],
      labels: ['Full Name *', 'Class *', 'Gender', 'Date of Birth (YYYY-MM-DD)', 'Phone Number *', 'Guardian Parent ID', 'Status', 'Address'],
      sampleRows: [
        ['Abebe Kebede', '7A', 'Male', '2012-05-14', '0911223344', 'P01', 'Active', 'Bole, Addis Ababa'],
        ['Sara Tadesse', '7B', 'Female', '2012-08-20', '0922334455', 'P02', 'Active', 'Piassa, Addis Ababa']
      ]
    },
    teachers: {
      cols: ['name', 'subject', 'classes', 'phone', 'email', 'status'],
      labels: ['Full Name *', 'Subject *', 'Assigned Classes (comma separated)', 'Phone Number *', 'Email Address', 'Status'],
      sampleRows: [
        ['Mr. Daniel Tesfaye', 'Mathematics', '7A, 7B', '0911554433', 'daniel.t@school.edu', 'Active'],
        ['Ms. Helen Girma', 'English', '8A, 8B', '0911778899', 'helen.g@school.edu', 'Active']
      ]
    },
    classes: {
      cols: ['name', 'teacher', 'room'],
      labels: ['Class Name *', 'Class Teacher ID / Name', 'Room / Hall'],
      sampleRows: [
        ['10A', 'T01', 'Room 101'],
        ['10B', 'T02', 'Room 102']
      ]
    },
    subjects: {
      cols: ['name', 'code'],
      labels: ['Subject Name *', 'Subject Code *'],
      sampleRows: [
        ['Biology', 'BIO-101'],
        ['Chemistry', 'CHM-101']
      ]
    },
    parents: {
      cols: ['name', 'phone', 'email'],
      labels: ['Full Name *', 'Phone Number *', 'Email Address'],
      sampleRows: [
        ['Solomon Haile', '0911334455', 'solomon.h@gmail.com'],
        ['Marta Worku', '0922445566', 'marta.w@gmail.com']
      ]
    },
    library: {
      cols: ['title', 'author', 'copies', 'issued'],
      labels: ['Book Title *', 'Author *', 'Total Copies *', 'Issued Copies'],
      sampleRows: [
        ['Advanced Mathematics Grade 10', 'Ministry of Education', '40', '5'],
        ['General Chemistry Principles', 'E. B. Haile', '30', '2']
      ]
    },
    assignments: {
      cols: ['title', 'subject', 'cls', 'due', 'status'],
      labels: ['Assignment Title *', 'Subject *', 'Class *', 'Due Date (YYYY-MM-DD)', 'Status'],
      sampleRows: [
        ['Algebra Worksheet 4', 'Mathematics', '7A', '2026-11-20', 'Open'],
        ['Essay on Photosynthesis', 'Science', '8A', '2026-11-25', 'Open']
      ]
    },
    fees: {
      cols: ['student', 'amount', 'paid', 'term', 'date'],
      labels: ['Student ID *', 'Amount Billed *', 'Amount Paid', 'Term / Period', 'Due Date (YYYY-MM-DD)'],
      sampleRows: [
        ['S0001', '3500', '3500', 'Term 1', '2026-11-30'],
        ['S0002', '3500', '1500', 'Term 1', '2026-11-30']
      ]
    }
  };

  const schema = schemas[entityKey] || {
    cols: fields.map(f => f.k),
    labels: fields.map(f => `${f.l}${f.req ? ' *' : ''}`),
    sampleRows: [fields.map(f => f.def || (f.req ? 'Required Value' : 'Optional Value'))]
  };

  const fname = filename || `${entityKey}_import_template`;

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    const aoa = [
      schema.labels,
      ...schema.sampleRows
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = schema.labels.map(l => ({ wch: Math.max(l.length + 4, 16) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `${fname}.xlsx`);
  } else {
    const csvContent = '\uFEFF' + [
      schema.labels.map(l => `"${l}"`).join(','),
      ...schema.sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${fname}.csv`);
  }
}

/**
 * 6. PARSE IMPORTED FILE (XLSX, XLS, CSV)
 */
export async function parseImportFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheetName];

  // Convert sheet to array of rows (first row is headers)
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const rawHeaders = XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || [];

  return {
    sheetNames: wb.SheetNames,
    rawHeaders: rawHeaders.map(h => String(h).trim()),
    rows
  };
}

/**
 * Match file headers to entity fields flexibly
 */
export function matchImportColumns(rawHeaders = [], fields = [], entityKey = '') {
  const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const aliases = {
    name: ['name', 'fullname', 'studentname', 'teachername', 'classname', 'subjectname', 'parentname', 'title', 'booktitle'],
    cls: ['class', 'cls', 'grade', 'section', 'classroom'],
    gender: ['gender', 'sex'],
    dob: ['dob', 'dateofbirth', 'birthdate', 'birth'],
    phone: ['phone', 'phonenumber', 'contact', 'tele', 'telephone', 'mobile', 'cell'],
    guardian: ['guardian', 'parent', 'guardianid', 'parentid', 'guardianparentid'],
    status: ['status', 'state'],
    address: ['address', 'residence', 'city', 'location'],
    subject: ['subject', 'course', 'sub'],
    classes: ['classes', 'assignedclasses', 'sections'],
    email: ['email', 'emailaddress', 'mail'],
    room: ['room', 'hall', 'roomnumber'],
    teacher: ['teacher', 'classteacher', 'teacherid', 'instructor'],
    code: ['code', 'subjectcode', 'coursecode'],
    copies: ['copies', 'totalcopies', 'qty', 'quantity'],
    issued: ['issued', 'issuedcopies', 'borrowed'],
    author: ['author', 'writer'],
    due: ['due', 'duedate'],
    amount: ['amount', 'billedamount', 'totalamount', 'fee'],
    paid: ['paid', 'paidamount']
  };

  const mapping = {}; // { rawHeader: fieldKey }

  for (const h of rawHeaders) {
    const norm = normalize(h);
    let matchedKey = null;

    // Direct match with field.k or field.l
    for (const f of fields) {
      if (norm === normalize(f.k) || norm === normalize(f.l)) {
        matchedKey = f.k;
        break;
      }
    }

    // Match with aliases
    if (!matchedKey) {
      for (const [key, aliasList] of Object.entries(aliases)) {
        if (aliasList.some(a => norm.includes(a) || a.includes(norm))) {
          // verify field exists
          if (fields.some(f => f.k === key) || key === 'name' || key === 'title') {
            matchedKey = key;
            break;
          }
        }
      }
    }

    if (matchedKey) {
      mapping[h] = matchedKey;
    }
  }

  return mapping;
}

/**
 * Validate imported rows against entity requirements
 */
export function validateImportRows(rawRows = [], columnMapping = {}, fields = [], entityKey = '') {
  const reqFields = fields.filter(f => f.req).map(f => f.k);

  const processed = rawRows.map((rawRow, index) => {
    const item = {};
    for (const [header, fieldKey] of Object.entries(columnMapping)) {
      if (rawRow[header] !== undefined) {
        let val = rawRow[header];
        if (typeof val === 'string') val = val.trim();
        item[fieldKey] = val;
      }
    }

    // Special type casts: numbers or arrays
    if (item.classes && typeof item.classes === 'string') {
      item.classes = item.classes.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (item.copies !== undefined) item.copies = Number(item.copies) || 0;
    if (item.issued !== undefined) item.issued = Number(item.issued) || 0;
    if (item.amount !== undefined) item.amount = Number(item.amount) || 0;
    if (item.paid !== undefined) item.paid = Number(item.paid) || 0;

    // Check required fields
    const missing = reqFields.filter(k => item[k] === undefined || item[k] === '');
    const isValid = missing.length === 0;

    return {
      index: index + 1,
      raw: rawRow,
      item,
      isValid,
      missing,
      errorMsg: isValid ? null : `Missing required field(s): ${missing.join(', ')}`
    };
  });

  const validRows = processed.filter(r => r.isValid);
  const invalidRows = processed.filter(r => !r.isValid);

  return {
    rows: processed,
    validRows: validRows.map(r => r.item),
    validCount: validRows.length,
    invalidCount: invalidRows.length,
    totalCount: processed.length
  };
}

