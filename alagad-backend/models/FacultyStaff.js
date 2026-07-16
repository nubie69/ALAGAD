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
    },
    contactInfo: {
      type: String,
    },
    department: {
      type: String,
      required: false,
      trim: true,
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

// Validate that at least one of office or department is set
facultyStaffSchema.pre('validate', function () {
  if (!this.office && !this.department) {
    throw new Error('Personnel must be assigned to either an office or a department.');
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
