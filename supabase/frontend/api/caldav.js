import { DOMParser } from '@xmldom/xmldom';
import fetch from 'node-fetch';
import ical from 'node-ical';

const CALDAV_BASE = 'https://caldav.icloud.com';

async function makeCalDAVRequest(url, method, headers, body) {
  const response = await fetch(url, { method, headers, body });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${responseText}`);
  return responseText;
}

async function getCalendarEvents(calendarUrl, authHeader, startUTC, endUTC) {
  console.log('Fetching events for calendar:', calendarUrl);

  const queryBody = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${startUTC}" end="${endUTC}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  const eventsXml = await makeCalDAVRequest(
    `${CALDAV_BASE}${calendarUrl}`,
    'REPORT',
    {
      Authorization: authHeader,
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
      'User-Agent': 'Mozilla/5.0 (iCalFetcher/1.0)',
      Prefer: 'return-minimal'
    },
    queryBody
  );
  return eventsXml;
}

function calculateEventHours(eventsXml) {
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
          const startTime = item.start;
          const endTime = item.end;
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
}

// Helper to build a iCalendar UTC string
function toICalUTCString(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

export default async function handler(req, res) {
  // We'll read the Apple ID and app-specific password from the request body
  // or from environment variables if you prefer.
  const { appleId, appPassword } = req.body || {};

  if (!appleId || !appPassword) {
    return res.status(400).json({ error: 'Missing appleId or appPassword.' });
  }

  const authHeader = 'Basic ' + Buffer.from(`${appleId}:${appPassword}`).toString('base64');

  // Example: limit events to the last 7 days
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startUTC = toICalUTCString(sevenDaysAgo);
  const endUTC = toICalUTCString(now);

  try {
    // 1) Get the list of calendars
    const calendarsXml = await makeCalDAVRequest(
      `${CALDAV_BASE}/8310088992/calendars/`,
      'PROPFIND',
      {
        Authorization: authHeader,
        Depth: '1',
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

    // 2) Parse out the calendars
    const parser = new DOMParser();
    const doc = parser.parseFromString(calendarsXml, 'text/xml');
    const responses = doc.getElementsByTagName('response');

    // 3) For each calendar, fetch events in the last 7 days
    const calendarPromises = [];
    for (let i = 0; i < responses.length; i++) {
      const href = responses[i].getElementsByTagName('href')[0]?.textContent;
      const displayName = responses[i].getElementsByTagName('displayname')[0]?.textContent;
      // Skip the base container
      if (href && displayName && href !== '/8310088992/calendars/') {
        calendarPromises.push(
          getCalendarEvents(href, authHeader, startUTC, endUTC).then((eventsXml) => ({
            id: href,
            name: displayName,
            hours: calculateEventHours(eventsXml)
          }))
        );
      }
    }

    const calendars = await Promise.all(calendarPromises);
    return res.status(200).json(calendars);
  } catch (error) {
    console.error('Request failed:', error);
    return res.status(500).json({ error: error.message });
  }
}