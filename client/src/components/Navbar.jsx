import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <>
      {/* ── Top Navbar (always visible) ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-4 md:px-8 bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm">
        {/* Brand / Logo */}
        <NavLink to="/" className="flex items-center gap-2.5 no-underline">
          <img
            src="/logo.png"
            alt="Rout Plumbing Solutions"
            className="h-9 w-9 rounded-lg object-contain shadow-sm"
          />
          {/* Full title on desktop, short on mobile */}
          <div className="hidden md:block text-lg font-bold tracking-tight text-slate-800">
            <span className="text-sky-600">Rout</span> Plumbing Solutions
          </div>
          <div className="block md:hidden text-lg font-bold tracking-tight text-slate-800">
            <span className="text-sky-600">Rout</span> PS
          </div>
        </NavLink>

        {/* Desktop nav links (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-200'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`
            }
          >
            📊 Dashboard
          </NavLink>
          <NavLink
            to="/add"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-200'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`
            }
          >
            ➕ Add Employee
          </NavLink>
          <NavLink
            to="/attendance"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-200'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`
            }
          >
            📅 Attendance
          </NavLink>
        </div>
      </nav>

      {/* ── Mobile Bottom Tab Bar (visible only on mobile) ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around h-16">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-semibold transition-colors duration-200 ${
                isActive
                  ? 'text-sky-600 border-t-2 border-sky-600 -mt-px'
                  : 'text-slate-400'
              }`
            }
          >
            <span className="text-xl leading-none">📊</span>
            Dashboard
          </NavLink>
          <NavLink
            to="/add"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-semibold transition-colors duration-200 ${
                isActive
                  ? 'text-sky-600 border-t-2 border-sky-600 -mt-px'
                  : 'text-slate-400'
              }`
            }
          >
            <span className="text-xl leading-none">➕</span>
            Add
          </NavLink>
          <NavLink
            to="/attendance"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 gap-0.5 text-xs font-semibold transition-colors duration-200 ${
                isActive
                  ? 'text-sky-600 border-t-2 border-sky-600 -mt-px'
                  : 'text-slate-400'
              }`
            }
          >
            <span className="text-xl leading-none">📅</span>
            Attendance
          </NavLink>
        </div>
      </nav>
    </>
  );
}
