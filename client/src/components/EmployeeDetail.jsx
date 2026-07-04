import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = '/api';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [marking, setMarking] = useState(false);

  // Calendar month
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Forms
  const [payForm, setPayForm] = useState({ amount: '', date: '', method: 'CASH' });
  const [deductedAdvanceInput, setDeductedAdvanceInput] = useState(null);
  const [advForm, setAdvForm] = useState({ amount: '', date: '', method: 'CASH' });
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', dailyWage: '' });

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [empRes, attRes] = await Promise.all([
        axios.get(`${API}/employees/${id}`),
        axios.get(`${API}/attendance/employee/${id}`),
      ]);
      setEmployee(empRes.data);
      setAttendance(attRes.data);
      setEditForm({
        name: empRes.data.name,
        dailyWage: empRes.data.dailyWage || 0,
      });
    } catch {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const formatCurrency = (val) => {
    const num = val || 0;
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(Math.abs(num));
    return num < 0 ? `- ${formatted}` : formatted;
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ── Computed values ──────────────────────────

  // Working days after last payment (from attendance)
  const workingDaysAfterLastPayment = useMemo(() => {
    if (!attendance?.attendance || !employee) return 0;
    // Compare using date-only strings (YYYY-MM-DD) to avoid timezone issues
    let afterDateStr = null;
    if (employee.lastPaymentDate) {
      const lp = new Date(employee.lastPaymentDate);
      afterDateStr = `${lp.getFullYear()}-${String(lp.getMonth() + 1).padStart(2, '0')}-${String(lp.getDate()).padStart(2, '0')}`;
    }
    let count = 0;
    Object.entries(attendance.attendance).forEach(([mk, days]) => {
      Object.entries(days).forEach(([dayStr, status]) => {
        if (status !== 'present') return;
        const fullDateStr = `${mk}-${dayStr}`;
        if (!afterDateStr || fullDateStr > afterDateStr) count++;
      });
    });
    return count;
  }, [attendance, employee]);

  // Days worked in the currently viewed month
  const daysWorkedThisMonth = useMemo(() => {
    if (!attendance?.attendance) return 0;
    const monthData = attendance.attendance[monthKey];
    if (!monthData) return 0;
    return Object.values(monthData).filter((s) => s === 'present').length;
  }, [attendance, monthKey]);

  // Advance after last payment
  const advanceAfterLastPayment = useMemo(() => {
    if (!employee) return 0;
    return employee.advanceAfterLastPayment || 0;
  }, [employee]);

  // Remaining salary (Total available if 100% of advance is paid off)
  const remainingSalary = useMemo(() => {
    if (!employee) return 0;
    return Math.max(0, workingDaysAfterLastPayment * (employee.dailyWage || 0) - advanceAfterLastPayment);
  }, [workingDaysAfterLastPayment, advanceAfterLastPayment, employee]);

  // Dynamic Payment Calculations
  const wagesEarned = workingDaysAfterLastPayment * (employee?.dailyWage || 0);
  const maxPossibleDeduction = Math.min(advanceAfterLastPayment, wagesEarned);
  
  let appliedDeduction;
  if (deductedAdvanceInput === null) {
    appliedDeduction = maxPossibleDeduction;
  } else if (deductedAdvanceInput === '') {
    appliedDeduction = 0;
  } else {
    appliedDeduction = Number(deductedAdvanceInput);
    if (appliedDeduction > maxPossibleDeduction) appliedDeduction = maxPossibleDeduction;
    if (appliedDeduction < 0) appliedDeduction = 0;
  }
  
  const currentNetPayable = Math.max(0, wagesEarned - appliedDeduction);
  const carryOverAdvance = advanceAfterLastPayment - appliedDeduction;

  // Set of payment date strings for calendar markers (format: "YYYY-MM-DD")
  const paymentDates = useMemo(() => {
    if (!employee?.payments) return new Set();
    return new Set(
      employee.payments.map((p) => {
        const d = new Date(p.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })
    );
  }, [employee]);

  // Set of advance date strings
  const advanceDates = useMemo(() => {
    if (!employee?.advances) return new Set();
    return new Set(
      employee.advances.map((a) => {
        const d = new Date(a.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })
    );
  }, [employee]);

  // ── Handlers ─────────────────────────────────

  const handleMarkAttendance = async (day, status) => {
    if (marking) return;
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${monthKey}-${dayStr}`;
    setMarking(true);
    try {
      await axios.put(`${API}/attendance/employee/${id}/mark`, { date: dateStr, status });
      await fetchData();
      showToast(`Marked ${status} for ${dateStr}`);
    } catch {
      showToast('Failed to mark', 'error');
    } finally {
      setMarking(false);
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    
    // We validate against currentNetPayable, not remainingSalary
    if (wagesEarned <= 0 && carryOverAdvance <= 0 && remainingSalary <= 0) {
      showToast('Cannot make a payment when remaining salary is zero or negative', 'error');
      return;
    }
    if (amount > currentNetPayable) {
      showToast(`Payment cannot exceed the net payable amount of ₹${currentNetPayable}.`, 'error');
      return;
    }
    
    try {
      await axios.post(`${API}/employees/${id}/payment`, {
        amount: parseFloat(payForm.amount),
        date: payForm.date || undefined,
        carryOverAdvance: carryOverAdvance,
        method: payForm.method
      });
      await fetchData();
      setPayForm({ amount: '', date: '', method: 'CASH' });
      setDeductedAdvanceInput(null);
      showToast('Payment recorded!');
    } catch {
      showToast('Failed to add payment', 'error');
    }
  };

  const handleAddAdvance = async (e) => {
    e.preventDefault();
    if (!advForm.amount || parseFloat(advForm.amount) <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    try {
      await axios.post(`${API}/employees/${id}/advance`, {
        amount: parseFloat(advForm.amount),
        date: advForm.date || undefined,
        method: advForm.method
      });
      await fetchData();
      setAdvForm({ amount: '', date: '', method: 'CASH' });
      showToast('Advance recorded!');
    } catch {
      showToast('Failed to add advance', 'error');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/employees/${id}`, {
        name: editForm.name,
        dailyWage: parseFloat(editForm.dailyWage) || 0,
      });
      await fetchData();
      setEditModal(false);
      showToast('Updated!');
    } catch {
      showToast('Failed to update', 'error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${employee.name}"?`)) return;
    try {
      await axios.delete(`${API}/employees/${id}`);
      showToast(`${employee.name} deleted`);
      setTimeout(() => navigate('/'), 800);
    } catch {
      showToast('Failed to delete', 'error');
    }
  };

  // ── Calendar grid ────────────────────────────

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const calendarCells = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarCells.push({ day: null, key: `e-${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0');
    const monthData = attendance?.attendance?.[monthKey] || {};
    const status = monthData[dayStr] || null;
    const isToday = isCurrentMonth && today.getDate() === d;
    const dateKey = `${monthKey}-${dayStr}`;

    const cellDate = new Date(`${dateKey}T00:00:00`);
    const sevenDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
    const sevenDaysFuture = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    const isLocked = cellDate < sevenDaysAgo || cellDate > sevenDaysFuture;

    const hasPayment = paymentDates.has(dateKey);
    const hasAdvance = advanceDates.has(dateKey);
    calendarCells.push({ day: d, dayStr, status, isToday, hasPayment, hasAdvance, isLocked, key: `d-${d}` });
  }

  // ── Render ───────────────────────────────────

  if (loading) {
    return (
      <div className="main-content">
        <div className="loading-container">
          <div className="spinner" />
          <span className="loading-text">Loading...</span>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <h3>Employee not found</h3>
          <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

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

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {employee.profilePicture ? (
            <img
              src={`/uploads/${employee.profilePicture}`}
              alt={employee.name}
              style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-color)' }}
            />
          ) : (
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--bg-glass)', border: '2px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
              👤
            </div>
          )}
          <div className="page-header" style={{ marginBottom: 0 }}>
            <h1>{employee.name}</h1>
            <p>Employee details, attendance & payment tracking</p>
          </div>
        </div>
        <div className="actions-row">
          <button className="btn btn-secondary" onClick={() => setEditModal(true)}>✏️ Edit</button>
          <button className="btn btn-danger" onClick={handleDelete}>🗑️ Delete</button>
        </div>
      </div>

      {/* ── Summary Table ── */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2>Employee Summary</h2>
        </div>
        <div className="table-wrapper">
          <table className="table summary-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Daily Wage</th>
                <th>Last Payment</th>
                <th>Days Worked ({MONTH_NAMES[month].slice(0, 3)})</th>
                <th>Advance (Since Pay)</th>
                <th>Remaining Salary</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="employee-name">{employee.name}</td>
                <td><span className="payment-amount">{formatCurrency(employee.dailyWage)}</span></td>
                <td><span className="date-badge">{formatDate(employee.lastPaymentDate)}</span></td>
                <td><span className="badge badge-cyan">{daysWorkedThisMonth} days</span></td>
                <td>
                  <span className="payment-amount" style={{ color: advanceAfterLastPayment > 0 ? 'var(--accent-warning)' : 'var(--text-muted)' }}>
                    {formatCurrency(advanceAfterLastPayment)}
                  </span>
                </td>
                <td>
                  <span className="payment-amount" style={{
                    color: remainingSalary > 0 ? 'var(--accent-success)' : remainingSalary < 0 ? 'var(--accent-danger)' : 'var(--text-muted)',
                    fontWeight: 700, fontSize: '1.05rem',
                  }}>
                    {formatCurrency(remainingSalary)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Quick Info Cards ── */}
      <div className="detail-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="detail-item">
          <div className="detail-item-label">Daily Wage</div>
          <div className="detail-item-value cyan">{formatCurrency(employee.dailyWage)}</div>
        </div>
        <div className="detail-item">
          <div className="detail-item-label">Working Days (Since Pay)</div>
          <div className="detail-item-value green">{workingDaysAfterLastPayment}</div>
        </div>
        <div className="detail-item">
          <div className="detail-item-label">Advance (Since Pay)</div>
          <div className="detail-item-value amber">{formatCurrency(advanceAfterLastPayment)}</div>
        </div>
        <div className="detail-item">
          <div className="detail-item-label">Remaining Salary</div>
          <div className="detail-item-value" style={{ color: remainingSalary >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
            {formatCurrency(remainingSalary)}
          </div>
        </div>
      </div>

      {/* ── Payment & Advance Forms ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Record Payment */}
        <div className="card">
          <div className="card-header"><h2>💰 Record Payment</h2></div>
          <div className="card-body">
            {remainingSalary <= 0 ? (
              <div className="empty-state" style={{ padding: '1rem', minHeight: '180px' }}>
                <p style={{ color: 'var(--accent-warning)', fontWeight: 600, marginBottom: '0.5rem' }}>Payment Not Allowed</p>
                <p style={{ fontSize: '0.85rem' }}>Remaining salary is settled or negative. Any extra money given must be recorded as an <b>Advance</b>.</p>
              </div>
            ) : (
              <form onSubmit={handleAddPayment}>
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                  
                  <div className="method-toggle" onClick={() => setPayForm(p => ({ ...p, method: p.method === 'CASH' ? 'UPI' : 'CASH' }))}>
                    <div className={`method-option ${payForm.method === 'CASH' ? 'active' : ''}`}>CASH</div>
                    <div className={`method-option ${payForm.method === 'UPI' ? 'active' : ''}`}>UPI</div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Wages Earned:</span>
                    <span>{formatCurrency(wagesEarned)}</span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Advance Deducted:<br/>
                      <small style={{fontSize: '0.75rem', opacity: 0.7}}>(Max: {formatCurrency(maxPossibleDeduction)})</small>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>- ₹</span>
                      <input 
                        type="number" 
                        min="0" 
                        max={maxPossibleDeduction}
                        className="form-input" 
                        style={{ width: '90px', padding: '0.2rem 0.5rem', textAlign: 'right', color: 'var(--accent-danger)', fontWeight: 'bold' }}
                        value={deductedAdvanceInput === null ? maxPossibleDeduction : deductedAdvanceInput} 
                        onChange={(e) => setDeductedAdvanceInput(e.target.value)} 
                      />
                    </div>
                  </div>

                  {carryOverAdvance > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--accent-warning)' }}>Advance Carried Over:</span>
                      <span style={{ color: 'var(--accent-warning)' }}>{formatCurrency(carryOverAdvance)}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-active)', fontWeight: 'bold' }}>
                    <span>Net Payable:</span>
                    <span style={{ color: 'var(--accent-success)' }}>{formatCurrency(currentNetPayable)}</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="pay-amt">Payment Amount (₹)</label>
                  <input id="pay-amt" type="number" className="form-input" placeholder="Enter amount" min="1"
                    value={payForm.amount} onChange={(e) => setPayForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pay-dt">Date</label>
                  <input id="pay-dt" type="date" className="form-input"
                    value={payForm.date} onChange={(e) => setPayForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Record Payment</button>
              </form>
            )}
          </div>
        </div>

        {/* Record Advance */}
        <div className="card">
          <div className="card-header"><h2>📤 Record Advance</h2></div>
          <div className="card-body">
            <form onSubmit={handleAddAdvance}>
              <div className="method-toggle" onClick={() => setAdvForm(p => ({ ...p, method: p.method === 'CASH' ? 'UPI' : 'CASH' }))}>
                <div className={`method-option ${advForm.method === 'CASH' ? 'active' : ''}`}>CASH</div>
                <div className={`method-option ${advForm.method === 'UPI' ? 'active' : ''}`}>UPI</div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="adv-amt">Amount (₹)</label>
                <input id="adv-amt" type="number" className="form-input" placeholder="Enter amount" min="1"
                  value={advForm.amount} onChange={(e) => setAdvForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="adv-dt">Date</label>
                <input id="adv-dt" type="date" className="form-input"
                  value={advForm.date} onChange={(e) => setAdvForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <button type="submit" className="btn btn-success">Record Advance</button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Attendance Calendar ── */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div className="calendar-nav">
            <button className="btn btn-secondary btn-sm" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>◀</button>
            <h2 className="calendar-month-title">{MONTH_NAMES[month]} {year}</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>▶</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setCurrentDate(new Date())}>Today</button>
        </div>
        <div className="card-body">
          <div className="calendar-legend">
            <div className="legend-item"><span className="legend-dot legend-present" /> Present</div>
            <div className="legend-item"><span className="legend-dot legend-absent" /> Absent</div>
            <div className="legend-item"><span className="legend-dot legend-unmarked" /> Unmarked</div>
            <div className="legend-item"><span className="legend-dot legend-payment" /> 💰 Payment</div>
            <div className="legend-item"><span className="legend-dot legend-advance-dot" /> 📤 Advance</div>
          </div>

          <div className="calendar-grid">
            {DAY_LABELS.map((l) => <div key={l} className="calendar-day-label">{l}</div>)}

            {calendarCells.map((cell) => {
              if (cell.day === null) return <div key={cell.key} className="calendar-cell empty" />;

              let statusClass = 'unmarked';
              if (cell.status === 'present') statusClass = 'present';
              else if (cell.status === 'absent') statusClass = 'absent';

              return (
                <div key={cell.key} className={`calendar-cell ${statusClass} ${cell.isToday ? 'today' : ''}`}>
                  <span className="calendar-day-number">{cell.day}</span>

                  {/* Markers for payment / advance */}
                  <div className="calendar-markers">
                    {cell.hasPayment && <span className="marker marker-payment" title="Payment made">💰</span>}
                    {cell.hasAdvance && <span className="marker marker-advance" title="Advance given">📤</span>}
                  </div>

                  <div className="calendar-actions">
                    <button className="cal-btn cal-present" title="Present" disabled={marking || cell.isLocked}
                      style={{ cursor: cell.isLocked ? 'not-allowed' : 'pointer', opacity: cell.isLocked ? 0.3 : 1 }}
                      onClick={() => !cell.isLocked && handleMarkAttendance(cell.day, 'present')}>✓</button>
                    <button className="cal-btn cal-absent" title="Absent" disabled={marking || cell.isLocked}
                      style={{ cursor: cell.isLocked ? 'not-allowed' : 'pointer', opacity: cell.isLocked ? 0.3 : 1 }}
                      onClick={() => !cell.isLocked && handleMarkAttendance(cell.day, 'absent')}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Payment History ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div className="card">
          <div className="card-header">
            <h2>Payment History</h2>
            <span className="badge badge-green">{employee.payments?.length || 0}</span>
          </div>
          {employee.payments?.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>#</th><th>Date</th><th>Amount</th></tr></thead>
                <tbody>
                  {[...employee.payments].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p, i) => (
                    <tr key={p._id || i}>
                      <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td>
                        <span className="date-badge">{formatDate(p.date)}</span>
                      </td>
                      <td>
                        <span className="payment-amount positive">{formatCurrency(p.amount)}</span>
                        {p.method && <span className={`badge-method ${p.method === 'UPI' ? 'badge-upi' : 'badge-cash'}`}>{p.method}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>No payments yet</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Advance History</h2>
            <span className="badge badge-amber">{employee.advances?.length || 0}</span>
          </div>
          {employee.advances?.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>#</th><th>Date</th><th>Amount</th></tr></thead>
                <tbody>
                  {[...employee.advances].sort((a, b) => new Date(b.date) - new Date(a.date)).map((a, i) => (
                    <tr key={a._id || i}>
                      <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td>
                        <span className="date-badge">{formatDate(a.date)}</span>
                      </td>
                      <td>
                        <span className="payment-amount" style={{ color: 'var(--accent-warning)' }}>{formatCurrency(a.amount)}</span>
                        {a.method && <span className={`badge-method ${a.method === 'UPI' ? 'badge-upi' : 'badge-cash'}`}>{a.method}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>No advances yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Employee</h3>
              <button className="btn btn-icon btn-secondary" onClick={() => setEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-name">Name</label>
                  <input id="edit-name" type="text" className="form-input"
                    value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-wage">Daily Wage (₹)</label>
                  <input id="edit-wage" type="number" className="form-input"
                    value={editForm.dailyWage} onChange={(e) => setEditForm(p => ({ ...p, dailyWage: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
