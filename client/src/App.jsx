import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import AddEmployee from './components/AddEmployee';
import EmployeeDetail from './components/EmployeeDetail';
import AttendanceView from './components/AttendanceView';

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/add" element={<AddEmployee />} />
        <Route path="/employee/:id" element={<EmployeeDetail />} />
        <Route path="/attendance" element={<AttendanceView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
