const mongoose = require("mongoose");

const progressSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    percent: { type: Number, min: 0, max: 100, default: 0 },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "blocked", "done"],
      default: "not_started",
    },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

progressSchema.index({ project: 1, user: 1 }, { unique: true });

const Progress = mongoose.model("Progress", progressSchema);

module.exports = { Progress };

