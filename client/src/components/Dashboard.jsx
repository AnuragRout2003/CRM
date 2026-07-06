import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const API = '/api';

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

  const handleUpdateWage = async (empId) => {
    const newWage = Math.round(Number(editingWage.value));
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
    const workingDays = getWorkingDaysAfter(emp._id, emp.paidTillDate) - (emp.partialPaidDays || 0);
    const advanceBalance = emp.totalAdvance || 0;
    const remaining = Math.max(0, emp.remainingSalary ?? workingDays * (emp.dailyWage || 0));
    
    totalPendingSalary += remaining;
    totalPendingAdvances += advanceBalance;

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="spinner" />
        <span className="text-slate-500 text-sm font-medium animate-pulse">Loading employees...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-8">
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.message}</div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
          Employee Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Workforce overview — wages, attendance &amp; salary status
        </p>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {/* Total Employees */}
        <div className="bg-white border border-sky-200 rounded-xl p-4 lg:p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-sky-100 to-transparent rounded-bl-full opacity-60" />
          <div className="relative">
            <span className="text-2xl">👥</span>
            <p className="mt-2 text-xs font-semibold text-sky-600 uppercase tracking-wide">Total Employees</p>
            <p className="mt-1 text-2xl lg:text-3xl font-extrabold text-slate-900">{employees.length}</p>
          </div>
        </div>

        {/* Today's Attendance */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 lg:p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Today's Attendance</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-extrabold text-emerald-600" title="Present">{presentToday}</span>
            <span className="text-sm text-slate-400">/</span>
            <span className="text-xl font-bold text-red-600" title="Absent">{absentToday}</span>
            <span className="text-xs text-slate-400 ml-auto" title="Unmarked">({unmarkedToday} unmk)</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden flex">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${(presentToday / Math.max(1, employees.length)) * 100}%` }}
            />
            <div
              className="bg-red-500 transition-all duration-500"
              style={{ width: `${(absentToday / Math.max(1, employees.length)) * 100}%` }}
            />
          </div>
        </div>

        {/* Total Pending Salary */}
        <div className="bg-red-50/50 border border-red-200 rounded-xl p-4 lg:p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-red-100 to-transparent rounded-bl-full opacity-60" />
          <div className="relative">
            <span className="text-2xl">💰</span>
            <p className="mt-2 text-xs font-semibold text-red-600 uppercase tracking-wide">Total Pending Salary</p>
            <p className="mt-1 text-xl lg:text-2xl font-extrabold text-red-600">
              {formatCurrency(totalPendingSalary)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Total wages owed right now</p>
          </div>
        </div>

        {/* Total Pending Advances */}
        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 lg:p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-100 to-transparent rounded-bl-full opacity-60" />
          <div className="relative">
            <span className="text-2xl">📤</span>
            <p className="mt-2 text-xs font-semibold text-amber-600 uppercase tracking-wide">Total Pending Advances</p>
            <p className="mt-1 text-xl lg:text-2xl font-extrabold text-amber-600">
              {formatCurrency(totalPendingAdvances)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Money currently out in field</p>
          </div>
        </div>
      </div>

      {/* ── 7-Day Attendance Chart ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 lg:p-6 shadow-sm mb-6">
        <h2 className="text-base lg:text-lg font-bold text-slate-800 mb-4">7-Day Attendance Trend</h2>
        <div className="w-full h-48 lg:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyAttendanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                itemStyle={{ fontWeight: 600, color: '#0f172a' }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="Present" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
              <Bar dataKey="Absent" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Employee List ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Card Header with Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 lg:px-6 lg:py-4 border-b border-slate-100">
          <h2 className="text-base lg:text-lg font-bold text-slate-800">All Employees</h2>
          <div className="relative w-full sm:w-auto">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">🔍</span>
            <input
              type="text"
              className="w-full sm:w-60 pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400 transition-all"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">👷</span>
            <h3 className="text-lg font-semibold text-slate-700">
              {search ? 'No matching employees' : 'No employees yet'}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {search
                ? 'Try a different search term'
                : 'Add your first employee to get started.'}
            </p>
          </div>
        ) : (
          <>
            {/* ── DESKTOP TABLE (lg+) ── */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Daily Wage</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Paid Till</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Unpaid Days</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Advance</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remaining Salary</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Today</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((emp) => {
                    const workingDays = getWorkingDaysAfter(emp._id, emp.paidTillDate) - (emp.partialPaidDays || 0);
                    const advanceBalance = emp.totalAdvance || 0;
                    const remaining = Math.max(0, emp.remainingSalary ?? workingDays * (emp.dailyWage || 0));
                    const todayStatus = attendanceMap[emp._id]?.attendance?.[todayMonthKey]?.[todayDayStr];

                    return (
                      <tr
                        key={emp._id}
                        className="hover:bg-sky-50/50 cursor-pointer transition-colors group"
                        onClick={() => navigate(`/employee/${emp._id}`)}
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <img
                              src={emp.profilePicture?.startsWith('http') ? emp.profilePicture : (emp.profilePicture ? `/uploads/${emp.profilePicture}` : '')}
                              alt={emp.name}
                              className="w-8 h-8 rounded-full object-cover bg-slate-200 ring-2 ring-white shadow-sm flex-shrink-0"
                            />
                            <span className="font-semibold text-slate-800 group-hover:text-sky-700 transition-colors">{emp.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          {editingWage.id === emp._id ? (
                            <input
                              type="number"
                              className="w-24 px-2 py-1 bg-white border border-sky-300 rounded-md text-sm font-semibold text-right focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                              value={editingWage.value}
                              onChange={(e) => setEditingWage(prev => ({ ...prev, value: e.target.value }))}
                              onBlur={() => handleUpdateWage(emp._id)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateWage(emp._id); if (e.key === 'Escape') setEditingWage({ id: null, value: '' }); }}
                              onWheel={(e) => e.currentTarget.blur()}
                              autoFocus
                              min="0"
                              step="1"
                            />
                          ) : (
                            <span
                              className="font-semibold text-slate-700 cursor-pointer border-b border-dashed border-slate-300 hover:border-sky-500 hover:text-sky-600 transition-colors"
                              title="Click to edit daily wage"
                              onClick={() => setEditingWage({ id: emp._id, value: emp.dailyWage || 0 })}
                            >
                              {formatCurrency(emp.dailyWage)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{formatDate(emp.paidTillDate)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700">{workingDays} days</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`font-semibold ${advanceBalance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {formatCurrency(advanceBalance)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`font-bold ${remaining > 0 ? 'text-emerald-600' : remaining < 0 ? 'text-red-600' : 'text-slate-400'}`}
                          >
                            {formatCurrency(remaining)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            todayStatus === 'present'
                              ? 'bg-emerald-100 text-emerald-700'
                              : todayStatus === 'absent'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {todayStatus || 'unmarked'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── MOBILE CARDS (< lg) ── */}
            <div className="lg:hidden divide-y divide-slate-100">
              {filtered.map((emp) => {
                const workingDays = getWorkingDaysAfter(emp._id, emp.paidTillDate) - (emp.partialPaidDays || 0);
                const advanceBalance = emp.totalAdvance || 0;
                const remaining = Math.max(0, emp.remainingSalary ?? workingDays * (emp.dailyWage || 0));
                const todayStatus = attendanceMap[emp._id]?.attendance?.[todayMonthKey]?.[todayDayStr];

                return (
                  <div
                    key={emp._id}
                    className="p-4 active:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/employee/${emp._id}`)}
                  >
                    {/* Top: Avatar + Name */}
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={emp.profilePicture?.startsWith('http') ? emp.profilePicture : (emp.profilePicture ? `/uploads/${emp.profilePicture}` : '')}
                        alt={emp.name}
                        className="w-10 h-10 rounded-full object-cover bg-slate-200 ring-2 ring-white shadow-sm flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate">{emp.name}</p>
                        <p className="text-xs text-slate-400">Paid Till: {formatDate(emp.paidTillDate)}</p>
                      </div>
                    </div>

                    {/* 2x2 Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-slate-50 rounded-lg px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Wage/day</p>
                        {editingWage.id === emp._id ? (
                          <input
                            type="number"
                            className="w-full mt-0.5 px-1.5 py-0.5 bg-white border border-sky-300 rounded text-sm font-bold text-right focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                            value={editingWage.value}
                            onChange={(e) => setEditingWage(prev => ({ ...prev, value: e.target.value }))}
                            onBlur={() => handleUpdateWage(emp._id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateWage(emp._id); if (e.key === 'Escape') setEditingWage({ id: null, value: '' }); }}
                            onWheel={(e) => e.currentTarget.blur()}
                            autoFocus
                            min="0"
                            step="1"
                          />
                        ) : (
                          <p
                            className="text-sm font-bold text-slate-700 mt-0.5 border-b border-dashed border-slate-300"
                            onClick={() => setEditingWage({ id: emp._id, value: emp.dailyWage || 0 })}
                          >
                            {formatCurrency(emp.dailyWage)}
                          </p>
                        )}
                      </div>
                      <div className="bg-sky-50 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Unpaid Days</p>
                        <p className="text-sm font-bold text-sky-700 mt-0.5">{workingDays} days</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Advance</p>
                        <p className={`text-sm font-bold mt-0.5 ${advanceBalance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {formatCurrency(advanceBalance)}
                        </p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Remaining</p>
                        <p className={`text-sm font-bold mt-0.5 ${remaining > 0 ? 'text-emerald-600' : remaining < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {formatCurrency(remaining)}
                        </p>
                      </div>
                    </div>

                    {/* Attendance Status */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-400 mr-auto">Today:</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        todayStatus === 'present'
                          ? 'bg-emerald-100 text-emerald-700'
                          : todayStatus === 'absent'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {todayStatus || 'unmarked'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

