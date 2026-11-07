import { useRef, useState } from 'react';
import { api } from '../api/index.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { Modal } from './Modal.jsx';
import {
  exportToExcel,
  exportToPdf,
  exportToCsv,
  exportToWord,
  downloadImportTemplate,
  parseImportFile,
  matchImportColumns,
  validateImportRows
} from '../utils/exportImport.js';

export function ExportImportControls({
  entityKey,
  title = 'Data',
  columns = [],
  data = [],
  fields = [],
  canImport = true,
  onImport,
  onImportComplete,
  notify = () => {}
}) {
  const { school, year } = useSettings();
  const fileInputRef = useRef(null);

  const [importState, setImportState] = useState(null);
  // importState: {
  //   file, fileName, totalRows, columnMapping, previewRows, validRows, validCount, invalidCount, skipInvalid
  // }
  const [busy, setBusy] = useState(false);
  const [importErr, setImportErr] = useState('');

  const handleSelectChange = async e => {
    const val = e.target.value;
    // Immediately reset the select element so it always displays the placeholder
    e.target.value = '';
    if (!val) return;

    const baseName = `${entityKey || 'records'}_${new Date().toISOString().slice(0, 10)}`;

    try {
      if (val === 'export_excel') {
        if (!data || data.length === 0) {
          notify('No data available to export.', 'error');
          return;
        }
        exportToExcel({
          filename: baseName,
          title: `${title} List`,
          columns,
          data,
          schoolName: school
        });
        notify(`📊 Exported ${data.length} records to Excel (.xlsx)!`, 'success');
      } else if (val === 'export_pdf') {
        if (!data || data.length === 0) {
          notify('No data available to export.', 'error');
          return;
        }
        exportToPdf({
          filename: baseName,
          title: `${title} Report`,
          columns,
          data,
          schoolName: school,
          academicYear: year
        });
        notify(`📑 Exported ${data.length} records to PDF (.pdf)!`, 'success');
      } else if (val === 'export_csv') {
        if (!data || data.length === 0) {
          notify('No data available to export.', 'error');
          return;
        }
        exportToCsv({
          filename: baseName,
          columns,
          data
        });
        notify(`📄 Exported ${data.length} records to CSV (.csv)!`, 'success');
      } else if (val === 'export_word') {
        if (!data || data.length === 0) {
          notify('No data available to export.', 'error');
          return;
        }
        exportToWord({
          filename: baseName,
          title: `${title} Records`,
          columns,
          data,
          schoolName: school,
          academicYear: year
        });
        notify(`📝 Exported ${data.length} records to Word document (.doc)!`, 'success');
      } else if (val === 'import_file') {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
          fileInputRef.current.click();
        }
      } else if (val === 'template_csv') {
        downloadImportTemplate({
          entityKey,
          filename: `${entityKey}_import_template`,
          format: 'csv',
          fields
        });
        notify('📋 Downloaded CSV template!', 'success');
      } else if (val === 'template_excel') {
        downloadImportTemplate({
          entityKey,
          filename: `${entityKey}_import_template`,
          format: 'xlsx',
          fields
        });
        notify('📊 Downloaded Excel template!', 'success');
      }
    } catch (err) {
      console.error('Export/Import error:', err);
      notify(`Operation failed: ${err.message}`, 'error');
    }
  };

  const handleFileChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportErr('');
    try {
      const { rawHeaders, rows } = await parseImportFile(file);
      if (!rows || rows.length === 0) {
        notify('The selected file has no records to import.', 'error');
        return;
      }

      // Match columns
      const mapping = matchImportColumns(rawHeaders, fields, entityKey);
      const validation = validateImportRows(rows, mapping, fields, entityKey);

      setImportState({
        file,
        fileName: file.name,
        rawHeaders,
        mapping,
        previewRows: validation.rows.slice(0, 5),
        allRows: validation.rows,
        validRows: validation.validRows,
        validCount: validation.validCount,
        invalidCount: validation.invalidCount,
        totalCount: validation.totalCount,
        skipInvalid: true
      });
    } catch (err) {
      console.error('File parsing error:', err);
      notify(`Could not parse file: ${err.message}`, 'error');
    }
  };

  const handleConfirmImport = async () => {
    if (!importState) return;
    const { validRows, validCount, invalidCount, skipInvalid } = importState;

    if (!skipInvalid && invalidCount > 0) {
      setImportErr(`Please fix the ${invalidCount} invalid row(s) or check "Skip invalid rows" to proceed.`);
      return;
    }

    if (validCount === 0) {
      setImportErr('No valid records found to import.');
      return;
    }

    setBusy(true);
    setImportErr('');
    try {
      if (onImport) {
        await onImport(validRows);
      } else {
        await api(`/${entityKey}/batch`, {
          method: 'POST',
          body: { items: validRows }
        });
      }

      notify(`🎉 Successfully imported ${validCount} ${title.toLowerCase()}!`, 'success');
      setImportState(null);
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      console.error('Import submit error:', err);
      setImportErr(err.message || 'Import failed. Check column values and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="export-import-wrap" style={{ display: 'inline-flex', alignItems: 'center' }}>
        <select
          className="export-import-select"
          aria-label={`Export or Import ${title}`}
          value=""
          onChange={handleSelectChange}
          title="Export or Import data (Excel, PDF, CSV, Word)"
        >
          <option value="" disabled hidden>
            ⚙️ Export / Import ▾
          </option>
          <optgroup label="📤 Export Data">
            <option value="export_excel">📊 Export to Excel (.xlsx)</option>
            <option value="export_pdf">📑 Export to PDF (.pdf)</option>
            <option value="export_csv">📄 Export to CSV (.csv)</option>
            <option value="export_word">📝 Export to Word (.doc)</option>
          </optgroup>
          {canImport && (
            <optgroup label="📥 Import Data">
              <option value="import_file">📥 Import File (Excel / CSV)</option>
              <option value="template_csv">📋 Download Template (CSV)</option>
              <option value="template_excel">📊 Download Template (Excel)</option>
            </optgroup>
          )}
        </select>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {/* Import Confirmation & Preview Modal */}
      {importState && (
        <Modal
          title={`📥 Import ${title} - Preview & Confirm`}
          onClose={() => !busy && setImportState(null)}
        >
          <div style={{ padding: '4px 0' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
                padding: '10px 14px',
                background: 'var(--hv)',
                borderRadius: 8,
                marginBottom: 14
              }}
            >
              <div>
                <strong style={{ fontSize: '0.95rem' }}>📄 {importState.fileName}</strong>
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
                  Total detected rows: <strong>{importState.totalCount}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    background: '#dcfce7',
                    color: '#15803d'
                  }}
                >
                  ✓ {importState.validCount} Valid
                </span>
                {importState.invalidCount > 0 && (
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      background: '#fee2e2',
                      color: '#b91c1c'
                    }}
                  >
                    ⚠ {importState.invalidCount} Invalid
                  </span>
                )}
              </div>
            </div>

            {/* Column Mapping Badges */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, color: 'var(--tx)' }}>
                Detected Column Mappings:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(importState.mapping).map(([rawCol, fieldKey]) => {
                  const fDef = fields.find(f => f.k === fieldKey);
                  return (
                    <span
                      key={rawCol}
                      style={{
                        fontSize: '0.78rem',
                        padding: '3px 8px',
                        background: 'var(--sf)',
                        border: '1px solid var(--bd)',
                        borderRadius: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <span className="muted">"{rawCol}"</span>
                      <span>➔</span>
                      <strong>{fDef ? fDef.l : fieldKey}</strong>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Preview Table */}
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, color: 'var(--tx)' }}>
              Data Preview (First {importState.previewRows.length} rows):
            </div>
            <div className="tw" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
              <table className="rt" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th style={{ width: 70 }}>Status</th>
                    {fields.map(f => (
                      <th key={f.k}>{f.l}{f.req ? ' *' : ''}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importState.previewRows.map(pRow => (
                    <tr key={pRow.index} style={!pRow.isValid ? { background: '#fef2f2' } : {}}>
                      <td>{pRow.index}</td>
                      <td>
                        {pRow.isValid ? (
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Valid</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 600 }} title={pRow.errorMsg}>
                            ⚠ Error
                          </span>
                        )}
                      </td>
                      {fields.map(f => (
                        <td key={f.k} style={f.req && !pRow.item[f.k] ? { color: '#dc2626', fontWeight: 600 } : {}}>
                          {String(pRow.item[f.k] ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Validation warning */}
            {importState.invalidCount > 0 && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  color: '#991b1b',
                  fontSize: '0.82rem',
                  marginBottom: 12
                }}
              >
                <strong>Warning:</strong> {importState.invalidCount} row(s) are missing required values.
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={importState.skipInvalid}
                    onChange={e =>
                      setImportState(prev => ({ ...prev, skipInvalid: e.target.checked }))
                    }
                  />
                  Skip invalid rows and import {importState.validCount} valid record(s).
                </label>
              </div>
            )}

            {importErr && (
              <p className="err" role="alert" style={{ marginBottom: 12 }}>
                {importErr}
              </p>
            )}

            <div className="acts" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setImportState(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn pr"
                disabled={busy || (importState.validCount === 0) || (!importState.skipInvalid && importState.invalidCount > 0)}
                onClick={handleConfirmImport}
              >
                {busy
                  ? 'Importing...'
                  : `Confirm & Import ${importState.validCount} ${title}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

