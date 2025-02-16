// /frontend/caldav-proxy/server.js

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import { DOMParser } from '@xmldom/xmldom';
import ical from 'node-ical'; // node-ical for robust iCal parsing

const app = express();
app.use(cors());
app.use(bodyParser.json());

const CALDAV_BASE = 'https://caldav.icloud.com';

function toICalUTCString(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

// We'll query from 7 days ago to now
const now = new Date();
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const startUTC = toICalUTCString(sevenDaysAgo);
const endUTC = toICalUTCString(now);

// Reusable fetch wrapper
const makeCalDAVRequest = async (url, method, headers, body) => {
  try {
    const response = await fetch(url, { method, headers, body });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${responseText}`);
    return responseText;
  } catch (error) {
    console.error('CalDAV request error:', error);
    throw error;
  }
};

// Fetch the iCal data for a given calendar
const getCalendarEvents = async (calendarUrl, authHeader) => {
  console.log('Fetching events for calendar:', calendarUrl);

  // Build a REPORT query that includes the last 7 days via <c:time-range>
  const queryBody = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <!-- Only return events that intersect with the last 7 days -->
        <c:time-range start="${startUTC}" end="${endUTC}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  try {
    const eventsXml = await makeCalDAVRequest(
      `${CALDAV_BASE}${calendarUrl}`,
      'REPORT',
      {
        'Authorization': authHeader,
        'Depth': '1',
        'Content-Type': 'application/xml; charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (iCalFetcher/1.0)',
        'Prefer': 'return-minimal'
      },
      queryBody
    );
    return eventsXml;
  } catch (error) {
    console.error(`Error fetching events for calendar ${calendarUrl}:`, error);
    return null;
  }
};

// Parse iCal data with node-ical, summing event durations
const calculateEventHours = (eventsXml) => {
  if (!eventsXml) return 0;

  const parser = new DOMParser();
  const doc = parser.parseFromString(eventsXml, 'text/xml');
  const calendarDatas = doc.getElementsByTagName('calendar-data');

  let totalHours = 0;

  for (let i = 0; i < calendarDatas.length; i++) {
    const icalData = calendarDatas[i].textContent || '';
    try {
      const parsed = ical.sync.parseICS(icalData);
      for (const key in parsed) {
        if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue;
        const item = parsed[key];
        if (item.type === 'VEVENT') {
          const startTime = item.start; // Date
          const endTime = item.end;     // Date
          if (startTime && endTime) {
            const durationHours = (endTime - startTime) / (1000 * 60 * 60);
            totalHours += durationHours;
          }
        }
      }
    } catch (err) {
      console.error('Failed to parse iCal data:', err);
    }
  }
  return Math.round(totalHours * 10) / 10;
};

app.post('/api/calendar/fetch', async (req, res) => {
  const { appleId, appPassword } = req.body;
  const authHeader = 'Basic ' + Buffer.from(`${appleId}:${appPassword}`).toString('base64');
  
  try {
    // First, find all user calendars
    const calendarsXml = await makeCalDAVRequest(
      `${CALDAV_BASE}/8310088992/calendars/`,
      'PROPFIND',
      {
        'Authorization': authHeader,
        'Depth': '1',
        'Content-Type': 'application/xml; charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (iCalFetcher/1.0)'
      },
      `<?xml version="1.0" encoding="utf-8"?>
       <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
         <d:prop>
           <d:resourcetype />
           <d:displayname />
           <c:supported-calendar-component-set />
         </d:prop>
       </d:propfind>`
    );
    
    // Parse the calendars
    const parser = new DOMParser();
    const doc = parser.parseFromString(calendarsXml, 'text/xml');
    const responses = doc.getElementsByTagName('response');
    
    // For each calendar, fetch events (limited to last 7 days), parse hours
    const calendarPromises = [];
    for (let i = 0; i < responses.length; i++) {
      const href = responses[i].getElementsByTagName('href')[0]?.textContent;
      const displayName = responses[i].getElementsByTagName('displayname')[0]?.textContent;
      // Exclude the base container
      if (href && displayName && href !== '/8310088992/calendars/') {
        calendarPromises.push(
          getCalendarEvents(href, authHeader).then(eventsXml => ({
            id: href,
            name: displayName,
            hours: calculateEventHours(eventsXml)
          }))
        );
      }
    }
    
    const calendars = (await Promise.all(calendarPromises)).filter(cal => cal !== null);
    res.json(calendars);
  } catch (error) {
    console.error('Request failed:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`));