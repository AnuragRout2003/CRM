import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const API_EMPLOYEES = '/api/employees';
const API_ATTENDANCE = '/api/attendance';

export default function AttendanceView() {
  const [employees, setEmployees] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // currentBaseDate tracks which week we are viewing.
  const [currentBaseDate, setCurrentBaseDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Calculate the 7 days of the currently viewed week (Monday to Sunday)
  const weekDates = useMemo(() => {
    const date = new Date(currentBaseDate);
    const day = date.getDay();
    // In JS, Sunday is 0. If it's Sunday, we want to go back 6 days to Monday.
    // Otherwise, go back (day - 1) days.
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));

    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [currentBaseDate]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const empRes = await axios.get(API_EMPLOYEES);
      setEmployees(empRes.data);

      const attRes = await axios.get(API_ATTENDANCE);
      // Backend returns all attendance records in an array
      const attMap = {};
      attRes.data.forEach((record) => {
        attMap[record.employee] = record;
      });
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

  const prevWeek = () => {
    setCurrentBaseDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const nextWeek = () => {
    setCurrentBaseDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const goToToday = () => {
    setCurrentBaseDate(new Date());
  };

  const formatDateLabel = (date) => {
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  };

  // Helper to extract YYYY-MM and DD
  const getDateKeys = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return {
      monthKey: `${year}-${month}`,
      dayKey: day,
      fullDateStr: `${year}-${month}-${day}`
    };
  };

  const getPaidTillDateStr = (employee) => {
    if (!employee?.paidTillDate) return null;
    const paidTill = new Date(employee.paidTillDate);
    const year = paidTill.getFullYear();
    const month = String(paidTill.getMonth() + 1).padStart(2, '0');
    const day = String(paidTill.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getStatus = (empId, date) => {
    const record = attendanceMap[empId];
    if (!record || !record.attendance) return null;
    const { monthKey, dayKey } = getDateKeys(date);
    return record.attendance[monthKey]?.[dayKey] || null;
  };

  const getNextStatus = (current) => {
    if (!current) return 'present';
    if (current === 'present') return 'absent';
    return 'unmarked';
  };

  const handleCellClick = async (empId, date) => {
    const currentStatus = getStatus(empId, date);
    const nextStatus = getNextStatus(currentStatus);
    const { fullDateStr } = getDateKeys(date);

    try {
      // Optimistic update
      setAttendanceMap((prev) => {
        const newMap = { ...prev };
        if (!newMap[empId]) {
          newMap[empId] = { employee: empId, attendance: {} };
        }
        const record = { ...newMap[empId], attendance: { ...newMap[empId].attendance } };
        const { monthKey, dayKey } = getDateKeys(date);
        
        if (!record.attendance[monthKey]) record.attendance[monthKey] = {};
        
        if (nextStatus === 'unmarked') {
          delete record.attendance[monthKey][dayKey];
        } else {
          record.attendance[monthKey][dayKey] = nextStatus;
        }
        
        newMap[empId] = record;
        return newMap;
      });

      // API call
      const res = await axios.put(`${API_ATTENDANCE}/employee/${empId}/mark`, {
        date: fullDateStr,
        status: nextStatus,
      });

      // Sync with real server response
      setAttendanceMap((prev) => ({
        ...prev,
        [empId]: res.data,
      }));
    } catch {
      showToast('Failed to update attendance', 'error');
      fetchData(); // rollback
    }
  };

  // Shared helper for computing cell lock/status info (used in both mobile & desktop)
  const getCellInfo = (emp, date) => {
    const empId = emp._id;
    const status = getStatus(empId, date);
    const { fullDateStr } = getDateKeys(date);
    const paidTillDateStr = getPaidTillDateStr(emp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const cellDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const isLocked = cellDate < sevenDaysAgo || cellDate > today;
    const isToday = today.getTime() === cellDate.getTime();
    const isPaid = status === 'present' && paidTillDateStr && fullDateStr <= paidTillDateStr;
    return { status, isLocked, isToday, isPaid };
  };

  if (loading) {
    return (
      <div className="flex-1 p-4 md:p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="spinner" />
          <span className="text-sm font-medium text-slate-500 animate-pulse">Loading attendance matrix...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-8 max-w-full">
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.message}</div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Attendance Matrix
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Quickly mark attendance for all employees, week by week.
          </p>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm self-start md:self-auto">
          <button
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all"
            onClick={prevWeek}
          >
            ◀ Prev
          </button>
          <button
            className="px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 rounded-lg border border-sky-200 hover:bg-sky-100 hover:border-sky-300 transition-all"
            onClick={goToToday}
          >
            Today
          </button>
          <button
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all"
            onClick={nextWeek}
          >
            Next ▶
          </button>
        </div>
      </div>

      {/* ── Card Wrapper ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 md:px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <h2 className="text-sm md:text-base font-bold text-slate-800">
            Week of {formatDateLabel(weekDates[0])} — {formatDateLabel(weekDates[6])}
          </h2>
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/15 border border-emerald-500/40"></span>
              Present
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-600 border border-emerald-700"></span>
              Paid
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-500/15 border border-red-500/40"></span>
              Absent
            </span>
          </div>
        </div>

        {/* ── DESKTOP TABLE (hidden on mobile) ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 border-r-2 border-slate-200 px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[200px]">
                  Employee Name
                </th>
                {weekDates.map((date, i) => {
                  const isToday = new Date().toDateString() === date.toDateString();
                  return (
                    <th
                      key={i}
                      className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider min-w-[120px] ${
                        isToday
                          ? 'bg-sky-50/60 text-sky-700'
                          : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      {formatDateLabel(date)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <p className="text-slate-400 text-sm">No employees found. Add an employee to get started.</p>
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="sticky left-0 z-[9] bg-white border-r-2 border-slate-200 px-4 py-3 font-semibold text-sm text-slate-800">
                      <div className="flex items-center gap-2.5">
                        {emp.profilePicture ? (
                          <img
                            src={emp.profilePicture?.startsWith('http') ? emp.profilePicture : `/uploads/${emp.profilePicture}`}
                            alt={emp.name}
                            className="w-7 h-7 rounded-full object-cover ring-2 ring-slate-100"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {emp.name?.charAt(0)?.toUpperCase()}
                          </div>
                        )}
                        <span className="truncate max-w-[140px]">{emp.name}</span>
                      </div>
                    </td>
                    {weekDates.map((date, i) => {
                      const { status, isLocked, isPaid } = getCellInfo(emp, date);

                      let cellClasses = 'text-center select-none transition-all duration-150 border-r border-slate-100 h-[60px] relative';
                      let content;

                      if (isLocked) {
                        cellClasses += ' opacity-40 cursor-not-allowed';
                      } else {
                        cellClasses += ' cursor-pointer';
                      }

                      if (isPaid) {
                        cellClasses += ' bg-emerald-600 text-white font-bold';
                        content = <span title="Paid present day">Paid</span>;
                      } else if (status === 'present') {
                        cellClasses += ' bg-emerald-500/20 text-emerald-600 font-bold';
                        content = <span>P</span>;
                      } else if (status === 'absent') {
                        cellClasses += ' bg-red-500/20 text-red-600 font-bold';
                        content = <span>A</span>;
                      } else {
                        if (isLocked) {
                          cellClasses += ' bg-slate-50/50';
                        } else {
                          cellClasses += ' hover:bg-slate-100/70';
                        }
                        content = <span className="text-slate-300">-</span>;
                      }

                      return (
                        <td
                          key={i}
                          className={cellClasses}
                          onClick={() => !isLocked && handleCellClick(emp._id, date)}
                        >
                          {content}
                          {isLocked && (
                            <span className="absolute top-1 right-1 text-[0.6rem] opacity-70">🔒</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── MOBILE CARD VIEW (visible only on mobile) ── */}
        <div className="md:hidden">
          {employees.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-slate-400 text-sm">No employees found. Add an employee to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <div key={emp._id} className="px-4 py-4">
                  {/* Employee name + avatar */}
                  <div className="flex items-center gap-2.5 mb-3">
                    {emp.profilePicture ? (
                      <img
                        src={emp.profilePicture?.startsWith('http') ? emp.profilePicture : `/uploads/${emp.profilePicture}`}
                        alt={emp.name}
                        className="w-8 h-8 rounded-full object-cover ring-2 ring-slate-100"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-500">
                        {emp.name?.charAt(0)?.toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold text-sm text-slate-800 truncate">{emp.name}</span>
                  </div>

                  {/* Day circles row */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {weekDates.map((date, i) => {
                      const { status, isLocked, isToday, isPaid } = getCellInfo(emp, date);
                      const dayNum = date.getDate();
                      const dayLabel = date.toLocaleDateString('en-IN', { weekday: 'narrow' });

                      let circleClasses =
                        'flex flex-col items-center justify-center rounded-lg py-1.5 text-center transition-all duration-150 select-none';

                      if (isLocked) {
                        circleClasses += ' opacity-35 cursor-not-allowed';
                      } else {
                        circleClasses += ' cursor-pointer active:scale-95';
                      }

                      if (isPaid) {
                        circleClasses += ' bg-emerald-600 border border-emerald-700';
                      } else if (status === 'present') {
                        circleClasses += ' bg-emerald-500/20 border border-emerald-500/30';
                      } else if (status === 'absent') {
                        circleClasses += ' bg-red-500/20 border border-red-500/30';
                      } else {
                        circleClasses += ' bg-slate-100 border border-transparent';
                      }

                      if (isToday) {
                        circleClasses += ' ring-2 ring-sky-500 ring-offset-1';
                      }

                      return (
                        <button
                          key={i}
                          className={circleClasses}
                          disabled={isLocked}
                          onClick={() => !isLocked && handleCellClick(emp._id, date)}
                        >
                          <span className="text-[9px] font-medium text-slate-400 leading-none">{dayLabel}</span>
                          <span
                            className={`text-xs font-bold leading-tight mt-0.5 ${
                              isPaid
                                ? 'text-white'
                                : status === 'present'
                                ? 'text-emerald-600'
                                : status === 'absent'
                                ? 'text-red-600'
                                : 'text-slate-500'
                            }`}
                          >
                            {dayNum}
                          </span>
                          {isPaid && (
                            <span className="text-[8px] font-bold text-white leading-none mt-0.5">Paid</span>
                          )}
                          {!isPaid && status === 'present' && (
                            <span className="text-[8px] font-bold text-emerald-600 leading-none mt-0.5">P</span>
                          )}
                          {status === 'absent' && (
                            <span className="text-[8px] font-bold text-red-600 leading-none mt-0.5">A</span>
                          )}
                          {!status && isLocked && (
                            <span className="text-[8px] leading-none mt-0.5">🔒</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
