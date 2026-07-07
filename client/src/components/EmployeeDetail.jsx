import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = '/api';
const DASHBOARD_CACHE_KEY = 'rout-dashboard-cache-v1';
const ATTENDANCE_CACHE_PREFIX = 'rout-attendance-week';

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
  const [savingAction, setSavingAction] = useState(null);

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

  const clearListCaches = () => {
    try {
      window.localStorage.removeItem(DASHBOARD_CACHE_KEY);
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith(ATTENDANCE_CACHE_PREFIX))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // If local storage is unavailable, the server data is still correct.
    }
  };

  const applyDetailResponse = (data) => {
    const nextEmployee = data?.employee || data;
    if (!nextEmployee) return;

    setEmployee(nextEmployee);
    if (data?.attendance) {
      setAttendance(data.attendance);
    }
    setEditForm({
      name: nextEmployee.name,
      dailyWage: nextEmployee.dailyWage || 0,
    });
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

  const formatDays = (value) => {
    const num = Number(value) || 0;
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 2,
    }).format(num);
  };

  // ── Computed values ──────────────────────────

  const paidTillDateStr = useMemo(() => {
    if (!employee?.paidTillDate) return null;
    const pt = new Date(employee.paidTillDate);
    return `${pt.getFullYear()}-${String(pt.getMonth() + 1).padStart(2, '0')}-${String(pt.getDate()).padStart(2, '0')}`;
  }, [employee]);

  // Working days after the latest paid-through date (from attendance)
  const workingDaysAfterPaidTill = useMemo(() => {
    if (!attendance?.attendance || !employee) return 0;
    let count = 0;
    Object.entries(attendance.attendance).forEach(([mk, days]) => {
      Object.entries(days).forEach(([dayStr, status]) => {
        if (status !== 'present') return;
        const fullDateStr = `${mk}-${dayStr}`;
        if (!paidTillDateStr || fullDateStr > paidTillDateStr) count++;
      });
    });
    return count;
  }, [attendance, employee, paidTillDateStr]);

  const unpaidPresentDays = Math.max(0, workingDaysAfterPaidTill - (employee?.partialPaidDays || 0));

  // Days worked in the currently viewed month
  const daysWorkedThisMonth = useMemo(() => {
    if (!attendance?.attendance) return 0;
    const monthData = attendance.attendance[monthKey];
    if (!monthData) return 0;
    return Object.values(monthData).filter((s) => s === 'present').length;
  }, [attendance, monthKey]);

  // Advance Balance (total from all time)
  const advanceBalance = useMemo(() => {
    if (!employee) return 0;
    return employee.totalAdvance || 0;
  }, [employee]);

  // Remaining salary is earned wages still unpaid. Advances are tracked separately.
  const remainingSalary = useMemo(() => {
    if (!employee) return 0;
    return Math.max(0, employee.remainingSalary ?? unpaidPresentDays * (employee.dailyWage || 0));
  }, [unpaidPresentDays, employee]);

  // Dynamic Payment Calculations
  const wagesEarnedThisCycle = remainingSalary;
  const totalWagesOwed = wagesEarnedThisCycle;
  const maxPossibleDeduction = advanceBalance;
  
  let appliedDeduction;
  if (deductedAdvanceInput === null) {
    appliedDeduction = 0;
  } else if (deductedAdvanceInput === '') {
    appliedDeduction = 0;
  } else {
    appliedDeduction = Number(deductedAdvanceInput);
    if (appliedDeduction > maxPossibleDeduction) appliedDeduction = maxPossibleDeduction;
    if (appliedDeduction < 0) appliedDeduction = 0;
  }
  
  const currentNetPayable = Math.max(0, totalWagesOwed - appliedDeduction);
  
  const paymentAmountInput = Number(payForm.amount) || 0;
  const salarySettledThisEntry = Math.min(totalWagesOwed, paymentAmountInput + appliedDeduction);
  const paidDaysWorth = employee?.dailyWage > 0
    ? salarySettledThisEntry / employee.dailyWage
    : 0;
  const newUnpaidWages = Math.max(0, totalWagesOwed - salarySettledThisEntry);

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

  const advanceLedger = useMemo(() => {
    if (!employee?.advances) return [];

    let runningBalance = 0;
    return [...employee.advances]
      .map((advance, originalIndex) => ({ ...advance, originalIndex }))
      .sort((a, b) => new Date(a.date) - new Date(b.date) || a.originalIndex - b.originalIndex)
      .map((advance) => {
        const amount = Number(advance.amount) || 0;
        const previousAdvance = runningBalance;
        const carryForwardAdvance = previousAdvance + amount;
        runningBalance = carryForwardAdvance;

        return {
          ...advance,
          previousAdvance,
          carryForwardAdvance,
        };
      })
      .reverse();
  }, [employee]);

  // ── Handlers ─────────────────────────────────

  const handleAddPayment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(payForm.amount || '0');
    if (amount < 0 || appliedDeduction < 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    
    if (amount <= 0 && appliedDeduction <= 0) {
      showToast('Enter payment amount or advance deduction', 'error');
      return;
    }
    if (amount > currentNetPayable) {
      showToast(`Payment cannot exceed the net payable amount of ₹${currentNetPayable}.`, 'error');
      return;
    }
    
    setSavingAction('payment');
    try {
      const res = await axios.post(`${API}/employees/${id}/payment`, {
        amount,
        date: payForm.date || undefined,
        advanceDeducted: appliedDeduction,
        wagesEarnedThisCycle: wagesEarnedThisCycle,
        method: payForm.method
      });
      applyDetailResponse(res.data);
      setPayForm({ amount: '', date: '', method: 'CASH' });
      setDeductedAdvanceInput(null);
      showToast('Payment recorded!');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add payment', 'error');
    } finally {
      setSavingAction(null);
    }
  };

  const handleAddAdvance = async (e) => {
    e.preventDefault();
    if (!advForm.amount || parseFloat(advForm.amount) <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    setSavingAction('advance');
    try {
      const res = await axios.post(`${API}/employees/${id}/advance`, {
        amount: parseFloat(advForm.amount),
        date: advForm.date || undefined,
        method: advForm.method
      });
      applyDetailResponse(res.data);
      setAdvForm({ amount: '', date: '', method: 'CASH' });
      showToast('Advance recorded!');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add advance', 'error');
    } finally {
      setSavingAction(null);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSavingAction('update');
    try {
      const res = await axios.put(`${API}/employees/${id}`, {
        name: editForm.name,
        dailyWage: Math.round(Number(editForm.dailyWage)) || 0,
      });
      applyDetailResponse(res.data);
      setEditModal(false);
      showToast('Updated!');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update', 'error');
    } finally {
      setSavingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${employee.name}"?`)) return;
    setSavingAction('delete');
    try {
      await axios.delete(`${API}/employees/${id}`);
      clearListCaches();
      showToast(`${employee.name} deleted`);
      setTimeout(() => navigate('/'), 800);
    } catch {
      showToast('Failed to delete', 'error');
      setSavingAction(null);
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
    const paidAmount = attendance?.paidAttendance?.[monthKey]?.[dayStr] || 0;

    const hasPayment = paymentDates.has(dateKey);
    const hasAdvance = advanceDates.has(dateKey);
    const isPaid = paidAmount > 0 || (status === 'present' && paidTillDateStr && dateKey <= paidTillDateStr);
    calendarCells.push({ day: d, dayStr, status, isToday, hasPayment, hasAdvance, isPaid, key: `d-${d}` });
  }

  // ── Render ───────────────────────────────────

  const isSavingPayment = savingAction === 'payment';
  const isSavingAdvance = savingAction === 'advance';
  const isSavingUpdate = savingAction === 'update';
  const isDeleting = savingAction === 'delete';

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="spinner" />
          <span className="text-slate-500 text-sm font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="text-5xl">❌</div>
          <h3 className="text-lg font-semibold text-slate-700">Employee not found</h3>
          <button className="mt-4 px-6 py-2.5 rounded-lg bg-gradient-to-r from-sky-600 to-violet-600 text-white font-semibold shadow-md hover:shadow-lg transition-all" onClick={() => navigate('/')}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 lg:px-8">
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.message}</div>
        </div>
      )}

      <button className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 mb-4 transition-colors" onClick={() => navigate('/')}>
        ← Back to Dashboard
      </button>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          {employee.profilePicture ? (
            <img
              src={employee.profilePicture?.startsWith('http') ? employee.profilePicture : `/uploads/${employee.profilePicture}`}
              alt={employee.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-slate-200 shadow-sm"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border-2 border-slate-200 flex items-center justify-center text-2xl shadow-sm">
              👤
            </div>
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{employee.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">Employee details, attendance & payment tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={isDeleting} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed" onClick={() => setEditModal(true)}>✏️ Edit</button>
          <button disabled={isDeleting} className="px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed" onClick={handleDelete}>{isDeleting ? 'Deleting...' : '🗑️ Delete'}</button>
        </div>
      </div>

      {/* ── Summary Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-200">
          <h2 className="text-base md:text-lg font-semibold text-slate-800">Employee Summary</h2>
        </div>
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Daily Wage</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Paid Till</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Present Days This Month ({MONTH_NAMES[month].slice(0, 3)})</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Advance Balance</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Remaining Salary</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-900">{employee.name}</td>
                <td className="px-4 py-3 font-semibold text-sky-700">{formatCurrency(employee.dailyWage)}</td>
                <td className="px-4 py-3"><span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-medium">{formatDate(employee.paidTillDate)}</span></td>
                <td className="px-4 py-3"><span className="text-xs bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full font-bold">{daysWorkedThisMonth} days</span></td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${advanceBalance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {formatCurrency(advanceBalance)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`font-bold text-base ${remainingSalary > 0 ? 'text-emerald-600' : remainingSalary < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {formatCurrency(remainingSalary)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Mobile Card */}
        <div className="md:hidden p-4 space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Name</span>
            <span className="font-semibold text-slate-900">{employee.name}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Daily Wage</span>
            <span className="font-semibold text-sky-700">{formatCurrency(employee.dailyWage)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Paid Till</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-medium">{formatDate(employee.paidTillDate)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Present Days This Month ({MONTH_NAMES[month].slice(0, 3)})</span>
            <span className="text-xs bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full font-bold">{daysWorkedThisMonth} days</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Advance Balance</span>
            <span className={`font-semibold ${advanceBalance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatCurrency(advanceBalance)}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Remaining Salary</span>
            <span className={`font-bold text-base ${remainingSalary > 0 ? 'text-emerald-600' : remainingSalary < 0 ? 'text-red-600' : 'text-slate-400'}`}>{formatCurrency(remainingSalary)}</span>
          </div>
        </div>
      </div>

      {/* ── Quick Info Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Daily Wage</div>
          <div className="text-xl md:text-2xl font-bold text-sky-600">{formatCurrency(employee.dailyWage)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Unpaid Present Days</div>
          <div className="text-xl md:text-2xl font-bold text-emerald-600">{formatDays(unpaidPresentDays)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Advance Balance</div>
          <div className="text-xl md:text-2xl font-bold text-amber-500">{formatCurrency(advanceBalance)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Remaining Salary</div>
          <div className={`text-xl md:text-2xl font-bold ${remainingSalary >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(remainingSalary)}
          </div>
        </div>
      </div>

      {/* ── Payment & Advance Forms ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 mb-6">
        {/* Record Payment */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-200">
            <h2 className="text-base md:text-lg font-semibold text-slate-800">💰 Record Payment</h2>
          </div>
          <div className="p-4 md:p-6">
            {remainingSalary <= 0 && advanceBalance <= 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-amber-600 font-semibold mb-2">Payment Not Allowed</p>
                <p className="text-sm text-slate-500">Remaining salary is settled or negative. Any extra money given must be recorded as an <b>Advance</b>.</p>
              </div>
            ) : (
              <form onSubmit={handleAddPayment}>
                <div className="bg-slate-50 p-4 rounded-lg mb-4 border border-slate-200 text-sm space-y-2">
                  
                  {/* Method Toggle */}
                  <div className={`flex rounded-full bg-slate-200/70 overflow-hidden mb-3 ${isSavingPayment ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`} onClick={() => !isSavingPayment && setPayForm(p => ({ ...p, method: p.method === 'CASH' ? 'UPI' : 'CASH' }))}>
                    <div className={`flex-1 text-center py-2 text-xs font-bold transition-all ${payForm.method === 'CASH' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500'}`}>CASH</div>
                    <div className={`flex-1 text-center py-2 text-xs font-bold transition-all ${payForm.method === 'UPI' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500'}`}>UPI</div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Unpaid Wages:</span>
                    <span className="font-medium text-slate-800">{formatCurrency(wagesEarnedThisCycle)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Days This Payment Covers:</span>
                    <span className="font-medium text-slate-800">{paidDaysWorth.toFixed(2)} days</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">
                      Advance Deducted:<br/>
                      <small className="text-[0.7rem] opacity-70">(Max: {formatCurrency(maxPossibleDeduction)})</small>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">- ₹</span>
                      <input 
                        type="number" 
                        min="0" 
                        max={maxPossibleDeduction}
                        className="w-[90px] px-2 py-1 rounded-lg border border-slate-300 text-right text-red-600 font-bold text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                        disabled={isSavingPayment}
                        value={deductedAdvanceInput === null ? '' : deductedAdvanceInput} 
                        onChange={(e) => setDeductedAdvanceInput(e.target.value)} 
                      />
                    </div>
                  </div>

                  {newUnpaidWages > 0 && (
                    <div className="flex justify-between items-center text-[0.85rem] mt-1 text-slate-500">
                      <span>Unpaid Wages Carried Forward:</span>
                      <span className="font-medium">{formatCurrency(newUnpaidWages)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed border-slate-300 font-bold">
                    <span className="text-slate-800">Net Payable:</span>
                    <span className="text-emerald-600">{formatCurrency(currentNetPayable)}</span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5" htmlFor="pay-amt">Payment Amount (₹)</label>
                  <input id="pay-amt" type="number" className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400" placeholder="Enter amount" min="0" disabled={isSavingPayment}
                    value={payForm.amount} onChange={(e) => setPayForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5" htmlFor="pay-dt">Date</label>
                  <input id="pay-dt" type="date" className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400" disabled={isSavingPayment}
                    value={payForm.date} onChange={(e) => setPayForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <button type="submit" disabled={isSavingPayment} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-sky-600 to-violet-600 text-white font-semibold shadow-md hover:shadow-lg hover:brightness-110 transition-all text-sm disabled:opacity-70 disabled:cursor-wait">{isSavingPayment ? 'Recording...' : 'Record Payment'}</button>
              </form>
            )}
          </div>
        </div>

        {/* Record Advance */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-200">
            <h2 className="text-base md:text-lg font-semibold text-slate-800">📤 Record Advance</h2>
          </div>
          <div className="p-4 md:p-6">
            <form onSubmit={handleAddAdvance}>
              {/* Method Toggle */}
              <div className={`flex rounded-full bg-slate-200/70 overflow-hidden mb-4 ${isSavingAdvance ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`} onClick={() => !isSavingAdvance && setAdvForm(p => ({ ...p, method: p.method === 'CASH' ? 'UPI' : 'CASH' }))}>
                <div className={`flex-1 text-center py-2 text-xs font-bold transition-all ${advForm.method === 'CASH' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500'}`}>CASH</div>
                <div className={`flex-1 text-center py-2 text-xs font-bold transition-all ${advForm.method === 'UPI' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500'}`}>UPI</div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5" htmlFor="adv-amt">Amount (₹)</label>
                <input id="adv-amt" type="number" className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400" placeholder="Enter amount" min="1" disabled={isSavingAdvance}
                  value={advForm.amount} onChange={(e) => setAdvForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5" htmlFor="adv-dt">Date</label>
                <input id="adv-dt" type="date" className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400" disabled={isSavingAdvance}
                  value={advForm.date} onChange={(e) => setAdvForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <button type="submit" disabled={isSavingAdvance} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg hover:brightness-110 transition-all text-sm disabled:opacity-70 disabled:cursor-wait">{isSavingAdvance ? 'Recording...' : 'Record Advance'}</button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Attendance Calendar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <button className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>◀</button>
            <h2 className="text-base md:text-lg font-bold text-slate-800 min-w-[160px] text-center">{MONTH_NAMES[month]} {year}</h2>
            <button className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>▶</button>
          </div>
          <button className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors" onClick={() => setCurrentDate(new Date())}>Today</button>
        </div>
        <div className="p-3 md:p-5">
          {/* Legend */}
            <div className="flex flex-wrap gap-3 md:gap-5 mb-4 text-xs font-medium text-slate-600">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Present (Unpaid)</div>
              <div className="flex items-center gap-1.5"><span className="text-[12px]">✅</span> Paid</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Absent</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Unmarked</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> 💰 Payment</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-400" /> 📤 Advance</div>
            </div>

          {/* Calendar Grid (uses custom CSS classes) */}
          <div className="calendar-grid">
            {DAY_LABELS.map((l) => <div key={l} className="text-center text-[10px] md:text-xs font-bold text-slate-400 uppercase py-1.5">{l}</div>)}

            {calendarCells.map((cell) => {
              if (cell.day === null) return <div key={cell.key} className="calendar-cell empty" />;

              let statusClass = 'unmarked';
              if (cell.isPaid) statusClass = 'paid';
              else if (cell.status === 'present') statusClass = 'present';
              else if (cell.status === 'absent') statusClass = 'absent';

              return (
                <div key={cell.key} className={`calendar-cell ${statusClass} ${cell.isToday ? 'today' : ''}`}>
                  <span className="text-[11px] md:text-xs font-bold text-slate-700 leading-none">{cell.day}</span>

                  {/* Markers for payment / advance */}
                  <div className="absolute right-0.5 top-0.5 flex max-w-[32px] flex-wrap justify-end gap-0.5 text-[8px] leading-none md:static md:max-w-none md:flex-nowrap md:text-[10px]">
                    {cell.hasPayment && <span className="text-[10px]" title="Payment made">💰</span>}
                    {cell.hasAdvance && <span className="text-[10px]" title="Advance given">📤</span>}
                    {cell.isPaid && <span className="text-[10px]" title="Paid">✅</span>}
                  </div>

                  <div className="mt-auto max-w-full text-[10px] font-semibold leading-none">
                    {cell.status === 'present' && (
                      <span className={cell.isPaid ? 'text-emerald-700' : 'text-emerald-600'}>
                        <span className="md:hidden">{cell.isPaid ? 'Pd' : 'P'}</span>
                        <span className="hidden md:inline">{cell.isPaid ? 'Paid' : 'Unpaid'}</span>
                      </span>
                    )}
                    {cell.status === 'absent' && (
                      <span className="text-red-600">
                        <span className="md:hidden">A</span>
                        <span className="hidden md:inline">Absent</span>
                      </span>
                    )}
                    {!cell.status && (
                      <span className="text-slate-400">
                        <span className="md:hidden">-</span>
                        <span className="hidden md:inline">Unmarked</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Payment & Advance History ── */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
          <h2 className="text-lg md:text-xl font-bold text-slate-900">Transaction History</h2>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payments and advances</span>
        </div>
      <div className="grid grid-cols-1 gap-5">
        {/* Payment History */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-emerald-100 bg-emerald-50/40 flex justify-between items-center">
            <h2 className="text-base md:text-lg font-semibold text-slate-800">Payment History</h2>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-bold">{employee.payments?.length || 0}</span>
          </div>
          {employee.payments?.length ? (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="w-12 px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">#</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Paid</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Advance Deducted</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...employee.payments].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p, i) => (
                      <tr key={p._id || i} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-medium">{formatDate(p.date)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold tabular-nums text-emerald-600">{formatCurrency(p.amount)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold tabular-nums ${(p.advanceDeducted || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {(p.advanceDeducted || 0) > 0 ? formatCurrency(p.advanceDeducted) : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {p.method && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.method === 'UPI' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.method}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {[...employee.payments].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p, i) => (
                  <div key={p._id || i} className="p-4 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-medium">#{i + 1}</span>
                      {p.method && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.method === 'UPI' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.method}</span>}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{formatDate(p.date)}</span>
                      <span className="font-semibold text-emerald-600">Paid {formatCurrency(p.amount)}</span>
                    </div>
                    {(p.advanceDeducted || 0) > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">Advance deducted</span>
                        <span className="font-semibold text-amber-600">{formatCurrency(p.advanceDeducted)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-slate-400">No payments yet</p>
            </div>
          )}
        </div>

        {/* Advance History */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-amber-100 bg-amber-50/50 flex justify-between items-center">
            <h2 className="text-base md:text-lg font-semibold text-slate-800">Advance History</h2>
            <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold">{employee.advances?.length || 0}</span>
          </div>
          {employee.advances?.length ? (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-[48px_minmax(180px,1.2fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)] items-center gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <span>#</span>
                    <span>Date</span>
                    <span className="text-center">Previous</span>
                    <span className="text-center">Change</span>
                    <span className="text-center">Balance</span>
                    <span className="text-center">Method</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {advanceLedger.map((a, i) => (
                      <div key={a._id || i} className="grid grid-cols-[48px_minmax(180px,1.2fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)] items-center gap-4 px-4 py-3 text-sm hover:bg-slate-50/60 transition-colors">
                        <span className="text-slate-400">{i + 1}</span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-medium justify-self-start whitespace-nowrap">{formatDate(a.date)}</span>
                        <span className="text-center font-semibold tabular-nums text-slate-600">{formatCurrency(a.previousAdvance)}</span>
                        <span className={`flex items-center justify-center gap-1 font-semibold tabular-nums ${a.amount < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {formatCurrency(a.amount)}
                          {a.type === 'DEDUCTED' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">Deducted</span>}
                        </span>
                        <span className="text-center font-bold tabular-nums text-amber-700">{formatCurrency(a.carryForwardAdvance)}</span>
                        <span className="justify-self-center">
                          {a.method && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${a.method === 'UPI' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{a.method}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {advanceLedger.map((a, i) => (
                  <div key={a._id || i} className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-medium">#{i + 1}</span>
                      {a.method && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${a.method === 'UPI' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{a.method}</span>}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{formatDate(a.date)} {a.type === 'DEDUCTED' && '(Deducted)'}</span>
                      <span className={`font-semibold ${a.amount < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{formatCurrency(a.amount)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 border border-slate-100 p-2 text-xs">
                      <div className="min-w-0 rounded-md bg-white px-2 py-2 border border-slate-100">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Previous</div>
                        <div className="mt-1 font-semibold tabular-nums text-slate-600 truncate">{formatCurrency(a.previousAdvance)}</div>
                      </div>
                      <div className="min-w-0 rounded-md bg-white px-2 py-2 border border-slate-100">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Change</div>
                        <div className={`mt-1 font-semibold tabular-nums truncate ${a.amount < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{formatCurrency(a.amount)}</div>
                      </div>
                      <div className="min-w-0 rounded-md bg-white px-2 py-2 border border-slate-100">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Balance</div>
                        <div className="mt-1 font-bold tabular-nums text-amber-700 truncate">{formatCurrency(a.carryForwardAdvance)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-slate-400">No advances yet</p>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* ── Edit Modal ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !isSavingUpdate && setEditModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Edit Employee</h3>
              <button disabled={isSavingUpdate} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors text-sm font-bold disabled:opacity-60 disabled:cursor-not-allowed" onClick={() => setEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5" htmlFor="edit-name">Name</label>
                  <input id="edit-name" type="text" className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400" disabled={isSavingUpdate}
                    value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5" htmlFor="edit-wage">Daily Wage (₹)</label>
                  <input id="edit-wage" type="number" step="1" min="1" className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all text-sm disabled:bg-slate-50 disabled:text-slate-400" disabled={isSavingUpdate}
                    value={editForm.dailyWage} onChange={(e) => setEditForm(p => ({ ...p, dailyWage: e.target.value }))} onWheel={(e) => e.currentTarget.blur()} />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
                <button type="button" disabled={isSavingUpdate} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed" onClick={() => setEditModal(false)}>Cancel</button>
                <button type="submit" disabled={isSavingUpdate} className="px-5 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-violet-600 text-white text-sm font-semibold shadow-md hover:shadow-lg hover:brightness-110 transition-all disabled:opacity-70 disabled:cursor-wait">{isSavingUpdate ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
