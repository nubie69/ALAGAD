const mongoose = require('mongoose');

const AVAILABILITY_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_AVAILABILITY_TIME_SLOT = '8:00 AM – 5:00 PM';

const facultyStaffSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    office: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Office',
      required: false,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    positionType: {
      type: String,
      trim: true,
      default: 'custom',
    },
    contactInfo: {
      type: String,
    },
    department: {
      type: String,
      required: false,
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: false,
      default: null,
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FacultyStaff',
      required: false,
      default: null,
    },
    availability: {
      daysAvailable: {
        type: [String],
        default: [],
        enum: AVAILABILITY_DAYS,
      },
      timeSlot: {
        type: String,
        trim: true,
        default: DEFAULT_AVAILABILITY_TIME_SLOT,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    last_indexed: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Legacy records may only have the department name. New writes also persist departmentId.
facultyStaffSchema.pre('validate', function () {
  if (!this.office && !this.departmentId && !this.department) {
    throw new Error('Personnel must be assigned to either an office or a department.');
  }

  if (!String(this.title || '').trim()) {
    throw new Error('Position is required.');
  }

  if (this.supervisorId && String(this.supervisorId) === String(this._id)) {
    throw new Error('Personnel cannot report to themselves.');
  }

  const rawDays = Array.isArray(this.availability?.daysAvailable)
    ? this.availability.daysAvailable
    : [];
  const normalizedDaySet = new Set(
    rawDays
      .map((day) => String(day || '').trim())
      .filter((day) => AVAILABILITY_DAYS.includes(day))
  );

  const rawTimeSlot = typeof this.availability?.timeSlot === 'string'
    ? this.availability.timeSlot
    : '';
  const normalizedTimeSlot = rawTimeSlot.trim() || DEFAULT_AVAILABILITY_TIME_SLOT;

  this.availability = {
    daysAvailable: AVAILABILITY_DAYS.filter((day) => normalizedDaySet.has(day)),
    timeSlot: normalizedTimeSlot,
  };
});

const FacultyStaff = mongoose.model('FacultyStaff', facultyStaffSchema);

module.exports = FacultyStaff;
