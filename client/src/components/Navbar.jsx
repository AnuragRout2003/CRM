import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">
        <img src="/logo.png" alt="Rout Plumbing Solutions" className="navbar-logo-img" />
        <div className="navbar-title">
          <span>Rout</span> Plumbing Solutions
        </div>
      </NavLink>
      <div className="navbar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          📊 Dashboard
        </NavLink>
        <NavLink
          to="/add"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          ➕ Add Employee
        </NavLink>
        <NavLink
          to="/attendance"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          📅 Attendance
        </NavLink>
      </div>
    </nav>
  );
}
