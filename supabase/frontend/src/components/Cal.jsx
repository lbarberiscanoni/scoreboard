// /frontend/src/components/Cal.jsx
import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const Cal = () => {
  const [credentials, setCredentials] = useState({
    appleId: '',
    appPassword: ''
  });
  const [status, setStatus] = useState('idle');
  const [calendarData, setCalendarData] = useState([]);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    console.log('Submitting form...');
    e.preventDefault();
    setStatus('loading');
    setError(null);

    try {
      const response = await fetch('/api/caldav', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch calendar data');
      }

      // Data should now be a direct array of calendars
      setCalendarData(data);
      setStatus('success');
    } catch (error) {
      console.error('Error:', error);
      setError(error.message);
      setStatus('error');
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Calendar Time Analytics</h1>
      
      <form onSubmit={handleSubmit} className="mb-8 max-w-md">
        <div className="mb-4">
          <label className="block mb-2 font-medium">Apple ID</label>
          <input
            type="email"
            value={credentials.appleId}
            onChange={(e) => setCredentials(prev => ({ ...prev, appleId: e.target.value }))}
            className="w-full border rounded-lg px-4 py-2"
            required
          />
        </div>
        
        <div className="mb-6">
          <label className="block mb-2 font-medium">App-Specific Password</label>
          <input
            type="password"
            value={credentials.appPassword}
            onChange={(e) => setCredentials(prev => ({ ...prev, appPassword: e.target.value }))}
            className="w-full border rounded-lg px-4 py-2"
            required
          />
        </div>

        <button 
          type="submit" 
          disabled={status === 'loading'}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400"
        >
          {status === 'loading' ? 'Analyzing...' : 'Analyze Calendar Time'}
        </button>
      </form>

      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {status === 'success' && calendarData.length > 0 && (
        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-6">Hours per Calendar</h2>
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <BarChart
                width={800}
                height={400}
                data={calendarData}
                margin={{ top: 20, right: 30, left: 40, bottom: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end"
                  height={100}
                  interval={0}
                />
                <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Bar dataKey="hours" fill="#4F46E5" />
              </BarChart>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6">Calendar Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {calendarData.map(calendar => (
                <div key={calendar.name} className="bg-white p-6 rounded-lg shadow-lg">
                  <h3 className="font-medium text-lg mb-2">{calendar.name}</h3>
                  <p className="text-3xl font-bold text-indigo-600">
                    {calendar.hours} hours
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Cal;