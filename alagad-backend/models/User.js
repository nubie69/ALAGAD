const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      enum: ['guest', 'super_admin'],
      default: 'guest',
    },
    department: {
      type: String,
      default: null,
    },
    office: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Office',
      default: null,
    },
    permissions: {
      canManageBuildings: {
        type: Boolean,
        default: false,
      },
      canManageRooms: {
        type: Boolean,
        default: false,
      },
      canManageOffices: {
        type: Boolean,
        default: false,
      },
      canManageStaff: {
        type: Boolean,
        default: false,
      },
      canManageServices: {
        type: Boolean,
        default: false,
      },
      canEditMap: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
