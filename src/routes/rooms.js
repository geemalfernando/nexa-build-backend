const { z } = require("zod");

const { asyncHandler } = require("../utils/asyncHandler");
const { HttpError } = require("../utils/httpError");
const { Room } = require("../models/Room");

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

const createRoomSchema = z.object({ name: z.string().trim().min(1).max(80) });
const joinRoomSchema = z.object({ code: z.string().trim().min(4).max(20).toUpperCase() });

function registerRoomRoutes(router) {
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { name } = createRoomSchema.parse(req.body);

      let code;
      for (let i = 0; i < 5; i += 1) {
        code = generateRoomCode();
        // eslint-disable-next-line no-await-in-loop
        const exists = await Room.findOne({ code }).lean();
        if (!exists) break;
      }

      const room = await Room.create({
        name,
        code,
        owner: req.user.id,
        members: [req.user.id],
      });

      res.status(201).json({
        room: {
          id: room._id.toString(),
          name: room.name,
          code: room.code,
          owner: room.owner.toString(),
          members: room.members.map((m) => m.toString()),
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
        },
      });
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const rooms = await Room.find({ members: req.user.id }).sort({ updatedAt: -1 }).lean();
      res.json({
        rooms: rooms.map((r) => ({
          id: r._id.toString(),
          name: r.name,
          code: r.code,
          owner: r.owner.toString(),
          members: r.members.map((m) => m.toString()),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      });
    })
  );

  router.post(
    "/join",
    asyncHandler(async (req, res) => {
      const { code } = joinRoomSchema.parse(req.body);

      const room = await Room.findOne({ code });
      if (!room) throw new HttpError(404, "Room not found");

      const userId = req.user.id.toString();
      const isMember = room.members.some((m) => m.toString() === userId);
      if (!isMember) {
        room.members.push(req.user.id);
        await room.save();
      }

      res.json({
        room: {
          id: room._id.toString(),
          name: room.name,
          code: room.code,
          owner: room.owner.toString(),
          members: room.members.map((m) => m.toString()),
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
        },
      });
    })
  );

  router.get(
    "/:roomId",
    asyncHandler(async (req, res) => {
      const room = await Room.findById(req.params.roomId).lean();
      if (!room) throw new HttpError(404, "Room not found");

      const isMember = (room.members || []).some((m) => m.toString() === req.user.id.toString());
      if (!isMember) throw new HttpError(403, "Not a member of this room");

      res.json({
        room: {
          id: room._id.toString(),
          name: room.name,
          code: room.code,
          owner: room.owner.toString(),
          members: room.members.map((m) => m.toString()),
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
        },
      });
    })
  );
}

module.exports = { registerRoomRoutes };

