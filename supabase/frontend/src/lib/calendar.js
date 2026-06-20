import * as d3 from 'd3';
import { createClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ *
 *  Calendar -> time-category data layer
 *
 *  The Hermes agent writes one `events` row per calendar event:
 *    { org_id, user_id, input_type_id (calendar), timestamp (start),
 *      end_time, title, color }
 *
 *  Categorization is by COLOR. Edit COLOR_TO_CATEGORY below to match
 *  what each of your calendar colors means.
 * ------------------------------------------------------------------ */

// ---- EDIT ME -------------------------------------------------------
// Map each calendar color -> a time category.
// Keys accept BOTH the Google colorId ("1".."11") and the lowercase
// color name, so it works however Hermes records the color.
export const COLOR_TO_CATEGORY = {
  '9': 'Engineering',            blueberry: 'Engineering',
  '2': 'Network',               sage: 'Network',
  '4': 'Sales and Marketing',   flamingo: 'Sales and Marketing',
  '3': 'Strategy',              grape: 'Strategy',
  '10': 'Operations',           basil: 'Operations',
  '11': 'Investor Relations',   tomato: 'Investor Relations',
  '8': 'Team',                  graphite: 'Team',
  '6': 'Reading',               tangerine: 'Reading',
  '1': 'Recruiting',            lavender: 'Recruiting',
  '5': 'Information Processing', banana: 'Information Processing',
  '7': 'Information Processing', peacock: 'Information Processing',
};
// --------------------------------------------------------------------

export const UNCATEGORIZED = 'Uncategorized';

export function categoryForColor(color) {
  if (color == null) return UNCATEGORIZED;
  const k = String(color).trim().toLowerCase();
  return COLOR_TO_CATEGORY[k] || UNCATEGORIZED;
}

/**
 * Turn raw calendar `events` rows into the shape the dashboard charts
 * expect: { months, totals, weekly, categories }.
 * Returns null if there is no usable data.
 *
 * rows: [{ timestamp, end_time, color, title }]
 */
export function aggregateCalendarEvents(rows) {
  const events = rows
    .map((r) => {
      const start = new Date(r.timestamp);
      const end = r.end_time ? new Date(r.end_time) : null;
      const hours = end ? (end - start) / 3.6e6 : 0;
      return { start, hours, category: categoryForColor(r.color) };
    })
    // drop zero-length, all-day, and obviously-bad spans
    .filter((e) => e.hours > 0 && e.hours <= 24 && !isNaN(e.start));

  if (events.length === 0) return null;

  // Stable category order: known categories first, extras after.
  const present = new Set(events.map((e) => e.category));
  const categories = [...present];

  // ---- months: % of each category per calendar month ----
  const byMonth = d3.rollup(
    events,
    (v) => d3.sum(v, (e) => e.hours),
    (e) => +d3.timeMonth(e.start),
    (e) => e.category
  );
  const months = Array.from(byMonth.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ms, catMap]) => {
      const total = d3.sum(Array.from(catMap.values()));
      const row = { date: new Date(ms) };
      categories.forEach((c) => (row[c] = total ? ((catMap.get(c) || 0) / total) * 100 : 0));
      return row;
    });

  // ---- totals: donut share over the whole period ----
  const totalHours = d3.sum(events, (e) => e.hours) || 1;
  const totals = categories
    .map((c) => ({
      key: c,
      value: (d3.sum(events.filter((e) => e.category === c), (e) => e.hours) / totalHours) * 100,
    }))
    .filter((t) => t.value > 0);

  // ---- weekly: hours in the most recent 7 days of data ----
  const maxDate = d3.max(events, (e) => e.start);
  const weekAgo = new Date(maxDate.getTime() - 7 * 864e5);
  const wk = events.filter((e) => e.start >= weekAgo);
  const wkTotal = d3.sum(wk, (e) => e.hours) || 1;
  const weekly = categories
    .map((c) => {
      const hours = Math.round(d3.sum(wk.filter((e) => e.category === c), (e) => e.hours) * 4) / 4;
      return { key: c, hours, pct: (hours / wkTotal) * 100 };
    })
    .filter((w) => w.hours > 0);

  return { months, totals, weekly, categories };
}

// ---- Supabase read path --------------------------------------------
const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_KEY;
const supabase = url && key ? createClient(url, key) : null;

/**
 * Fetch the personal-org calendar events and aggregate them.
 * Returns null when env/org/input-type/rows are missing so the caller
 * can fall back to dummy data.
 */
export async function fetchCalendarAggregates() {
  if (!supabase) return null;

  const { data: org } = await supabase
    .from('organizations').select('id').eq('name', 'personal').maybeSingle();
  if (!org) return null;

  const { data: it } = await supabase
    .from('input_types').select('id').eq('name', 'calendar').maybeSingle();
  if (!it) return null;

  const { data: rows, error } = await supabase
    .from('events')
    .select('timestamp,end_time,color,title')
    .eq('org_id', org.id)
    .eq('input_type_id', it.id)
    .order('timestamp', { ascending: true })
    .limit(5000);

  if (error || !rows || rows.length === 0) return null;
  return aggregateCalendarEvents(rows);
}
