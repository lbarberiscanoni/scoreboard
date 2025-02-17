import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import EventChart from './components/EventChart';
import CalendarClient from './components/Cal';
import Cal from './components/Cal';

function App() {
  return (
    <Router>
      <Routes>
        {/* Dynamic routes for different organizations and input types */}
        <Route path="/:organization/:inputType" element={<EventChart />} />
        <Route path="/cal" element={<Cal />} />
        {/* Default or fallback route */}
        <Route path="/" element={<h1>Welcome to the Dashboard</h1>} />
      </Routes>
    </Router>
  );
}

export default App;