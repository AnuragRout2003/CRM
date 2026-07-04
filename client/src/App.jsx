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
      <div className="pt-16 pb-16 md:pb-0 flex flex-col min-h-screen">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/add" element={<AddEmployee />} />
          <Route path="/employee/:id" element={<EmployeeDetail />} />
          <Route path="/attendance" element={<AttendanceView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
