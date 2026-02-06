const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    name: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Stores the user's design/canvas state for the project (room size, furniture placements, etc.)
    // Kept flexible so the frontend can evolve without frequent migrations.
    state: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const Project = mongoose.model("Project", projectSchema);

module.exports = { Project };
