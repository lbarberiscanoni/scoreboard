import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { createClient } from '@supabase/supabase-js';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const EventChart = () => {
  const { organization, inputType } = useParams(); // Get organization and inputType from URL parameters
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoized fetching of data
  const fetchData = useMemo(() => {
    return async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch organization details based on URL parameter
        console.log('Fetching organization with name:', organization);
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('id')
          .eq('name', organization)
          .single();
        console.log('Fetched organization data:', orgData, 'Error:', orgError);

        const orgId = orgData.id;

        // Fetch input type ID based on inputType URL parameter
        const { data: inputTypeData, error: inputTypeError } = await supabase
          .from('input_types')
          .select('id')
          .eq('name', inputType)
          .single();

        if (inputTypeError || !inputTypeData) {
          throw new Error('Input type not found or error fetching input type');
        }

        const inputTypeId = inputTypeData.id;

        // Fetch users associated with the organization
        const { data: users, error: userError } = await supabase
          .from('users')
          .select('id, name')
          .eq('org_id', orgId);

        if (userError) throw userError;

        // Fetch events based on the organization ID and input type ID
        const { data: events, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('org_id', orgId)
          .eq('input_type_id', inputTypeId)
          .order('timestamp', { ascending: true });

        if (eventError) throw eventError;

        if (events && events.length > 0) {
          const userMap = users.reduce((map, user) => {
            map[user.id] = user.name;
            return map;
          }, {});

          const groupedByUser = events.reduce((acc, event) => {
            const userId = event.user_id;
            if (!acc[userId]) acc[userId] = [];
            acc[userId].push(event);
            return acc;
          }, {});

          const userCommitCounts = {};
          const colorMap = generateColors(Object.keys(groupedByUser).length);
          const datasets = Object.keys(groupedByUser).map((userId, index) => {
            const userEvents = groupedByUser[userId];
            const data = [];
            let prevTimestamp = null;

            userEvents.forEach((event) => {
              if (prevTimestamp) {
                const diff = (new Date(event.timestamp) - new Date(prevTimestamp)) / (1000 * 60 * 60 * 24); // Difference in days
                data.push(diff);
              } else {
                data.push(0); // Initial value
              }
              prevTimestamp = event.timestamp;
            });

            userCommitCounts[userId] = userEvents.length;

            return {
              label: `${userMap[userId] || `User ${userId}`} (${userCommitCounts[userId]})`,
              data,
              fill: false,
              borderColor: colorMap[index],
              backgroundColor: colorMap[index],
              pointBackgroundColor: colorMap[index],
              pointBorderColor: colorMap[index],
            };
          });

          const sortedDatasets = datasets.sort((a, b) => b.data.length - a.data.length); // Sort by number of commits
          const commitNumbers = events.map((_, index) => `${index + 1}`);

          setChartData({
            labels: commitNumbers,
            datasets: sortedDatasets,
          });
        } else {
          console.warn('No events found.');
        }
      } catch (err) {
        setError(err.message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
  }, [organization, inputType]); // Dependencies for memoization

  useEffect(() => {
    fetchData(); // Call the memoized function
  }, [fetchData]);

  const generateColors = (numColors) => {
    const colors = [];
    for (let i = 0; i < numColors; i++) {
      const hue = (i * 360) / numColors;
      colors.push(`hsl(${hue}, 70%, 50%)`);
    }
    return colors;
  };

  // Calculate max commit number for x-axis
  const maxCommits = chartData.datasets.reduce((max, dataset) => {
    const commitCount = dataset.data.length;
    return commitCount > max ? commitCount : max;
  }, 0);

  return (
    <div style={{ width: '100%', maxWidth: '1000px', margin: 'auto' }}>
      <h2>Time Between Commits</h2>
      {loading ? (
        <p>Loading chart data...</p>
      ) : error ? (
        <p>{error}</p>
      ) : chartData.labels.length > 0 ? (
        <div style={{ position: 'relative', height: '80vh', width: '100%' }}>
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: {
                  title: {
                    display: true,
                    text: 'Commit #',
                  },
                  max: maxCommits + 10, // Set the maximum value to the max commits + 10
                },
                y: {
                  title: {
                    display: true,
                    text: '# of Days',
                  },
                },
              },
              plugins: {
                legend: {
                  display: true,
                  position: 'right',
                  align: 'start',
                  labels: {
                    usePointStyle: true,
                    pointStyle: 'circle',
                  },
                },
              },
            }}
          />
        </div>
      ) : (
        <p>No data available.</p>
      )}
    </div>
  );
};

export default EventChart;