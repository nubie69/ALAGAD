import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { BackIcon, CloseIcon, OrgChartIcon } from '../utils/icons';

const normalize = (value) => String(value || '').trim();
const entityId = (value) => normalize(value?._id || value?.id || value);
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;

const buildUnits = (offices, departments) => [
  ...(offices || [])
    .filter((office) => office?.isActive !== false)
    .map((office) => ({
      key: `office:${entityId(office)}`,
      id: entityId(office),
      type: 'Office',
      name: normalize(office?.name),
      organizationalChart: office?.organizationalChart,
    })),
  ...(departments || [])
    .filter((department) => department?.active !== false)
    .map((department) => ({
      key: `department:${entityId(department)}`,
      id: entityId(department),
      type: 'Department',
      name: normalize(department?.name),
      organizationalChart: department?.organizationalChart,
    })),
]
  .filter((unit) => unit.name && !unit.key.endsWith(':'))
  .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

const formatLastUpdated = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

function PublicOrgChart({ offices, departments, loadChart, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedUnitKey, setSelectedUnitKey] = useState('');
  const [zoom, setZoom] = useState(100);
  const [loadedChart, setLoadedChart] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState('');
  const closeButtonRef = useRef(null);
  const units = useMemo(() => buildUnits(offices, departments), [offices, departments]);
  const filteredUnits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return units;
    return units.filter((unit) => `${unit.name} ${unit.type}`.toLowerCase().includes(needle));
  }, [query, units]);
  const selectedUnit = units.find((unit) => unit.key === selectedUnitKey) || null;
  const chart = loadedChart || selectedUnit?.organizationalChart;
  const hasChart = Boolean(chart?.data && chart?.mimeType);
  const lastUpdated = formatLastUpdated(chart?.updatedAt);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoadedChart(null);
    setChartError('');
    if (!selectedUnit || selectedUnit.organizationalChart?.data || !selectedUnit.organizationalChart?.mimeType || !loadChart) {
      setChartLoading(false);
      return () => { active = false; };
    }

    setChartLoading(true);
    loadChart(selectedUnit)
      .then((result) => {
        if (active) setLoadedChart(result?.organizationalChart || null);
      })
      .catch(() => {
        if (active) setChartError('The organizational chart could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setChartLoading(false);
      });
    return () => { active = false; };
  }, [loadChart, selectedUnit]);

  const chooseUnit = (unitKey) => {
    setSelectedUnitKey(unitKey);
    setZoom(100);
  };

  return ReactDOM.createPortal(
    <div className="public-org-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="public-org-modal" role="dialog" aria-modal="true" aria-labelledby="public-org-title">
        <header className="public-org-header">
          <span className="public-org-header-icon" aria-hidden="true"><OrgChartIcon size={22} /></span>
          <div>
            <h2 id="public-org-title">Organizational Chart</h2>
            <p>Find an office or department to view its official chart.</p>
          </div>
          <button ref={closeButtonRef} type="button" className="public-org-close" onClick={onClose} aria-label="Close organizational chart">
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="public-org-body">
          <aside className={`public-org-picker ${selectedUnit ? 'has-selection' : ''}`} aria-label="Office and department selection">
            <label htmlFor="public-org-search">Search office or department</label>
            <div className="public-org-search-wrap">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                id="public-org-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search..."
                autoComplete="off"
              />
            </div>

            <div className="public-org-unit-list">
              {filteredUnits.map((unit) => (
                <button
                  key={unit.key}
                  type="button"
                  className={unit.key === selectedUnitKey ? 'active' : ''}
                  onClick={() => chooseUnit(unit.key)}
                  aria-pressed={unit.key === selectedUnitKey}
                >
                  <span>{unit.name}</span>
                  <small>{unit.type}</small>
                </button>
              ))}
              {filteredUnits.length === 0 && <p className="public-org-no-units">No offices or departments found.</p>}
            </div>
          </aside>

          <main className="public-org-chart-panel">
            {!selectedUnit ? (
              <div className="public-org-empty">
                <OrgChartIcon size={38} />
                <h3>Select an office or department</h3>
                <p>Its official organizational chart will appear here.</p>
              </div>
            ) : (
              <>
                <div className="public-org-chart-heading">
                  <button type="button" className="public-org-back" onClick={() => setSelectedUnitKey('')} aria-label="Back to office and department selection">
                    <BackIcon size={17} />
                  </button>
                  <div>
                    <span>{selectedUnit.type}</span>
                    <h3>{selectedUnit.name}</h3>
                    {lastUpdated && <p>Last Updated: {lastUpdated}</p>}
                  </div>
                  {hasChart && (
                    <div className="public-org-zoom" aria-label="Chart zoom controls">
                      <button type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))} disabled={zoom === MIN_ZOOM} aria-label="Zoom out">−</button>
                      <button type="button" className="public-org-zoom-value" onClick={() => setZoom(100)} aria-label="Reset zoom">{zoom}%</button>
                      <button type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))} disabled={zoom === MAX_ZOOM} aria-label="Zoom in">+</button>
                    </div>
                  )}
                </div>
                {chartLoading ? (
                  <div className="public-org-empty public-org-empty--compact" role="status">
                    <div className="public-org-loading-spinner" />
                    <h3>Loading organizational chart...</h3>
                  </div>
                ) : hasChart ? (
                  <div className="public-org-chart-viewport">
                    <div className="public-org-chart-document" style={{ width: `${zoom}%`, height: chart.mimeType === 'application/pdf' ? `${zoom}%` : 'auto' }}>
                      {chart.mimeType === 'application/pdf' ? (
                        <object data={chart.data} type="application/pdf" aria-label={`${selectedUnit.name} organizational chart`}>
                          <p>This PDF cannot be previewed in the current browser.</p>
                        </object>
                      ) : (
                        <img src={chart.data} alt={`${selectedUnit.name} organizational chart`} draggable="false" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="public-org-empty public-org-empty--compact">
                    <OrgChartIcon size={34} />
                    <h3>No organizational chart available</h3>
                    <p>{chartError || `This ${selectedUnit.type.toLowerCase()} has not uploaded an organizational chart yet.`}</p>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </section>
    </div>,
    document.body
  );
}

export default PublicOrgChart;
