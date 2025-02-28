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

  // Define input type labels for title and x-axis
  const inputTypeLabels = {
    code: {
      title: "Time Between Commits",
      xAxis: "Commit #",
    },
    email: {
      title: "Time Between Emails Sent",
      xAxis: "Email #",
    },
    notion: {
      title: "Time Between Notion Checkboxes Checked",
      xAxis: "Checkbox #",
    },
  };

  const selectedLabels = inputTypeLabels[inputType] || {
    title: "Event Chart",
    xAxis: "Event #",
  };

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

        if (orgError || !orgData) {
          throw new Error('Organization not found or error fetching organization');
        }

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

        // Calculate the date 60 days ago
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        
        // Calculate the date 7 days ago for recent activity
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Fetch events based on the organization ID and input type ID
        const { data: events, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('org_id', orgId)
          .eq('input_type_id', inputTypeId)
          .gte('timestamp', sixtyDaysAgo.toISOString()) // Filter by timestamp
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
          const userRecentCommitCounts = {};
          
          const colorMap = generateColors(Object.keys(groupedByUser).length);
          const datasets = Object.keys(groupedByUser).map((userId, index) => {
            const userEvents = groupedByUser[userId];
            const data = [];
            let prevTimestamp = null;

            // Count total commits
            userCommitCounts[userId] = userEvents.length;
            
            // Count recent commits (last 7 days)
            userRecentCommitCounts[userId] = userEvents.filter(event => 
              new Date(event.timestamp) >= sevenDaysAgo
            ).length;

            userEvents.forEach((event) => {
              if (prevTimestamp) {
                const diff = (new Date(event.timestamp) - new Date(prevTimestamp)) / (1000 * 60 * 60 * 24); // Difference in days
                data.push(diff);
              } else {
                data.push(0); // Initial value
              }
              prevTimestamp = event.timestamp;
            });

            const recentCommitDisplay = userRecentCommitCounts[userId] > 0 
              ? ` +${userRecentCommitCounts[userId]}` 
              : '';

            return {
              label: `${userMap[userId] || `User ${userId}`} (${userCommitCounts[userId]})${recentCommitDisplay}`,
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
      <h2>{selectedLabels.title}</h2>
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
                    text: selectedLabels.xAxis,
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
                tooltip: {
                  callbacks: {
                    title: function(tooltipItems) {
                      return `${selectedLabels.xAxis.replace(' #', '')} ${tooltipItems[0].label}`;
                    },
                    label: function(context) {
                      return `${context.dataset.label}: ${context.raw.toFixed(2)} days`;
                    }
                  }
                }
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