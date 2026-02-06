const { z } = require("zod");

const { asyncHandler } = require("../utils/asyncHandler");
const { HttpError } = require("../utils/httpError");
const { Room } = require("../models/Room");
const { Project } = require("../models/Project");

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(""),
});

async function requireRoomMember(roomId, userId) {
  const room = await Room.findById(roomId);
  if (!room) throw new HttpError(404, "Room not found");

  const isMember = room.members.some((m) => m.toString() === userId.toString());
  if (!isMember) throw new HttpError(403, "Not a member of this room");

  return room;
}

function registerProjectRoutes(router) {
  router.post(
    "/rooms/:roomId/projects",
    asyncHandler(async (req, res) => {
      await requireRoomMember(req.params.roomId, req.user.id);
      const { name, description } = createProjectSchema.parse(req.body);

      const project = await Project.create({
        room: req.params.roomId,
        name,
        description,
        createdBy: req.user.id,
      });

      res.status(201).json({
        project: {
          id: project._id.toString(),
          room: project.room.toString(),
          name: project.name,
          description: project.description,
          createdBy: project.createdBy.toString(),
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
      });
    })
  );

  router.get(
    "/rooms/:roomId/projects",
    asyncHandler(async (req, res) => {
      await requireRoomMember(req.params.roomId, req.user.id);

      const projects = await Project.find({ room: req.params.roomId }).sort({ updatedAt: -1 }).lean();
      res.json({
        projects: projects.map((p) => ({
          id: p._id.toString(),
          room: p.room.toString(),
          name: p.name,
          description: p.description,
          createdBy: p.createdBy.toString(),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      });
    })
  );
}

module.exports = { registerProjectRoutes, requireRoomMember };

