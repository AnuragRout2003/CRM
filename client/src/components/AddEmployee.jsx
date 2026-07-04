import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = '/api/employees';

export default function AddEmployee() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [form, setForm] = useState({ name: '', dailyWage: '' });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate type
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      showToast('Only JPEG, PNG, WebP, GIF images allowed', 'error');
      return;
    }
    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB', 'error');
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      showToast('Employee name is required', 'error');
      return;
    }
    if (!form.dailyWage || parseFloat(form.dailyWage) <= 0) {
      showToast('Enter a valid daily wage', 'error');
      return;
    }
    if (!imageFile) {
      showToast('Profile picture is required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', form.name.trim());
      formData.append('dailyWage', form.dailyWage);
      formData.append('profilePicture', imageFile);

      await axios.post(API, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast(`${form.name} added successfully!`);
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add employee', 'error');
      setSubmitting(false);
    }
  };

  return (
    <div className="main-content">
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.message}</div>
        </div>
      )}

      <button className="back-link" onClick={() => navigate('/')}>
        ← Back to Dashboard
      </button>

      <div className="page-header">
        <h1>Add New Employee</h1>
        <p>Enter employee details to start tracking</p>
      </div>

      <div className="card" style={{ maxWidth: '520px' }}>
        <div className="card-header">
          <h2>Employee Information</h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            {/* Profile Picture Upload */}
            <div className="form-group">
              <label className="form-label">Profile Picture *</label>
              <div
                className="avatar-upload-area"
                onClick={() => fileRef.current?.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="avatar-preview" />
                ) : (
                  <div className="avatar-placeholder">
                    <span className="avatar-placeholder-icon">📷</span>
                    <span className="avatar-placeholder-text">Click to upload photo</span>
                    <span className="avatar-placeholder-hint">JPEG, PNG, WebP • Max 5MB</span>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="name">Employee Name * (must be unique)</label>
              <input
                id="name" name="name" type="text" className="form-input"
                placeholder="Enter full name" value={form.name}
                onChange={handleChange} autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="dailyWage">Daily Wage (₹) *</label>
              <input
                id="dailyWage" name="dailyWage" type="number" className="form-input"
                placeholder="e.g. 500" min="1" value={form.dailyWage}
                onChange={handleChange}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Adding...' : '➕ Add Employee'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
