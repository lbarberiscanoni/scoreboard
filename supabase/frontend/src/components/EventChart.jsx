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
  const { organization, inputType } = useParams();
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      title: "Time Between Touch Points",
      xAxis: "Event #",
    }
  };

  const selectedLabels = inputTypeLabels[inputType] || {
    title: "Event Chart",
    xAxis: "Event #",
  };

  // Map input type names to their IDs based on the input_types table
  const inputTypeToIdMap = {
    notion: 1,
    code: 2,
    email: 3,
    documentation: 10,
    legal: 11
  };

  // Helper function to find user across organizations
  const findUserAcrossOrgs = async (userId) => {
    const { data: userCrossOrg, error } = await supabase
      .from('users')
      .select('id, name, github_username, org_id')
      .eq('id', userId);

    if (error || !userCrossOrg || userCrossOrg.length === 0) {
      return null;
    }

    return userCrossOrg[0];
  };
  
  // Fetch data when organization or inputType changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
  
      try {
        // Fetch organization details based on URL parameter
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('id')
          .eq('name', organization)
          .single();
  
        if (orgError || !orgData) {
          throw new Error('Organization not found or error fetching organization');
        }
        const orgId = orgData.id;
  
        // Determine input_type_id from the URL inputType
        let inputTypeId = null;
        if (inputType !== 'all') {
          inputTypeId = inputTypeToIdMap[inputType];
          if (!inputTypeId) {
            throw new Error(`Input type '${inputType}' not found`);
          }
        }
  
        // Fetch all events within the last 60 days using pagination
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const sixtyDaysAgoUTC = new Date(sixtyDaysAgo.toISOString());
  
        // Build the base query
        let baseQuery = supabase
          .from('events')
          .select('*', { count: 'exact' })
          .eq('org_id', orgId)
          .gte('timestamp', sixtyDaysAgoUTC.toISOString());
  
        if (inputType !== 'all' && inputTypeId !== null) {
          baseQuery = baseQuery.eq('input_type_id', inputTypeId);
        }
  
        // Fetch events in batches
        const batchSize = 1000; // Fetch 1000 events per batch
        let allEvents = [];
        let page = 0;
        let hasMore = true;
  
        while (hasMore) {
          const { data: batchEvents, error: eventError, count } = await baseQuery
            .order('timestamp', { ascending: false })
            .range(page * batchSize, (page + 1) * batchSize - 1);
  
          if (eventError) {
            throw eventError;
          }
  
          if (batchEvents && batchEvents.length > 0) {
            allEvents = [...allEvents, ...batchEvents];
            page++;
            hasMore = allEvents.length < count;
          } else {
            hasMore = false;
          }
        }
  
        if (allEvents.length > 0) {
  
          // Extended user mapping to handle cross-organization users
          const userMap = {};
  
          for (const event of allEvents) {
            const userId = event.user_id;
  
            // If user not in map, try to find across organizations
            if (!userMap[userId]) {
              const crossOrgUser = await findUserAcrossOrgs(userId);
  
              if (crossOrgUser) {
                userMap[userId] = {
                  name: crossOrgUser.name || `User ${userId}`,
                  github: crossOrgUser.github_username || null,
                  org_id: crossOrgUser.org_id
                };
              } else {
                // Fallback if no user found
                userMap[userId] = {
                  name: `User ${userId}`,
                  github: null,
                  org_id: null
                };
              }
            }
          }
  
          // Group events by user
          const groupedByUser = allEvents.reduce((acc, event) => {
            const userId = event.user_id;
            if (!acc[userId]) acc[userId] = [];
            acc[userId].push(event);
            return acc;
          }, {});
  
          const userEventCounts = {};
          const userRecentEventCounts = {};
          const lastThursday = getLastThursday();
          const lastThursdayMs = lastThursday.getTime();
  
          const colorMap = generateColors(Object.keys(groupedByUser).length);
          const datasets = Object.keys(groupedByUser).map((userId, index) => {
            const userEvents = groupedByUser[userId];
            const data = [];
            let prevTimestamp = null;
  
            // Total events count
            userEventCounts[userId] = userEvents.length;
  
            // Calculate recent event counts on the client side
            userRecentEventCounts[userId] = userEvents.filter(event => {
              const eventDateMs = new Date(event.timestamp).getTime();
              return eventDateMs >= lastThursdayMs;
            }).length;
  
            // Sort userEvents by timestamp ascending for the chart
            userEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
            userEvents.forEach((event) => {
              if (prevTimestamp) {
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
  
            const userInfo = userMap[userId];
  
            // Create display name with GitHub username if available
            const displayName = userInfo.github 
              ? `${userInfo.name} (${userInfo.github})` 
              : userInfo.name;
  
            // Special handling for Joel
            let label = `${displayName} (${userEventCounts[userId]})${recentEventsDisplay}`;
  
            return {
              label,
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
  
          const eventNumbers = allEvents.map((_, index) => `${index + 1}`);
  
          setChartData({
            labels: eventNumbers,
            datasets: sortedDatasets,
          });
        }
      } catch (err) {
        setError(err.message);
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