import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import EventChart from './components/EventChart';

function App() {
  return (
    <Router>
      <Routes>
        {/* Dynamic routes for different organizations and input types */}
        <Route path="/:organization/:inputType" element={<EventChart />} />
        {/* Default or fallback route */}
        <Route path="/" element={<h1>Welcome to the Dashboard</h1>} />
      </Routes>
    </Router>
  );
}

export default App;