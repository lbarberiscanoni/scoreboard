import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { createClient } from '@supabase/supabase-js';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper: Returns the previous Thursday.
// If today is Thursday, returns 7 days ago.
function getLastThursday() {
  const now = new Date();
  const day = now.getDay(); // Sunday: 0, Monday: 1, ..., Saturday: 6
  // Thursday is day 4.
  let daysToSubtract = (day - 4 + 7) % 7;
  if (daysToSubtract === 0) {
    daysToSubtract = 7; // On Thursday, use previous Thursday.
  }
  const lastThursday = new Date(now);
  lastThursday.setDate(now.getDate() - daysToSubtract);
  return lastThursday;
}

const EventChart = () => {
  const { organization, inputType } = useParams(); // Get organization and inputType from URL parameters
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inputTypesMap, setInputTypesMap] = useState({});

  // Define chart labels based on input type
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
    all: {
      title: "Touch Points (Combined Events)",
      xAxis: "Event #",
    }
  };

  const selectedLabels = inputTypeLabels[inputType] || {
    title: "Event Chart",
    xAxis: "Event #",
  };

  // Fetch data when organization or inputType changes
  useEffect(() => {
    const fetchData = async () => {
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

        // Fetch all input types and create a map
        const { data: inputTypes, error: inputTypeError } = await supabase
          .from('input_types')
          .select('id, name');
        
        if (inputTypeError) {
          throw new Error('Error fetching input types');
        }
        
        // Create a map of input type ids to names
        const typesMap = inputTypes.reduce((map, type) => {
          map[type.id] = type.name;
          return map;
        }, {});
        
        setInputTypesMap(typesMap);

        // If inputType is not 'all', filter by the specific input type
        let inputTypeId = null;
        if (inputType !== 'all') {
          const matchedType = inputTypes.find(type => type.name === inputType);
          if (!matchedType) {
            throw new Error(`Input type '${inputType}' not found`);
          }
          inputTypeId = matchedType.id;
        }

        // Fetch users associated with the organization
        const { data: users, error: userError } = await supabase
          .from('users')
          .select('id, name')
          .eq('org_id', orgId);
        if (userError) throw userError;

        // Calculate the cutoff date as last Thursday
        const lastThursday = getLastThursday();
        console.log('Using last Thursday as cutoff:', lastThursday);

        // Fetch events based on the organization ID and input type ID (last 60 days)
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        
        // Build the query based on whether we're filtering by input type or not
        let eventsQuery = supabase
          .from('events')
          .select('*')
          .eq('org_id', orgId)
          .gte('timestamp', sixtyDaysAgo.toISOString())
          .order('timestamp', { ascending: true });
          
        // Only add the input type filter if not 'all'
        if (inputType !== 'all' && inputTypeId !== null) {
          eventsQuery = eventsQuery.eq('input_type_id', inputTypeId);
        }
        
        const { data: events, error: eventError } = await eventsQuery;
        if (eventError) throw eventError;

        if (events && events.length > 0) {
          // Build a map from user ID to name
          const userMap = users.reduce((map, user) => {
            map[user.id] = user.name;
            return map;
          }, {});

          // Group events by user
          const groupedByUser = events.reduce((acc, event) => {
            const userId = event.user_id;
            if (!acc[userId]) acc[userId] = [];
            acc[userId].push(event);
            return acc;
          }, {});

          const userEventCounts = {};
          const userRecentEventCounts = {};

          const colorMap = generateColors(Object.keys(groupedByUser).length);
          const datasets = Object.keys(groupedByUser).map((userId, index) => {
            const userEvents = groupedByUser[userId];
            const data = [];
            let prevTimestamp = null;

            // Total events count
            userEventCounts[userId] = userEvents.length;
            // Count recent events since last Thursday
            userRecentEventCounts[userId] = userEvents.filter(event => 
              new Date(event.timestamp) >= lastThursday
            ).length;

            userEvents.forEach((event) => {
              if (prevTimestamp) {
                // Calculate difference in days between this event and previous event
                const diff = (new Date(event.timestamp) - new Date(prevTimestamp)) / (1000 * 60 * 60 * 24);
                data.push(diff);
              } else {
                data.push(0); // For the first event, show 0
              }
              prevTimestamp = event.timestamp;
            });

            const recentEventsDisplay = userRecentEventCounts[userId] > 0 
              ? ` +${userRecentEventCounts[userId]}` 
              : '';

            return {
              label: `${userMap[userId] || `User ${userId}`} (${userEventCounts[userId]})${recentEventsDisplay}`,
              data,
              fill: false,
              borderColor: colorMap[index],
              backgroundColor: colorMap[index],
              pointBackgroundColor: colorMap[index],
              pointBorderColor: colorMap[index],
            };
          });

          // Sort datasets by the number of events
          const sortedDatasets = datasets.sort((a, b) => b.data.length - a.data.length);
          const eventNumbers = events.map((_, index) => `${index + 1}`);

          setChartData({
            labels: eventNumbers,
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

    fetchData();
  }, [organization, inputType]);

  // Helper function to generate a distinct color for each user
  const generateColors = (numColors) => {
    const colors = [];
    for (let i = 0; i < numColors; i++) {
      const hue = (i * 360) / numColors;
      colors.push(`hsl(${hue}, 70%, 50%)`);
    }
    return colors;
  };

  // Calculate max event number for x-axis scaling
  const maxEvents = chartData.datasets.reduce((max, dataset) => {
    const eventCount = dataset.data.length;
    return eventCount > max ? eventCount : max;
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
                  max: maxEvents + 10,
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