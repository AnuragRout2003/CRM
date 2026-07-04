import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const API_EMPLOYEES = 'http://localhost:5000/api/employees';
const API_ATTENDANCE = 'http://localhost:5000/api/attendance';

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

  const isDateOlderThan7Days = (date) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return date < sevenDaysAgo;
  };

  if (loading) {
    return (
      <div className="main-content">
        <div className="loading-container">
          <div className="spinner" />
          <span className="loading-text">Loading attendance matrix...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content" style={{ maxWidth: '100%' }}>
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.message}</div>
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Attendance Matrix</h1>
          <p>Quickly mark attendance for all employees, week by week.</p>
        </div>
        
        <div className="calendar-nav" style={{ background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <button className="btn btn-secondary btn-sm" onClick={prevWeek}>◀ Prev</button>
          <button className="btn btn-secondary btn-sm" onClick={goToToday}>Today</button>
          <button className="btn btn-secondary btn-sm" onClick={nextWeek}>Next ▶</button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-header">
          <h2>Week of {formatDateLabel(weekDates[0])} — {formatDateLabel(weekDates[6])}</h2>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid var(--accent-success)', borderRadius: '2px' }}></span> Present</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--accent-danger)', borderRadius: '2px' }}></span> Absent</span>
          </div>
        </div>
        
        <div className="table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 10, borderRight: '2px solid var(--border-color)', minWidth: '200px' }}>
                  Employee Name
                </th>
                {weekDates.map((date, i) => {
                  const isToday = new Date().toDateString() === date.toDateString();
                  return (
                    <th key={i} style={{ textAlign: 'center', minWidth: '120px', background: isToday ? 'rgba(2, 132, 199, 0.05)' : 'var(--bg-secondary)', color: isToday ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                      {formatDateLabel(date)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="empty-state" style={{ padding: 0 }}>
                      <p>No employees found. Add an employee to get started.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp._id}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 9, borderRight: '2px solid var(--border-color)', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {emp.profilePicture ? (
                          <img src={`http://localhost:5000/uploads/${emp.profilePicture}`} alt={emp.name} className="avatar-sm" style={{ width: '28px', height: '28px' }} />
                        ) : (
                          <div className="avatar-sm" style={{ width: '28px', height: '28px', background: 'var(--border-color)' }}></div>
                        )}
                        {emp.name}
                      </div>
                    </td>
                    {weekDates.map((date, i) => {
                      const status = getStatus(emp._id, date);
                      
                      const now = new Date();
                      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                      const cellDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                      
                      const sevenDaysAgo = new Date(today);
                      sevenDaysAgo.setDate(today.getDate() - 7);
                      
                      const sevenDaysFuture = new Date(today);
                      sevenDaysFuture.setDate(today.getDate() + 7);
                      
                      const isLocked = cellDate < sevenDaysAgo || cellDate > sevenDaysFuture;
                      
                      let cellStyle = {
                        textAlign: 'center',
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        userSelect: 'none',
                        transition: 'all 0.15s ease',
                        borderRight: '1px solid var(--border-color)',
                        height: '60px',
                        opacity: isLocked ? 0.4 : 1, // Visually fade locked cells
                        position: 'relative' // For absolute positioning lock icon if needed
                      };
                      
                      let content = <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>-</span>;

                      if (status === 'present') {
                        cellStyle.background = 'rgba(16, 185, 129, 0.25)';
                        cellStyle.color = 'var(--accent-success)';
                        cellStyle.fontWeight = 'bold';
                        content = 'P';
                      } else if (status === 'absent') {
                        cellStyle.background = 'rgba(239, 68, 68, 0.25)';
                        cellStyle.color = 'var(--accent-danger)';
                        cellStyle.fontWeight = 'bold';
                        content = 'A';
                      } else if (isLocked) {
                        cellStyle.background = 'rgba(0, 0, 0, 0.02)';
                      }

                      return (
                        <td 
                          key={i} 
                          style={cellStyle}
                          onClick={() => !isLocked && handleCellClick(emp._id, date)}
                          onMouseEnter={(e) => {
                            if (!status && !isLocked) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)';
                          }}
                          onMouseLeave={(e) => {
                            if (!status && !isLocked) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {content}
                          {isLocked && <span style={{ position: 'absolute', top: '2px', right: '2px', fontSize: '0.6rem', opacity: 0.7 }}>🔒</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
