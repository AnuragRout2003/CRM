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
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.message}</div>
        </div>
      )}

      {/* Back Button */}
      <button
        className="mb-6 inline-flex items-center gap-1.5 rounded-lg bg-white px-4 min-h-[44px] text-sm font-medium text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-50 hover:text-sky-600 transition-all duration-200 active:scale-95"
        onClick={() => navigate('/')}
      >
        ← Back to Dashboard
      </button>

      {/* Page Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">
          Add New Employee
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Enter employee details to start tracking
        </p>
      </div>

      {/* Card */}
      <div className="mx-auto w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden">
        {/* Card Header */}
        <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50 to-violet-50 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-700">
            Employee Information
          </h2>
        </div>

        {/* Card Body */}
        <div className="px-6 py-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Picture Upload */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Profile Picture <span className="text-red-500">*</span>
              </label>
              <div
                className="group relative flex flex-col items-center justify-center w-full min-h-[160px] rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 cursor-pointer hover:border-sky-400 hover:bg-sky-50/40 transition-all duration-200"
                onClick={() => fileRef.current?.click()}
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="h-28 w-28 rounded-full object-cover border-4 border-white shadow-md ring-2 ring-sky-100"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 py-4">
                    <span className="text-4xl opacity-60 group-hover:opacity-90 transition-opacity">📷</span>
                    <span className="text-sm font-medium text-slate-600 group-hover:text-sky-600 transition-colors">
                      Click to upload photo
                    </span>
                    <span className="text-xs text-slate-400">
                      JPEG, PNG, WebP • Max 5MB
                    </span>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Name Input */}
            <div>
              <label
                className="block text-sm font-semibold text-slate-700 mb-2"
                htmlFor="name"
              >
                Employee Name <span className="text-red-500">*</span>
                <span className="ml-1 text-xs font-normal text-slate-400">(must be unique)</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition-all duration-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:outline-none hover:border-slate-400"
                placeholder="Enter full name"
                value={form.name}
                onChange={handleChange}
                autoFocus
              />
            </div>

            {/* Daily Wage Input */}
            <div>
              <label
                className="block text-sm font-semibold text-slate-700 mb-2"
                htmlFor="dailyWage"
              >
                Daily Wage (₹) <span className="text-red-500">*</span>
              </label>
              <input
                id="dailyWage"
                name="dailyWage"
                type="number"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition-all duration-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:outline-none hover:border-slate-400"
                placeholder="e.g. 500"
                min="1"
                step="1"
                value={form.dailyWage}
                onChange={handleChange}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-sky-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-sky-600/25 transition-all duration-200 hover:shadow-lg hover:shadow-sky-600/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-md disabled:hover:brightness-100"
              disabled={submitting}
            >
              {submitting ? 'Adding...' : '➕ Add Employee'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
