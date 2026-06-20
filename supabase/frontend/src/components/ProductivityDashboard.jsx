import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { fetchCalendarAggregates } from '../lib/calendar';

/* ------------------------------------------------------------------ *
 *  Personal Productivity Dashboard (DUMMY DATA)
 *
 *  Three D3 charts modelled on the reference designs:
 *    1. Stacked area  — time allocation as a % of total, over time
 *    2. Donut         — breakdown of total time over the whole period
 *    3. Weekly combo  — hours (bars) + % of week (line), most recent week
 *
 *  All data here is fabricated. Swap `buildDummyData()` for a real
 *  calendar feed (e.g. parsed .ics events grouped by category) later.
 * ------------------------------------------------------------------ */

// Category palette — pulled to match the reference charts.
const CATEGORIES = [
  { key: 'Engineering', color: '#4f6ef0' },
  { key: 'Network', color: '#7e9472' },
  { key: 'Sales and Marketing', color: '#bdeee0' },
  { key: 'Strategy', color: '#b18d5a' },
  { key: 'Operations', color: '#74e0ad' },
  { key: 'Investor Relations', color: '#e06d6d' },
  { key: 'Team', color: '#c8ccd1' },
  { key: 'Reading', color: '#edd9c0' },
  { key: 'Recruiting', color: '#3a4a78' },
  { key: 'Information Processing', color: '#f5b81f' },
];

const COLOR_OF = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.color]));

// Fallback color for any category not in the fixed palette (e.g. "Uncategorized")
const colorFor = (key) => COLOR_OF[key] || '#8b8f96';

// Category keys present in a data row, ordered: known palette first, extras after.
const orderedKeys = (row) => {
  const present = Object.keys(row).filter((k) => k !== 'date');
  const known = CATEGORIES.map((c) => c.key).filter((k) => present.includes(k));
  const extras = present.filter((k) => !known.includes(k));
  return [...known, ...extras];
};

// Theme tokens
const BG = '#23272f';
const FG = '#e7e9ec';
const MUTED = '#9aa0a8';
const GRID = 'rgba(255,255,255,0.07)';

// ----- Deterministic pseudo-random so dummy data is stable across renders -----
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Rough "personality" weight per category so the dummy data looks realistic
// (matches the donut proportions in the reference: Network & Info Processing big).
const BASE_WEIGHT = {
  Engineering: 4,
  Network: 30,
  'Sales and Marketing': 3,
  Strategy: 5,
  Operations: 3,
  'Investor Relations': 6,
  Team: 14,
  Reading: 6,
  Recruiting: 3,
  'Information Processing': 23,
};

function buildDummyData() {
  const rng = makeRng(42);
  const months = [];
  const start = new Date(2023, 4, 1); // May 2023

  for (let i = 0; i < 24; i++) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const raw = {};
    let total = 0;
    for (const { key } of CATEGORIES) {
      // wobble around the base weight with a slow trend + noise
      const trend = 1 + 0.45 * Math.sin((i / 24) * Math.PI * 2 + key.length);
      const noise = 0.6 + rng() * 0.8;
      const v = Math.max(0.5, BASE_WEIGHT[key] * trend * noise);
      raw[key] = v;
      total += v;
    }
    // normalise to percentages
    const pct = { date };
    for (const { key } of CATEGORIES) pct[key] = (raw[key] / total) * 100;
    months.push(pct);
  }

  // Donut totals = average share across all months
  const totals = CATEGORIES.map(({ key }) => ({
    key,
    value: d3.mean(months, (m) => m[key]),
  }));
  const sum = d3.sum(totals, (t) => t.value);
  totals.forEach((t) => (t.value = (t.value / sum) * 100));

  // Most-recent-week hours (sum ~48h of tracked time)
  const weekly = CATEGORIES.map(({ key }) => {
    const share = totals.find((t) => t.key === key).value / 100;
    const hours = Math.round(share * 48 * (0.7 + rng() * 0.6) * 4) / 4; // quarter-hours
    return { key, hours };
  });
  const weekTotal = d3.sum(weekly, (w) => w.hours);
  weekly.forEach((w) => (w.pct = (w.hours / weekTotal) * 100));

  return { months, totals, weekly };
}

// =================================================================== //
//  1. STACKED AREA — Time allocation as a % of total time
// =================================================================== //
function StackedAreaChart({ data }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(880);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!data || data.length === 0) return;
    const keys = orderedKeys(data[0]);
    const height = 420;
    const margin = { top: 20, right: 24, bottom: 44, left: 48 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime().domain(d3.extent(data, (d) => d.date)).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

    const stack = d3.stack().keys(keys).order(d3.stackOrderNone);
    const series = stack(data);

    const area = d3
      .area()
      .x((d) => x(d.data.date))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveBasis);

    // grid + y axis
    g.append('g')
      .call(d3.axisLeft(y).tickValues([0, 25, 50, 75, 100]).tickFormat((d) => `${d}%`).tickSize(-innerW))
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('line').attr('stroke', GRID))
      .call((sel) => sel.selectAll('text').attr('fill', MUTED).attr('font-size', 12));

    // x axis (every 3 months)
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(d3.timeMonth.every(3))
          .tickFormat(d3.timeFormat("%b %y"))
          .tickSize(0)
      )
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('text').attr('fill', MUTED).attr('font-size', 11).attr('dy', '1.2em'));

    // areas
    const layers = g
      .selectAll('path.layer')
      .data(series)
      .join('path')
      .attr('class', 'layer')
      .attr('fill', (d) => colorFor(d.key))
      .attr('opacity', 0.92)
      .attr('d', area)
      .style('cursor', 'pointer');

    // tooltip
    const tip = d3.select(wrapRef.current).select('.pd-tip');

    layers
      .on('mousemove', function (event, d) {
        d3.selectAll('path.layer').attr('opacity', 0.25);
        d3.select(this).attr('opacity', 1);
        const [mx] = d3.pointer(event, wrapRef.current);
        const date = x.invert(mx - margin.left);
        const i = d3.bisector((m) => m.date).center(data, date);
        const val = data[i] ? data[i][d.key] : 0;
        tip
          .style('opacity', 1)
          .style('left', `${mx + 14}px`)
          .style('top', `12px`)
          .html(
            `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${colorFor(d.key)};margin-right:6px"></span>` +
              `<b>${d.key}</b><br/>${val.toFixed(1)}% &middot; ${d3.timeFormat('%b %Y')(data[i].date)}`
          );
      })
      .on('mouseleave', function () {
        d3.selectAll('path.layer').attr('opacity', 0.92);
        tip.style('opacity', 0);
      });
  }, [data, width]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg ref={ref} />
      <div
        className="pd-tip"
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          opacity: 0,
          background: '#11141a',
          border: '1px solid rgba(255,255,255,0.12)',
          color: FG,
          padding: '8px 10px',
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.4,
          boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          transition: 'opacity 0.1s',
          maxWidth: 220,
        }}
      />
    </div>
  );
}

// =================================================================== //
//  2. DONUT — Breakdown of total time
// =================================================================== //
function DonutChart({ data }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0) return;
    const size = 360;
    const radius = size / 2;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${size} ${size}`).attr('width', '100%').style('max-width', `${size}px`);

    const g = svg.append('g').attr('transform', `translate(${radius},${radius})`);

    const pie = d3.pie().sort(null).value((d) => d.value);
    const arc = d3.arc().innerRadius(radius * 0.58).outerRadius(radius * 0.95);
    const arcHover = d3.arc().innerRadius(radius * 0.58).outerRadius(radius * 0.99);

    const arcs = pie(data);

    g.selectAll('path')
      .data(arcs)
      .join('path')
      .attr('fill', (d) => colorFor(d.data.key))
      .attr('stroke', BG)
      .attr('stroke-width', 2)
      .attr('d', arc)
      .style('cursor', 'pointer')
      .on('mouseenter', function () {
        d3.select(this).transition().duration(150).attr('d', arcHover);
        center.select('.pd-center-key').text(d3.select(this).datum().data.key);
        center.select('.pd-center-val').text(`${d3.select(this).datum().data.value.toFixed(1)}%`);
      })
      .on('mouseleave', function () {
        d3.select(this).transition().duration(150).attr('d', arc);
        center.select('.pd-center-key').text('Total');
        center.select('.pd-center-val').text('100%');
      });

    // center label
    const center = g.append('g').attr('text-anchor', 'middle');
    center
      .append('text')
      .attr('class', 'pd-center-key')
      .attr('dy', '-0.2em')
      .attr('fill', MUTED)
      .attr('font-size', 13)
      .text('Total');
    center
      .append('text')
      .attr('class', 'pd-center-val')
      .attr('dy', '1.1em')
      .attr('fill', FG)
      .attr('font-size', 26)
      .attr('font-weight', 700)
      .text('100%');
  }, [data]);

  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg ref={ref} style={{ flex: '0 0 auto' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px', flex: 1, minWidth: 220 }}>
        {sorted.map((d) => (
          <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: colorFor(d.key), flex: '0 0 auto' }} />
            <span style={{ color: MUTED, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.key}
            </span>
            <b style={{ color: FG }}>{d.value.toFixed(1)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// =================================================================== //
//  3. WEEKLY COMBO — Hours (bars) + % of week (line)
// =================================================================== //
function WeeklyComboChart({ data }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(880);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!data || data.length === 0) return;
    const height = 380;
    const margin = { top: 24, right: 56, bottom: 96, left: 44 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(data.map((d) => d.key)).range([0, innerW]).padding(0.35);
    const yHours = d3.scaleLinear().domain([0, d3.max(data, (d) => d.hours) * 1.15]).nice().range([innerH, 0]);
    const yPct = d3.scaleLinear().domain([0, d3.max(data, (d) => d.pct) * 1.15]).range([innerH, 0]);

    // grid
    g.append('g')
      .call(d3.axisLeft(yHours).ticks(5).tickSize(-innerW))
      .call((s) => s.select('.domain').remove())
      .call((s) => s.selectAll('line').attr('stroke', GRID))
      .call((s) => s.selectAll('text').attr('fill', MUTED).attr('font-size', 11));

    // right axis (%)
    g.append('g')
      .attr('transform', `translate(${innerW},0)`)
      .call(d3.axisRight(yPct).ticks(5).tickFormat((d) => `${d}%`).tickSize(0))
      .call((s) => s.select('.domain').remove())
      .call((s) => s.selectAll('text').attr('fill', MUTED).attr('font-size', 11));

    // bars
    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', (d) => x(d.key))
      .attr('width', x.bandwidth())
      .attr('y', innerH)
      .attr('height', 0)
      .attr('rx', 3)
      .attr('fill', (d) => colorFor(d.key))
      .attr('opacity', 0.9)
      .transition()
      .duration(700)
      .delay((d, i) => i * 40)
      .attr('y', (d) => yHours(d.hours))
      .attr('height', (d) => innerH - yHours(d.hours));

    // bar value labels
    g.selectAll('text.bar-label')
      .data(data)
      .join('text')
      .attr('class', 'bar-label')
      .attr('x', (d) => x(d.key) + x.bandwidth() / 2)
      .attr('y', (d) => yHours(d.hours) - 6)
      .attr('text-anchor', 'middle')
      .attr('fill', MUTED)
      .attr('font-size', 10)
      .attr('opacity', 0)
      .text((d) => `${d.hours}h`)
      .transition()
      .delay((d, i) => 400 + i * 40)
      .duration(300)
      .attr('opacity', 1);

    // line (% of week)
    const line = d3
      .line()
      .x((d) => x(d.key) + x.bandwidth() / 2)
      .y((d) => yPct(d.pct))
      .curve(d3.curveMonotoneX);

    const path = g
      .append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#6e8bff')
      .attr('stroke-width', 2.5)
      .attr('d', line);

    const len = path.node().getTotalLength();
    path
      .attr('stroke-dasharray', `${len} ${len}`)
      .attr('stroke-dashoffset', len)
      .transition()
      .duration(900)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    g.selectAll('circle')
      .data(data)
      .join('circle')
      .attr('cx', (d) => x(d.key) + x.bandwidth() / 2)
      .attr('cy', (d) => yPct(d.pct))
      .attr('r', 3.5)
      .attr('fill', '#6e8bff')
      .attr('opacity', 0)
      .transition()
      .delay(700)
      .duration(300)
      .attr('opacity', 1);

    // x labels (rotated)
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call((s) => s.select('.domain').remove())
      .selectAll('text')
      .attr('fill', MUTED)
      .attr('font-size', 11)
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-35)')
      .attr('dx', '-0.6em')
      .attr('dy', '0.3em');
  }, [data, width]);

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <svg ref={ref} />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8, fontSize: 12, color: MUTED }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#c8ccd1', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />Hours</span>
        <span><span style={{ display: 'inline-block', width: 18, height: 2, background: '#6e8bff', marginRight: 6, verticalAlign: 'middle' }} />% of week</span>
      </div>
    </div>
  );
}

// =================================================================== //
//  Section wrapper
// =================================================================== //
const cardStyle = {
  background: BG,
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '24px 28px',
  marginBottom: 28,
  boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
};

const titleStyle = {
  color: FG,
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 4px',
};

const subStyle = { color: MUTED, fontSize: 13, margin: '0 0 20px' };

const ProductivityDashboard = () => {
  const [agg, setAgg] = useState(null);
  const [source, setSource] = useState('loading'); // 'loading' | 'live' | 'dummy'

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const real = await fetchCalendarAggregates();
        if (active && real) {
          setAgg(real);
          setSource('live');
          return;
        }
      } catch (e) {
        // fall through to dummy
      }
      if (active) {
        setAgg(buildDummyData());
        setSource('dummy');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const { months, totals, weekly } = agg || { months: [], totals: [], weekly: [] };

  return (
    <div
      style={{
        background: '#1b1e24',
        minHeight: '100vh',
        padding: '40px 24px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: FG, fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>Personal Productivity</h1>
          <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>
            How my calendar time breaks down across work categories.{' '}
            {source === 'live' ? (
              <span style={{ color: '#74e0ad' }}>● Live calendar data</span>
            ) : source === 'dummy' ? (
              <span style={{ color: '#f5b81f' }}>● Dummy data — no calendar events yet</span>
            ) : (
              <span style={{ color: MUTED }}>Loading…</span>
            )}
          </p>
        </div>

        <div style={cardStyle}>
          <h2 style={titleStyle}>Time Allocation as a % of Total Time Spent</h2>
          <p style={subStyle}>Monthly, last 24 months — hover a band to isolate it</p>
          <StackedAreaChart data={months} />
        </div>

        <div style={cardStyle}>
          <h2 style={titleStyle}>Breakdown of Total Time Spent</h2>
          <p style={subStyle}>Share of all tracked time over the period</p>
          <DonutChart data={totals} />
        </div>

        <div style={cardStyle}>
          <h2 style={titleStyle}>This Week</h2>
          <p style={subStyle}>Hours logged per category, with each category's share of the week</p>
          <WeeklyComboChart data={weekly} />
        </div>
      </div>
    </div>
  );
};

export default ProductivityDashboard;
