import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { api } from '../api/index.js';
import { Badge, Skeleton, Toast } from '../components/index.js';

export default function Profile() {
  const { user, permissions, updateUser } = useAuth();
  const { settings } = useSettings();
  const { t } = useLang();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'institutional' | 'security'
  const [isEditing, setIsEditing] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  // Editable Form State
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    address: '',
    gender: '',
    dob: '',
    emergencyContact: '',
    emergencyPhone: ''
  });

  // Password Change State
  const [pwdForm, setPwdForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdFeedback, setPwdFeedback] = useState({ type: '', text: '' });

  // Session Timeout State
  const [sessionTimeout, setSessionTimeout] = useState(() => {
    return localStorage.getItem('session_timeout') || '2';
  });

  // Avatar Upload State
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Fetch full detailed profile from backend
  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await api('/profile');
      setProfile(data);
      setForm({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        bio: data.bio || '',
        address: data.address || '',
        gender: data.gender || '',
        dob: data.dob || '',
        emergencyContact: data.emergencyContact || '',
        emergencyPhone: data.emergencyPhone || ''
      });
      // Synchronize AuthContext with any newly enriched attributes
      updateUser({
        name: data.name,
        email: data.email,
        phone: data.phone,
        avatar: data.avatar,
        bio: data.bio,
        address: data.address,
        gender: data.gender,
        dob: data.dob
      });
    } catch (err) {
      setErrMsg(err.message || 'Failed to load profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // Helper to resize/compress images in browser before upload
  const processImageFile = file => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        return reject(new Error('Selected file must be an image (JPEG, PNG, WebP).'));
      }
      if (file.size > 10 * 1024 * 1024) {
        return reject(new Error('File size exceeds 10MB limit.'));
      }

      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 600;
          let { width, height } = img;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Failed to parse image file.'));
        img.src = ev.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  };

  // Handle Photo Upload
  const handlePhotoSelect = async file => {
    if (!file) return;
    try {
      setUploadingAvatar(true);
      setErrMsg('');
      const base64Data = await processImageFile(file);

      // Save to backend immediately
      const res = await api('/profile/avatar', {
        method: 'POST',
        body: { avatar: base64Data }
      });

      // Update local profile and AuthContext
      setProfile(prev => ({ ...prev, avatar: res.avatar }));
      updateUser({ avatar: res.avatar });
      setToastMsg('Profile photo updated successfully!');
    } catch (err) {
      setErrMsg(err.message || 'Failed to upload photo.');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Photo Removal
  const handleRemovePhoto = async () => {
    try {
      setUploadingAvatar(true);
      await api('/profile/avatar', {
        method: 'POST',
        body: { avatar: null }
      });
      setProfile(prev => ({ ...prev, avatar: null }));
      updateUser({ avatar: null });
      setToastMsg('Profile photo removed.');
    } catch (err) {
      setErrMsg(err.message || 'Failed to remove photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Drag and Drop handlers
  const handleDrag = e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handlePhotoSelect(e.dataTransfer.files[0]);
    }
  };

  // Handle Profile Details Save
  const handleSaveProfile = async e => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      setErrMsg('');

      const res = await api('/profile', {
        method: 'PUT',
        body: form
      });

      setProfile(prev => ({ ...prev, ...res.user }));
      updateUser(res.user);
      setIsEditing(false);
      setToastMsg('Profile information updated successfully!');
    } catch (err) {
      setErrMsg(err.message || 'Failed to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  // Handle Password Change
  const handlePasswordChange = async e => {
    e.preventDefault();
    setPwdFeedback({ type: '', text: '' });

    if (!pwdForm.currentPassword || !pwdForm.newPassword || !pwdForm.confirmPassword) {
      setPwdFeedback({ type: 'err', text: 'All password fields are required.' });
      return;
    }
    if (pwdForm.newPassword.length < 6) {
      setPwdFeedback({ type: 'err', text: 'New password must be at least 6 characters long.' });
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdFeedback({ type: 'err', text: 'New password and confirmation do not match.' });
      return;
    }

    try {
      setPwdLoading(true);
      const res = await api('/profile/password', {
        method: 'PUT',
        body: {
          currentPassword: pwdForm.currentPassword,
          newPassword: pwdForm.newPassword
        }
      });
      setPwdFeedback({ type: 'ok', text: res.message || 'Password changed successfully!' });
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setToastMsg('Password changed successfully.');
    } catch (err) {
      setPwdFeedback({ type: 'err', text: err.message || 'Password update failed.' });
    } finally {
      setPwdLoading(false);
    }
  };

  // Handle Timeout Change
  const handleTimeoutChange = e => {
    const val = e.target.value;
    setSessionTimeout(val);
    localStorage.setItem('session_timeout', val);
    setToastMsg(`Session idle timeout set to ${val === '0' ? 'Disabled' : `${val} Minutes`}.`);
  };

  if (loading) {
    return (
      <div className="profile-page-container">
        <Skeleton style={{ height: 200, borderRadius: 16 }} />
        <Skeleton style={{ height: 400, borderRadius: 16 }} />
      </div>
    );
  }

  const role = (profile?.role || user?.role || 'admin').toLowerCase();
  const displayName = profile?.name || user?.name || profile?.username || 'User';
  const displayEmail = profile?.email || `${profile?.username || 'user'}@school.com`;
  const initial = (displayName.charAt(0) || 'U').toUpperCase();
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const accountId = profile?.studentId || profile?.teacherId || profile?.parentId || profile?.id || 'U_01';

  return (
    <div className="profile-page-container">
      {/* Toast Notification */}
      {toastMsg && <Toast msg={toastMsg} onClose={() => setToastMsg('')} />}

      {/* Error Alert */}
      {errMsg && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--dgs)',
          color: 'var(--dg)',
          borderRadius: 10,
          border: '1px solid var(--dg)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>⚠️ {errMsg}</span>
          <button type="button" className="btn sm" onClick={() => setErrMsg('')}>Dismiss</button>
        </div>
      )}

      {/* ── 1. Hero Identity Banner & Card ─────────────────────────────────── */}
      <div className="profile-hero-card">
        <div className="profile-hero-banner" />
        <div className="profile-hero-content">
          {/* Avatar with Camera upload button */}
          <div
            className={`profile-avatar-box ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="profile-avatar-large">
              {profile?.avatar ? (
                <img src={profile.avatar} alt={displayName} />
              ) : (
                <span>{initial}</span>
              )}
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/webp, image/gif"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handlePhotoSelect(e.target.files[0])}
            />

            {/* Camera Overlay Icon */}
            <button
              type="button"
              className="profile-avatar-camera-btn"
              title="Upload new profile picture"
              aria-label="Upload profile photo"
              disabled={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingAvatar ? (
                <span style={{ fontSize: 13 }}>⌛</span>
              ) : (
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </button>
          </div>

          {/* User metadata & details */}
          <div className="profile-hero-meta">
            <h1 className="profile-name-title">
              {displayName}
              <span className={`profile-role-pill ${role}`}>{roleLabel}</span>
            </h1>

            <div className="profile-hero-sub">
              <span className="profile-hero-sub-item">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                @{profile?.username || user?.username}
              </span>

              <span className="profile-hero-sub-item">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                {displayEmail}
              </span>

              <span className="profile-hero-sub-item">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                ID: <strong>{accountId}</strong>
              </span>

              {profile?.createdAt && (
                <span className="profile-hero-sub-item">
                  Member since {new Date(profile.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Hero Quick Actions */}
          <div className="profile-hero-actions">
            <button
              type="button"
              className="btn sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {profile?.avatar ? 'Change Photo' : 'Upload Photo'}
            </button>

            {profile?.avatar && (
              <button
                type="button"
                className="btn sm dg"
                title="Remove current avatar"
                onClick={handleRemovePhoto}
                disabled={uploadingAvatar}
              >
                Remove Photo
              </button>
            )}

            {!isEditing ? (
              <button
                type="button"
                className="btn sm pr"
                onClick={() => setIsEditing(true)}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Edit Profile
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn sm pr"
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Navigation Tabs ─────────────────────────────────────────────── */}
      <div className="profile-tab-nav" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'personal'}
          className={`profile-tab-btn ${activeTab === 'personal' ? 'active' : ''}`}
          onClick={() => setActiveTab('personal')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Personal & Contact Details
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'institutional'}
          className={`profile-tab-btn ${activeTab === 'institutional' ? 'active' : ''}`}
          onClick={() => setActiveTab('institutional')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
          {role === 'teacher' ? 'Teaching & Class Info' :
           role === 'student' ? 'Academic & Attendance Record' :
           role === 'parent' ? 'Family & Student Links' : 'System & Institution Privileges'}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'security'}
          className={`profile-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Security & Preferences
        </button>
      </div>

      {/* ── 3. Tab Contents ────────────────────────────────────────────────── */}

      {/* TAB 1: Personal & Contact Information */}
      {activeTab === 'personal' && (
        <div className="profile-grid-2col">
          {/* Main Info Card */}
          <div className="profile-card">
            <div className="profile-card-head">
              <h2 className="profile-card-title">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Personal Profile
              </h2>
              <span className="muted" style={{ fontSize: 13 }}>
                {isEditing ? 'Editing Mode' : 'Read-only Mode'}
              </span>
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="profile-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="profile-field-group">
                  <label htmlFor="pf-name">Full Name *</label>
                  <input
                    id="pf-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter your full name"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="profile-field-group">
                    <label htmlFor="pf-email">Email Address</label>
                    <input
                      id="pf-email"
                      type="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="e.g. name@school.com"
                    />
                  </div>

                  <div className="profile-field-group">
                    <label htmlFor="pf-phone">Phone Number</label>
                    <input
                      id="pf-phone"
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      placeholder="e.g. +251 91 123 4567"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="profile-field-group">
                    <label htmlFor="pf-gender">Gender</label>
                    <select
                      id="pf-gender"
                      value={form.gender}
                      onChange={e => setForm({ ...form, gender: e.target.value })}
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>

                  <div className="profile-field-group">
                    <label htmlFor="pf-dob">Date of Birth</label>
                    <input
                      id="pf-dob"
                      type="date"
                      value={form.dob}
                      onChange={e => setForm({ ...form, dob: e.target.value })}
                    />
                  </div>
                </div>

                <div className="profile-field-group">
                  <label htmlFor="pf-address">Residential / Postal Address</label>
                  <input
                    id="pf-address"
                    type="text"
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                    placeholder="e.g. House 42, Addis Ababa"
                  />
                </div>

                <div className="profile-field-group">
                  <label htmlFor="pf-bio">About / Bio</label>
                  <textarea
                    id="pf-bio"
                    rows="3"
                    value={form.bio}
                    onChange={e => setForm({ ...form, bio: e.target.value })}
                    placeholder="Write a brief bio or description about yourself..."
                  />
                </div>

                <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn pr" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Profile Details'}
                  </button>
                  <button type="button" className="btn" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-info-list">
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Full Name</span>
                  <span className="profile-info-val">{profile?.name || '—'}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Username</span>
                  <span className="profile-info-val">@{profile?.username}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Email</span>
                  <span className="profile-info-val">{profile?.email || '—'}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Phone</span>
                  <span className="profile-info-val">{profile?.phone || '—'}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Gender</span>
                  <span className="profile-info-val">{profile?.gender || '—'}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Date of Birth</span>
                  <span className="profile-info-val">{profile?.dob || '—'}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Address</span>
                  <span className="profile-info-val">{profile?.address || '—'}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-lbl">About / Bio</span>
                  <span className="profile-info-val">{profile?.bio || 'No bio provided yet.'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Emergency & Safety Contact Card */}
          <div className="profile-card">
            <div className="profile-card-head">
              <h2 className="profile-card-title">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Emergency Contact Details
              </h2>
            </div>

            <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
              In the event of an urgent notice or campus emergency, school administrators will reach out to this contact.
            </p>

            {isEditing ? (
              <div className="profile-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="profile-field-group">
                  <label htmlFor="pf-em-name">Emergency Contact Name</label>
                  <input
                    id="pf-em-name"
                    type="text"
                    value={form.emergencyContact}
                    onChange={e => setForm({ ...form, emergencyContact: e.target.value })}
                    placeholder="e.g. Dr. Abebe Kebede"
                  />
                </div>

                <div className="profile-field-group">
                  <label htmlFor="pf-em-phone">Emergency Phone Number</label>
                  <input
                    id="pf-em-phone"
                    type="tel"
                    value={form.emergencyPhone}
                    onChange={e => setForm({ ...form, emergencyPhone: e.target.value })}
                    placeholder="e.g. +251 92 345 6789"
                  />
                </div>
              </div>
            ) : (
              <div className="profile-info-list">
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Contact Person</span>
                  <span className="profile-info-val">{profile?.emergencyContact || 'Not specified'}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Contact Phone</span>
                  <span className="profile-info-val">{profile?.emergencyPhone || 'Not specified'}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-lbl">Contact Protocol</span>
                  <span className="profile-info-val" style={{ color: '#16a34a' }}>Direct Telephone & SMS Notification</span>
                </div>
              </div>
            )}

            {/* Photo Upload Dropzone Reminder */}
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Profile Picture Upload</h3>
              <div
                className="profile-photo-dropzone"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="var(--ac)" strokeWidth="1.8">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  Click to select or drag and drop a new picture
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  PNG, JPG, WebP or GIF up to 10MB
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Institutional / Role-Specific Details */}
      {activeTab === 'institutional' && (
        <div>
          {/* TEACHER PROFILE DETAILS */}
          {role === 'teacher' && (
            <div className="profile-grid-2col">
              <div className="profile-card">
                <div className="profile-card-head">
                  <h2 className="profile-card-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                    Teaching Faculty Details
                  </h2>
                  <Badge val={profile.roleDetails?.status || 'Active'} />
                </div>

                <div className="profile-stats-grid" style={{ marginBottom: 16 }}>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Teacher ID</span>
                    <span className="profile-stat-box-num" style={{ fontSize: 18 }}>
                      {profile.roleDetails?.teacherId || profile.teacherId || 'T01'}
                    </span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Subject</span>
                    <span className="profile-stat-box-num" style={{ fontSize: 18 }}>
                      {profile.roleDetails?.subject || 'Mathematics'}
                    </span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Students</span>
                    <span className="profile-stat-box-num">
                      {profile.roleDetails?.totalStudents || 0}
                    </span>
                  </div>
                </div>

                <div className="profile-info-list">
                  <div className="profile-info-row">
                    <span className="profile-info-lbl">Assigned Classes</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(profile.roleDetails?.classes || ['7A', '8A']).map(cls => (
                        <span
                          key={cls}
                          style={{
                            padding: '3px 9px',
                            borderRadius: 6,
                            background: 'var(--acs)',
                            color: 'var(--ac)',
                            fontWeight: 700,
                            fontSize: 12
                          }}
                        >
                          Class {cls}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="profile-info-row">
                    <span className="profile-info-lbl">Department</span>
                    <span className="profile-info-val">Science & Mathematics Faculty</span>
                  </div>
                  <div className="profile-info-row">
                    <span className="profile-info-lbl">Weekly Classes</span>
                    <span className="profile-info-val">{profile.roleDetails?.scheduleCount || 4} Periods Scheduled</span>
                  </div>
                </div>
              </div>

              <div className="profile-card">
                <div className="profile-card-head">
                  <h2 className="profile-card-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Class & Timetable Schedule
                  </h2>
                </div>

                {profile.roleDetails?.schedule && profile.roleDetails.schedule.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {profile.roleDetails.schedule.map((sc, i) => (
                      <div
                        key={sc.id || i}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          background: 'var(--hv)',
                          border: '1px solid var(--bd)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <strong>{sc.day}</strong> — Class {sc.cls} ({sc.subject})
                        </div>
                        <span className="badge sm">{sc.period}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    Standard full-time teaching timetable active. Check the Timetable module for detailed day-by-day periods.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STUDENT PROFILE DETAILS */}
          {role === 'student' && (
            <div className="profile-grid-2col">
              <div className="profile-card">
                <div className="profile-card-head">
                  <h2 className="profile-card-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                      <path d="M6 12v5c3 3 9 3 12 0v-5" />
                    </svg>
                    Student Academic Information
                  </h2>
                  <Badge val={profile.roleDetails?.status || 'Active'} />
                </div>

                <div className="profile-stats-grid" style={{ marginBottom: 16 }}>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Student ID</span>
                    <span className="profile-stat-box-num" style={{ fontSize: 18 }}>
                      {profile.roleDetails?.studentId || 'S1034'}
                    </span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Current Class</span>
                    <span className="profile-stat-box-num" style={{ fontSize: 18 }}>
                      {profile.roleDetails?.cls || '8B'}
                    </span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Attendance</span>
                    <span className="profile-stat-box-num">
                      {profile.roleDetails?.attendanceStats?.rate ?? 95}%
                    </span>
                  </div>
                </div>

                <div className="profile-info-list">
                  <div className="profile-info-row">
                    <span className="profile-info-lbl">Homeroom Class</span>
                    <span className="profile-info-val">Class {profile.roleDetails?.cls || '8B'}</span>
                  </div>
                  {profile.roleDetails?.classInfo?.class_teacher_name && (
                    <div className="profile-info-row">
                      <span className="profile-info-lbl">Class Teacher</span>
                      <span className="profile-info-val">{profile.roleDetails.classInfo.class_teacher_name}</span>
                    </div>
                  )}
                  <div className="profile-info-row">
                    <span className="profile-info-lbl">Guardian / Parent</span>
                    <span className="profile-info-val">
                      {profile.roleDetails?.guardians?.[0]?.name ? (
                        `${profile.roleDetails.guardians[0].name} (${profile.roleDetails.guardians[0].relationship || 'Guardian'})`
                      ) : (
                        'Registered Guardian'
                      )}
                    </span>
                  </div>
                  <div className="profile-info-row">
                    <span className="profile-info-lbl">Tuition & Fees</span>
                    <span className="profile-info-val">
                      Balance: <strong>${profile.roleDetails?.feeStats?.balance || 0}</strong>{' '}
                      <span style={{ fontSize: 12, marginLeft: 6 }}>
                        ({profile.roleDetails?.feeStats?.status || 'Paid'})
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Attendance & Subject Marks Snapshot */}
              <div className="profile-card">
                <div className="profile-card-head">
                  <h2 className="profile-card-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    Performance & Subject Marks
                  </h2>
                  <span className="badge">
                    Avg: {profile.roleDetails?.academicStats?.averageScore || 82}%
                  </span>
                </div>

                {profile.roleDetails?.academicStats?.marks && profile.roleDetails.academicStats.marks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {profile.roleDetails.academicStats.marks.map(m => (
                      <div
                        key={m.subject}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: 'var(--hv)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{m.subject_name || m.subject}</span>
                        <span
                          style={{
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: m.mark >= 75 ? 'var(--acs)' : 'var(--wns)',
                            color: m.mark >= 75 ? 'var(--ac)' : 'var(--wn)'
                          }}
                        >
                          {m.mark}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    Official exam results and grade reports are available in the Exams & Results tab.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PARENT PROFILE DETAILS */}
          {role === 'parent' && (
            <div className="profile-card">
              <div className="profile-card-head">
                <h2 className="profile-card-title">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Registered Children / Students Under Care
                </h2>
                <span className="badge">
                  {profile.roleDetails?.childrenCount || profile.roleDetails?.children?.length || 0} Linked
                </span>
              </div>

              {profile.roleDetails?.children && profile.roleDetails.children.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  {profile.roleDetails.children.map(ch => (
                    <div
                      key={ch.id}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        background: 'var(--hv)',
                        border: '1px solid var(--bd)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <div className="user-avatar-circle" style={{ width: 42, height: 42, fontSize: 16 }}>
                          {(ch.name?.charAt(0) || 'S').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{ch.name}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            Class {ch.cls} · ID: {ch.id}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--bd)', paddingTop: 8 }}>
                        <span className="muted">Tuition Balance:</span>
                        <strong style={{ color: ch.feeDue > 0 ? 'var(--dg)' : 'var(--ac)' }}>
                          ${ch.feeDue ?? 0} ({ch.feeStatus || 'Paid'})
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  No students are currently linked to this guardian ID. Contact school administration if you need to associate student records.
                </p>
              )}
            </div>
          )}

          {/* ADMINISTRATOR DETAILS */}
          {role === 'admin' && (
            <div className="profile-grid-2col">
              <div className="profile-card">
                <div className="profile-card-head">
                  <h2 className="profile-card-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                    School System Administration
                  </h2>
                  <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>
                    Superuser
                  </span>
                </div>

                <div className="profile-stats-grid" style={{ marginBottom: 16 }}>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Students</span>
                    <span className="profile-stat-box-num">{profile.roleDetails?.stats?.totalStudents || 0}</span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Teachers</span>
                    <span className="profile-stat-box-num">{profile.roleDetails?.stats?.totalTeachers || 0}</span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Classes</span>
                    <span className="profile-stat-box-num">{profile.roleDetails?.stats?.totalClasses || 0}</span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="profile-stat-box-lbl">Accounts</span>
                    <span className="profile-stat-box-num">{profile.roleDetails?.stats?.totalUsers || 0}</span>
                  </div>
                </div>

                <div className="profile-info-list">
                  <div className="profile-info-row">
                    <span className="profile-info-lbl">School Name</span>
                    <span className="profile-info-val">{profile.roleDetails?.schoolName || settings.school}</span>
                  </div>
                  <div className="profile-info-row">
                    <span className="profile-info-lbl">Academic Year</span>
                    <span className="profile-info-val">{profile.roleDetails?.academicYear || settings.year}</span>
                  </div>
                  <div className="profile-info-row">
                    <span className="profile-info-lbl">Security Session</span>
                    <span className="profile-info-val" style={{ color: '#16a34a' }}>Active & Monitored</span>
                  </div>
                </div>
              </div>

              {/* Module Privileges Matrix */}
              <div className="profile-card">
                <div className="profile-card-head">
                  <h2 className="profile-card-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Module Access Matrix
                  </h2>
                </div>

                <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 14 }}>
                  As Administrator, you possess unrestricted administrative control and full read/write capabilities across all institutional subsystems:
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    'Dashboard', 'Students', 'Teachers', 'Classes', 'Subjects',
                    'Attendance', 'Exams & Results', 'Assignments', 'Fees & Billing',
                    'Parents', 'Timetable', 'Library', 'Reports', 'System Settings'
                  ].map(mod => (
                    <span
                      key={mod}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        background: 'var(--acs)',
                        color: 'var(--ac)',
                        fontWeight: 600,
                        border: '1px solid var(--ac)'
                      }}
                    >
                      ✓ {mod}: Full Access
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Security & Session Preferences */}
      {activeTab === 'security' && (
        <div className="profile-grid-2col">
          {/* Change Password Card */}
          <div className="profile-card">
            <div className="profile-card-head">
              <h2 className="profile-card-title">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Change Account Password
              </h2>
            </div>

            {pwdFeedback.text && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13.5,
                fontWeight: 600,
                background: pwdFeedback.type === 'err' ? 'var(--dgs)' : 'var(--acs)',
                color: pwdFeedback.type === 'err' ? 'var(--dg)' : 'var(--ac)',
                border: `1px solid ${pwdFeedback.type === 'err' ? 'var(--dg)' : 'var(--ac)'}`
              }}>
                {pwdFeedback.text}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="profile-form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="profile-field-group">
                <label htmlFor="pf-cur-pwd">Current Password</label>
                <input
                  id="pf-cur-pwd"
                  type="password"
                  required
                  value={pwdForm.currentPassword}
                  onChange={e => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                  placeholder="Enter current password"
                />
              </div>

              <div className="profile-field-group">
                <label htmlFor="pf-new-pwd">New Password</label>
                <input
                  id="pf-new-pwd"
                  type="password"
                  required
                  value={pwdForm.newPassword}
                  onChange={e => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                  placeholder="At least 6 characters"
                />
              </div>

              <div className="profile-field-group">
                <label htmlFor="pf-conf-pwd">Confirm New Password</label>
                <input
                  id="pf-conf-pwd"
                  type="password"
                  required
                  value={pwdForm.confirmPassword}
                  onChange={e => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                  placeholder="Re-enter new password"
                />
              </div>

              <div style={{ marginTop: 8 }}>
                <button type="submit" className="btn pr" disabled={pwdLoading}>
                  {pwdLoading ? 'Updating Password...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Session Timeout Policy Card */}
          <div className="profile-card">
            <div className="profile-card-head">
              <h2 className="profile-card-title">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#2563eb" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Workstation Session Security
              </h2>
              <span className="badge">
                {sessionTimeout === '0' ? 'Off' : `${sessionTimeout} min`}
              </span>
            </div>

            <p className="muted" style={{ fontSize: 13.5, marginTop: 0, marginBottom: 14 }}>
              Configures automatic logout when your terminal or workstation remains idle without keyboard or mouse input:
            </p>

            <div className="profile-field-group" style={{ marginBottom: 20 }}>
              <label htmlFor="pf-session-select">Inactivity Timeout Policy</label>
              <select
                id="pf-session-select"
                value={sessionTimeout}
                onChange={handleTimeoutChange}
              >
                <option value="2">2 Minutes (Default School Policy)</option>
                <option value="5">5 Minutes</option>
                <option value="15">15 Minutes</option>
                <option value="30">30 Minutes</option>
                <option value="60">1 Hour</option>
                <option value="0">Disabled (Never Auto-Sign Out)</option>
              </select>
            </div>

            <div className="profile-info-list" style={{ borderTop: '1px solid var(--bd)', paddingTop: 14 }}>
              <div className="profile-info-row">
                <span className="profile-info-lbl">Authentication</span>
                <span className="profile-info-val">JSON Web Token (JWT 8h)</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-lbl">Security Audit</span>
                <span className="profile-info-val" style={{ color: '#16a34a' }}>Logged in PostgreSQL Audit Ledger</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-lbl">Storage Mode</span>
                <span className="profile-info-val">Persistent Encrypted Supabase Backend</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
