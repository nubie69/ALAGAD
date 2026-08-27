import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { CloseIcon, OrgChartIcon } from '../utils/icons';

const normalize = (value) => String(value || '').trim();
const entityId = (value) => normalize(value?._id || value?.id || value);

const getOfficeName = (person) => normalize(person?.office?.name);
const getDepartmentName = (person) => (
  normalize(person?.departmentId?.name)
  || normalize(person?.department)
  || normalize(person?.office?.department)
);

const getAssignmentName = (person) => getOfficeName(person) || getDepartmentName(person) || 'Not provided';

const buildUnits = (offices, personnel) => {
  const units = new Map();

  (offices || [])
    .filter((office) => office?.isActive !== false)
    .forEach((office) => {
      const id = entityId(office);
      const name = normalize(office?.name);
      if (id && name) units.set(`office:${id}`, { key: `office:${id}`, type: 'Office', id, name });
    });

  (personnel || []).forEach((person) => {
    const office = person?.office;
    const officeId = entityId(office);
    const officeName = getOfficeName(person);
    if (officeId && officeName) {
      units.set(`office:${officeId}`, { key: `office:${officeId}`, type: 'Office', id: officeId, name: officeName });
    }

    const departmentName = getDepartmentName(person);
    if (departmentName) {
      // Name is the stable common value across populated, legacy, and office-backed records.
      const departmentId = departmentName.toLowerCase();
      const key = `department:${departmentId}`;
      units.set(key, { key, type: 'Department', id: departmentId, name: departmentName });
    }
  });

  return Array.from(units.values()).sort((a, b) => (
    a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
  ));
};

const belongsToUnit = (person, unit) => {
  if (!unit) return false;
  if (unit.type === 'Office') return entityId(person?.office) === unit.id;

  return getDepartmentName(person).toLowerCase() === unit.name.toLowerCase();
};

const buildPersonnelTree = (personnel) => {
  const people = (personnel || []).filter((person) => person?.isActive !== false);
  const peopleById = new Map(people.map((person) => [entityId(person), person]));
  const childrenById = new Map();
  const roots = [];

  people.forEach((person) => {
    const supervisorId = entityId(person?.supervisorId);
    const personId = entityId(person);
    if (supervisorId && supervisorId !== personId && peopleById.has(supervisorId)) {
      const children = childrenById.get(supervisorId) || [];
      children.push(person);
      childrenById.set(supervisorId, children);
    } else {
      roots.push(person);
    }
  });

  const byName = (a, b) => normalize(a?.name).localeCompare(normalize(b?.name));
  roots.sort(byName);
  childrenById.forEach((children) => children.sort(byName));
  return { roots, childrenById };
};

function PersonnelCard({ person }) {
  return (
    <article className="public-org-person-card">
      <dl>
        <div>
          <dt>Name</dt>
          <dd>{normalize(person?.name) || 'Not provided'}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>{normalize(person?.title) || 'Not provided'}</dd>
        </div>
        <div>
          <dt>Office/Department</dt>
          <dd>{getAssignmentName(person)}</dd>
        </div>
        <div>
          <dt>Contact Information</dt>
          <dd>{normalize(person?.contactInfo) || 'Not provided'}</dd>
        </div>
      </dl>
    </article>
  );
}

function OrgBranch({ person, childrenById, path = new Set() }) {
  const personId = entityId(person);
  const children = path.has(personId) ? [] : (childrenById.get(personId) || []);
  const nextPath = new Set(path);
  nextPath.add(personId);

  return (
    <li className="public-org-branch">
      <PersonnelCard person={person} />
      {children.length > 0 && (
        <ul className="public-org-children">
          {children.map((child) => (
            <OrgBranch key={entityId(child) || child.name} person={child} childrenById={childrenById} path={nextPath} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PublicOrgChart({ offices, personnel, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedUnitKey, setSelectedUnitKey] = useState('');
  const closeButtonRef = useRef(null);
  const units = useMemo(() => buildUnits(offices, personnel), [offices, personnel]);
  const filteredUnits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return units;
    return units.filter((unit) => `${unit.name} ${unit.type}`.toLowerCase().includes(needle));
  }, [query, units]);
  const selectedUnit = units.find((unit) => unit.key === selectedUnitKey) || null;
  const selectedPersonnel = useMemo(() => (
    (personnel || []).filter((person) => person?.isActive !== false && belongsToUnit(person, selectedUnit))
  ), [personnel, selectedUnit]);
  const { roots, childrenById } = useMemo(() => buildPersonnelTree(selectedPersonnel), [selectedPersonnel]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div className="public-org-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="public-org-modal" role="dialog" aria-modal="true" aria-labelledby="public-org-title">
        <header className="public-org-header">
          <span className="public-org-header-icon" aria-hidden="true"><OrgChartIcon size={22} /></span>
          <div>
            <h2 id="public-org-title">Organizational Chart</h2>
            <p>Find an office or department to view its personnel structure.</p>
          </div>
          <button ref={closeButtonRef} type="button" className="public-org-close" onClick={onClose} aria-label="Close organizational chart">
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="public-org-body">
          <aside className="public-org-picker" aria-label="Office and department selection">
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
                  onClick={() => setSelectedUnitKey(unit.key)}
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
                <p>Its read-only organizational chart will appear here.</p>
              </div>
            ) : (
              <>
                <div className="public-org-chart-heading">
                  <div>
                    <span>{selectedUnit.type}</span>
                    <h3>{selectedUnit.name}</h3>
                  </div>
                  <strong>{selectedPersonnel.length} {selectedPersonnel.length === 1 ? 'person' : 'people'}</strong>
                </div>
                {roots.length > 0 ? (
                  <div className="public-org-chart-scroll">
                    <ul className="public-org-tree">
                      {roots.map((person) => (
                        <OrgBranch key={entityId(person) || person.name} person={person} childrenById={childrenById} />
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="public-org-empty public-org-empty--compact">
                    <h3>No personnel available</h3>
                    <p>No active personnel are currently listed for this {selectedUnit.type.toLowerCase()}.</p>
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
