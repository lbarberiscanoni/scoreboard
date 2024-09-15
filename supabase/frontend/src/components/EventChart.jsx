import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { createClient } from '@supabase/supabase-js';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const EventChart = () => {
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [],
  });

  useEffect(() => {
    const fetchData = async () => {
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, name')
        .eq('org_id', 2); // Assuming org_id = 2 is Valyria

      if (userError) {
        console.error('Error fetching users:', userError);
        return;
      }

      const { data: events, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('org_id', 2) // Assuming org_id = 2 is Valyria
        .order('timestamp', { ascending: true });

      if (eventError) {
        console.error('Error fetching events:', eventError);
        return;
      }

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

          userEvents.forEach((event, index) => {
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

        const sortedDatasets = datasets.sort((a, b) => {
          const userAId = Object.keys(userMap).find((key) => userMap[key] === a.label.split(' ')[0]);
          const userBId = Object.keys(userMap).find((key) => userMap[key] === b.label.split(' ')[0]);
          return (userCommitCounts[userBId] || 0) - (userCommitCounts[userAId] || 0);
        });

        const commitNumbers = events.map((_, index) => `${index + 1}`);

        setChartData({
          labels: commitNumbers,
          datasets: sortedDatasets,
        });
      } else {
        console.warn('No events found.');
      }
    };

    fetchData();
  }, []);

  // Function to generate high-contrast colors dynamically
  const generateColors = (numColors) => {
    const colors = [];
    for (let i = 0; i < numColors; i++) {
      const hue = (i * 360) / numColors;
      colors.push(`hsl(${hue}, 70%, 50%)`); // Adjust saturation and lightness as needed
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
      {chartData.labels.length > 0 ? (
        <div
          style={{
            position: 'relative',
            height: '80vh', // Adjust height as needed
            width: '100%',
          }}
        >
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
                  max: maxCommits, // Cut off extra whitespace
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
        <p>Loading chart data...</p>
      )}
    </div>
  );
};

export default EventChart;