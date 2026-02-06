const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    code: { type: String, trim: true, required: true, unique: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
  },
  { timestamps: true }
);

const Room = mongoose.model("Room", roomSchema);

module.exports = { Room };

