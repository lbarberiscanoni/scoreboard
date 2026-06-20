import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import EventChart from './components/EventChart';
import ProductivityDashboard from './components/ProductivityDashboard';

function App() {
  return (
    <Router>
      <Routes>
        {/* Personal productivity section */}
        <Route path="/personal" element={<ProductivityDashboard />} />
        <Route path="/productivity" element={<ProductivityDashboard />} />
        {/* Dynamic routes for different organizations and input types */}
        <Route path="/:organization/:inputType" element={<EventChart />} />
        {/* Default or fallback route */}
        <Route path="/" element={<h1>Welcome to the Dashboard</h1>} />
      </Routes>
    </Router>
  );
}

export default App;