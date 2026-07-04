import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const API = 'http://localhost:5000/api';

export default function Dashboard() {
  const [employees, setEmployees] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [editingWage, setEditingWage] = useState({ id: null, value: '' });
  const navigate = useNavigate();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const empRes = await axios.get(`${API}/employees`);
      setEmployees(empRes.data);

      // Fetch attendance for all employees
      const attMap = {};
      await Promise.all(
        empRes.data.map(async (emp) => {
          try {
            const attRes = await axios.get(`${API}/attendance/employee/${emp._id}`);
            attMap[emp._id] = attRes.data;
          } catch {
            attMap[emp._id] = null;
          }
        })
      );
      setAttendanceMap(attMap);
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

  const handleMarkAttendance = async (empId, dateStr, status) => {
    try {
      const res = await axios.put(`${API}/attendance/employee/${empId}/mark`, { date: dateStr, status });
      setAttendanceMap((prev) => ({
        ...prev,
        [empId]: res.data,
      }));
      showToast(`Marked ${status}`);
    } catch {
      showToast('Failed to mark attendance', 'error');
    }
  };

  const handleUpdateWage = async (empId) => {
    const newWage = parseFloat(editingWage.value);
    if (isNaN(newWage) || newWage < 0) {
      showToast('Enter a valid wage', 'error');
      setEditingWage({ id: null, value: '' });
      return;
    }
    try {
      const emp = employees.find(e => e._id === empId);
      await axios.put(`${API}/employees/${empId}`, {
        name: emp.name,
        dailyWage: newWage,
      });
      setEmployees(prev => prev.map(e => e._id === empId ? { ...e, dailyWage: newWage } : e));
      setEditingWage({ id: null, value: '' });
      showToast('Daily wage updated!');
    } catch {
      showToast('Failed to update wage', 'error');
      setEditingWage({ id: null, value: '' });
    }
  };

  // Count "present" days in attendance after a given date
  const getWorkingDaysAfter = (empId, afterDate) => {
    const att = attendanceMap[empId];
    if (!att || !att.attendance) return 0;

    let count = 0;
    // Compare using date-only strings (YYYY-MM-DD) to avoid timezone issues
    let afterDateStr = null;
    if (afterDate) {
      const lp = new Date(afterDate);
      afterDateStr = `${lp.getFullYear()}-${String(lp.getMonth() + 1).padStart(2, '0')}-${String(lp.getDate()).padStart(2, '0')}`;
    }

    // Iterate all months in attendance
    const months = att.attendance;
    Object.entries(months).forEach(([monthKey, days]) => {
      Object.entries(days).forEach(([dayStr, status]) => {
        if (status !== 'present') return;
        const fullDateStr = `${monthKey}-${dayStr}`;
        if (!afterDateStr || fullDateStr > afterDateStr) {
          count++;
        }
      });
    });

    return count;
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
    return new Date(date).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const today = new Date();
  const todayMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const todayDayStr = String(today.getDate()).padStart(2, '0');
  const todayDateStr = `${todayMonthKey}-${todayDayStr}`;

  const filtered = employees
    .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Computations for Analytics ──
  let totalPendingSalary = 0;
  let totalPendingAdvances = 0;
  let presentToday = 0;
  let absentToday = 0;

  employees.forEach((emp) => {
    // Financials
    const workingDays = getWorkingDaysAfter(emp._id, emp.lastPaymentDate);
    const advanceAfter = emp.advanceAfterLastPayment || 0;
    const remaining = Math.max(0, workingDays * (emp.dailyWage || 0) - advanceAfter);
    
    totalPendingSalary += remaining;
    totalPendingAdvances += advanceAfter;

    // Attendance
    const todayStatus = attendanceMap[emp._id]?.attendance?.[todayMonthKey]?.[todayDayStr];
    if (todayStatus === 'present') presentToday++;
    else if (todayStatus === 'absent') absentToday++;
  });

  const unmarkedToday = employees.length - presentToday - absentToday;

  // ── Weekly Attendance Trend ──
  const weeklyAttendanceData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const dStr = String(d.getDate()).padStart(2, '0');
    const shortDay = d.toLocaleDateString('en-IN', { weekday: 'short' });

    let p = 0;
    let a = 0;
    employees.forEach((emp) => {
      const status = attendanceMap[emp._id]?.attendance?.[mKey]?.[dStr];
      if (status === 'present') p++;
      else if (status === 'absent') a++;
    });

    weeklyAttendanceData.push({
      name: shortDay,
      Present: p,
      Absent: a
    });
  }

  if (loading) {
    return (
      <div className="main-content">
        <div className="loading-container">
          <div className="spinner" />
          <span className="loading-text">Loading employees...</span>
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

      <div className="page-header">
        <h1>Employee Dashboard</h1>
        <p>Workforce overview — wages, attendance & salary status</p>
      </div>

      {/* ── Command Center: Analytics & Stats ── */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card cyan">
          <div className="stat-card-icon">👥</div>
          <div className="stat-card-label">Total Employees</div>
          <div className="stat-card-value">{employees.length}</div>
        </div>
        
        <div className="stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="stat-card-label" style={{ color: 'var(--text-muted)' }}>Today's Attendance</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-success)' }} title="Present">{presentToday}</span>
            <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-danger)' }} title="Absent">{absentToday}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: 'auto' }} title="Unmarked">({unmarkedToday} unmk)</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', marginTop: '0.75rem', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${(presentToday / Math.max(1, employees.length)) * 100}%`, background: 'var(--accent-success)' }} />
            <div style={{ width: `${(absentToday / Math.max(1, employees.length)) * 100}%`, background: 'var(--accent-danger)' }} />
          </div>
        </div>

        <div className="stat-card" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <div className="stat-card-icon">💰</div>
          <div className="stat-card-label" style={{ color: 'var(--accent-danger)' }}>Total Pending Salary</div>
          <div className="stat-card-value" style={{ color: 'var(--accent-danger)' }}>
            {formatCurrency(totalPendingSalary)}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>Total wages owed right now</div>
        </div>

        <div className="stat-card" style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <div className="stat-card-icon">📤</div>
          <div className="stat-card-label" style={{ color: 'var(--accent-warning)' }}>Total Pending Advances</div>
          <div className="stat-card-value" style={{ color: 'var(--accent-warning)' }}>
            {formatCurrency(totalPendingAdvances)}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>Money currently out in field</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>7-Day Attendance Trend</h2>
        <div style={{ width: '100%', height: '250px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyAttendanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--shadow-md)' }}
                itemStyle={{ fontWeight: 600, color: 'var(--text-primary)' }}
                cursor={{ fill: 'var(--bg-secondary)' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="Present" fill="var(--accent-success)" radius={[4, 4, 0, 0]} barSize={30} />
              <Bar dataKey="Absent" fill="var(--accent-danger)" radius={[4, 4, 0, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Employee List */}
      <div className="card">
        <div className="card-header">
          <h2>All Employees</h2>
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="form-input"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '240px' }}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👷</div>
            <h3>{search ? 'No matching employees' : 'No employees yet'}</h3>
            <p>
              {search
                ? 'Try a different search term'
                : 'Add your first employee to get started.'}
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Daily Wage</th>
                  <th>Last Payment</th>
                  <th>Working Days Since</th>
                  <th>Advance Since</th>
                  <th>Remaining Salary</th>
                  <th>Today's Attendance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const workingDays = getWorkingDaysAfter(emp._id, emp.lastPaymentDate);
                  const advanceAfter = emp.advanceAfterLastPayment || 0;
                  const remaining = Math.max(0, workingDays * (emp.dailyWage || 0) - advanceAfter);
                  const todayStatus = attendanceMap[emp._id]?.attendance?.[todayMonthKey]?.[todayDayStr];

                  return (
                    <tr
                      key={emp._id}
                      className="employee-row-clickable"
                      onClick={() => navigate(`/employee/${emp._id}`)}
                    >
                      <td>
                        <div className="employee-name-cell">
                          <img
                            src={emp.profilePicture ? `http://localhost:5000/uploads/${emp.profilePicture}` : ''}
                            alt={emp.name}
                            className="avatar-sm"
                          />
                          <span className="employee-name">{emp.name}</span>
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {editingWage.id === emp._id ? (
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: '90px', padding: '0.25rem 0.5rem', fontWeight: 600, textAlign: 'right' }}
                            value={editingWage.value}
                            onChange={(e) => setEditingWage(prev => ({ ...prev, value: e.target.value }))}
                            onBlur={() => handleUpdateWage(emp._id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateWage(emp._id); if (e.key === 'Escape') setEditingWage({ id: null, value: '' }); }}
                            autoFocus
                            min="0"
                          />
                        ) : (
                          <span
                            className="payment-amount"
                            style={{ cursor: 'pointer', borderBottom: '1px dashed var(--border-active)' }}
                            title="Click to edit daily wage"
                            onClick={() => setEditingWage({ id: emp._id, value: emp.dailyWage || 0 })}
                          >
                            {formatCurrency(emp.dailyWage)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="date-badge">{formatDate(emp.lastPaymentDate)}</span>
                      </td>
                      <td>
                        <span className="badge badge-cyan">{workingDays} days</span>
                      </td>
                      <td>
                        <span className="payment-amount" style={{ color: advanceAfter > 0 ? 'var(--accent-warning)' : 'var(--text-muted)' }}>
                          {formatCurrency(advanceAfter)}
                        </span>
                      </td>
                      <td>
                        <span
                          className="payment-amount"
                          style={{
                            color: remaining > 0 ? 'var(--accent-success)' : remaining < 0 ? 'var(--accent-danger)' : 'var(--text-muted)',
                            fontWeight: 700,
                          }}
                        >
                          {formatCurrency(remaining)}
                        </span>
                      </td>
                      <td>
                        <div className="calendar-actions" onClick={(e) => e.stopPropagation()} style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                          <button
                            className="cal-btn cal-present"
                            style={{ opacity: todayStatus === 'present' ? 1 : 0.5, border: todayStatus === 'present' ? '1px solid var(--accent-success)' : '1px solid transparent' }}
                            title="Mark Present"
                            onClick={() => handleMarkAttendance(emp._id, todayDateStr, 'present')}
                          >
                            ✓
                          </button>
                          <button
                            className="cal-btn cal-absent"
                            style={{ opacity: todayStatus === 'absent' ? 1 : 0.5, border: todayStatus === 'absent' ? '1px solid var(--accent-danger)' : '1px solid transparent' }}
                            title="Mark Absent"
                            onClick={() => handleMarkAttendance(emp._id, todayDateStr, 'absent')}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
