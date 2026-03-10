const mongoose = require('mongoose');

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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Validate that at least one of office or department is set
facultyStaffSchema.pre('validate', function () {
  if (!this.office && !this.department) {
    throw new Error('Personnel must be assigned to either an office or a department.');
  }
});

const FacultyStaff = mongoose.model('FacultyStaff', facultyStaffSchema);

module.exports = FacultyStaff;
