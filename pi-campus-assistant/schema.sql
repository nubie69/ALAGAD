PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    floor_count INTEGER DEFAULT 1,
    landmark TEXT,
    directions_from_main_entrance TEXT,
    latitude REAL,
    longitude REAL,
    is_accessible INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    building_id INTEGER NOT NULL,
    room TEXT,
    description TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    office_hours TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS offices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    building_id INTEGER NOT NULL,
    room TEXT,
    description TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    office_hours TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL,
    room_number TEXT NOT NULL,
    room_type TEXT,
    floor INTEGER,
    description TEXT,
    is_accessible INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (building_id, room_number),
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    department_id INTEGER,
    office_id INTEGER,
    description TEXT,
    requirements TEXT,
    process_steps TEXT,
    turnaround_time TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS personnel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    title TEXT,
    department_id INTEGER,
    office_id INTEGER,
    email TEXT,
    phone TEXT,
    office_hours TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    alias TEXT NOT NULL,
    UNIQUE (entity_type, entity_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_departments_building_id ON departments(building_id);
CREATE INDEX IF NOT EXISTS idx_offices_building_id ON offices(building_id);
CREATE INDEX IF NOT EXISTS idx_rooms_building_id ON rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_services_department_id ON services(department_id);
CREATE INDEX IF NOT EXISTS idx_services_office_id ON services(office_id);
CREATE INDEX IF NOT EXISTS idx_personnel_department_id ON personnel(department_id);
CREATE INDEX IF NOT EXISTS idx_personnel_office_id ON personnel(office_id);
CREATE INDEX IF NOT EXISTS idx_aliases_lookup ON aliases(entity_type, entity_id, alias);
