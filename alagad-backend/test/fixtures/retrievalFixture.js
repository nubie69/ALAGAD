const now = new Date('2026-04-01T10:00:00.000Z');
const staleDate = new Date('2021-05-01T09:00:00.000Z');

const recordsByType = {
  buildings: [
    {
      _id: 'building-lib',
      name: 'Main Library Building',
      description: 'Central library building with circulation and reading rooms.',
      department: 'Library Services',
      geometry: { coordinates: [125.12611, 8.15591] },
      numberOfFloors: 3,
      updatedAt: now,
    },
    {
      _id: 'building-eng',
      name: 'Engineering Hall',
      description: 'Engineering classrooms and laboratories.',
      department: 'College of Engineering',
      geometry: { coordinates: [125.12711, 8.15611] },
      numberOfFloors: 4,
      updatedAt: now,
    },
  ],
  departments: [
    {
      _id: 'dept-cs',
      name: 'Computer Science Department',
      code: 'CS',
      description: 'Department handling BS Computer Science.',
      building: { name: 'Engineering Hall' },
      floor: 3,
      updatedAt: now,
    },
  ],
  offices: [
    {
      _id: 'office-registrar',
      name: 'Office of the Registrar',
      department: 'Registrar',
      description: 'Handles records and enrollment documents.',
      contactInfo: 'registrar@campus.edu',
      building: { name: 'Administration Building' },
      room: { name: 'Room 102' },
      floor: 1,
      updatedAt: now,
    },
    {
      _id: 'office-admissions',
      name: 'Admissions Office',
      department: 'Admissions',
      description: 'Handles new student admissions and screening.',
      contactInfo: 'admissions@campus.edu',
      building: { name: 'Administration Building' },
      room: { name: 'Room 105' },
      floor: 1,
      updatedAt: staleDate,
    },
  ],
  rooms: [
    {
      _id: 'room-301',
      name: 'Room 301',
      description: 'Computer Science lecture room.',
      department: 'Computer Science Department',
      building: { name: 'Engineering Hall' },
      floor: 3,
      updatedAt: now,
    },
    {
      _id: 'room-elab',
      name: 'Electronics Laboratory Room 204',
      description: 'Electronics and circuits laboratory.',
      department: 'College of Engineering',
      building: { name: 'Engineering Hall' },
      floor: 2,
      updatedAt: now,
    },
  ],
  personnel: [
    {
      _id: 'person-maria',
      name: 'Dr. Maria Santos',
      title: 'Professor, Computer Science Department',
      contactInfo: 'maria.santos@campus.edu',
      department: 'Computer Science Department',
      office: { name: 'Faculty Office CS', building: { name: 'Engineering Hall' } },
      updatedAt: now,
    },
    {
      _id: 'person-roberto',
      name: 'Engr. Roberto Reyes',
      title: 'Dean, College of Engineering',
      contactInfo: 'dean.engineering@campus.edu',
      department: 'College of Engineering',
      office: { name: 'Dean Office', building: { name: 'Engineering Hall' } },
      updatedAt: now,
    },
    {
      _id: 'person-ana',
      name: 'Ana Cruz',
      title: 'Admissions Officer',
      contactInfo: 'ana.cruz@campus.edu',
      department: 'Admissions',
      office: { name: 'Admissions Office', building: { name: 'Administration Building' } },
      updatedAt: now,
    },
  ],
  services: [
    {
      _id: 'service-id-renewal',
      name: 'Student ID Renewal',
      description: 'Renewal of student identification card each semester.',
      requirements: ['Old ID card', 'Registration form', 'Payment receipt'],
      steps: ['Submit requirements', 'Verify records', 'Capture photo', 'Claim ID'],
      department: 'Registrar',
      office: { name: 'Office of the Registrar' },
      updatedAt: now,
    },
    {
      _id: 'service-tor',
      name: 'Transcript of Records Request',
      description: 'Request for official transcript of records.',
      requirements: ['Valid ID', 'Request form', 'Clearance'],
      steps: ['Fill out request form', 'Pay processing fee', 'Return for claiming date'],
      department: 'Registrar',
      office: { name: 'Office of the Registrar' },
      updatedAt: now,
    },
    {
      _id: 'service-coe',
      name: 'Certificate of Enrollment',
      description: 'Issuance of enrollment certificate for current semester.',
      requirements: ['Student number', 'Current registration form'],
      steps: ['Submit request', 'Wait for processing', 'Claim certificate'],
      department: 'Registrar',
      office: { name: 'Office of the Registrar' },
      updatedAt: now,
    },
  ],
};

const queryCases = [
  { query: 'where is main library building', expectedId: 'building-lib' },
  { query: 'location of engineering hall', expectedId: 'building-eng' },
  { query: 'computer science department office', expectedId: 'dept-cs' },
  { query: 'registrar office location', expectedId: 'office-registrar' },
  { query: 'where is room 301', expectedId: 'room-301' },
  { query: 'find electronics laboratory room', expectedId: 'room-elab' },
  { query: 'who is dr maria santos', expectedId: 'person-maria' },
  { query: 'dean of engineering', expectedId: 'person-roberto' },
  { query: 'student id renewal requirements', expectedId: 'service-id-renewal' },
  { query: 'process for transcript of records', expectedId: 'service-tor' },
  { query: 'steps for certificate of enrollment', expectedId: 'service-coe' },
  { query: 'tor service requirements', expectedId: 'service-tor' },
  { query: 'id card renewal process', expectedId: 'service-id-renewal' },
  { query: 'where can i find registrar', expectedId: 'office-registrar' },
  { query: 'who is ana cruz admissions officer', expectedId: 'person-ana' },
  { query: 'main library', expectedId: 'building-lib' },
  { query: 'computer science dept', expectedId: 'dept-cs' },
  { query: 'room 204 laboratory', expectedId: 'room-elab' },
  { query: 'certificate of enrollment contact', expectedId: 'service-coe' },
  { query: 'engineering dean contact', expectedId: 'person-roberto' },
];

const multilingualQueryCases = [
  { query: 'Nasaan ang opisina ng registrar?', expectedId: 'office-registrar', language: 'tagalog' },
  { query: 'Asa ang office sa registrar?', expectedId: 'office-registrar', language: 'cebuano' },
  { query: 'Unsa ang requirements sa transcript of records?', expectedId: 'service-tor', language: 'cebuano' },
  { query: 'Ano ang process for student id renewal?', expectedId: 'service-id-renewal', language: 'tagalog' },
  { query: 'Where ang room 301?', expectedId: 'room-301', language: 'tagalog' },
  { query: 'Asa si Dr. Maria Santos?', expectedId: 'person-maria', language: 'cebuano' },
];

const edgeCaseQueries = {
  typos: [
    { query: 'where is regstrar office', expectedId: 'office-registrar' },
    { query: 'transript of records requirements', expectedId: 'service-tor' },
    { query: 'studnt id renwal process', expectedId: 'service-id-renewal' },
  ],
  vague: [
    { query: 'How to apply?' },
    { query: 'What are the requirements?' },
  ],
};

module.exports = {
  recordsByType,
  queryCases,
  multilingualQueryCases,
  edgeCaseQueries,
};
