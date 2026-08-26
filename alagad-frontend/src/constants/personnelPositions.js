export const CUSTOM_POSITION_VALUE = 'custom';

export const PERSONNEL_POSITION_GROUPS = [
  {
    label: 'Academic Leadership',
    options: ['President', 'Vice President', 'Dean', 'Associate Dean', 'Department Chairperson', 'Assistant Department Chairperson'],
  },
  {
    label: 'Academic / Teaching',
    options: ['Professor', 'Associate Professor', 'Assistant Professor', 'Instructor', 'Lecturer', 'Faculty Member', 'Visiting Faculty', 'Part-Time Faculty'],
  },
  {
    label: 'Program / Academic Management',
    options: ['Program Coordinator', 'Program Head', 'Curriculum Coordinator', 'Research Coordinator', 'Extension Coordinator', 'Internship/OJT Coordinator', 'Laboratory Coordinator'],
  },
  {
    label: 'Administrative',
    options: ['Director', 'Assistant Director', 'Office Head', 'Administrative Officer', 'Administrative Assistant', 'Administrative Staff', 'Secretary', 'Clerk', 'Records Officer', 'Finance Officer'],
  },
  {
    label: 'Technical / Support',
    options: ['IT Officer', 'Systems Administrator', 'Laboratory Technician', 'Laboratory Assistant', 'Technical Staff', 'Maintenance Staff', 'Utility Staff', 'Support Staff'],
  },
  {
    label: 'Student Services',
    options: ['Student Affairs Officer', 'Guidance Counselor', 'Registrar', 'Assistant Registrar', 'Librarian', 'Library Assistant', 'Admission Officer'],
  },
  {
    label: 'Other',
    options: ['Coordinator', 'Assistant', 'Staff'],
  },
].map((group) => ({
  ...group,
  options: group.options.map((label) => ({
    label,
    value: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  })),
}));

PERSONNEL_POSITION_GROUPS[PERSONNEL_POSITION_GROUPS.length - 1].options.push({
  label: 'Other / Custom Position',
  value: CUSTOM_POSITION_VALUE,
});

export const PERSONNEL_POSITION_OPTIONS = PERSONNEL_POSITION_GROUPS.flatMap((group) => group.options);

export const findPositionByValue = (value) => PERSONNEL_POSITION_OPTIONS.find((option) => option.value === value);

export const findPositionByLabel = (label) => {
  const normalized = String(label || '').trim().toLowerCase();
  return PERSONNEL_POSITION_OPTIONS.find((option) => option.value !== CUSTOM_POSITION_VALUE && option.label.toLowerCase() === normalized);
};
