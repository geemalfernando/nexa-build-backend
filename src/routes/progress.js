const { z } = require("zod");

const { asyncHandler } = require("../utils/asyncHandler");
const { HttpError } = require("../utils/httpError");
const { Project } = require("../models/Project");
const { Room } = require("../models/Room");
const { Progress } = require("../models/Progress");

const upsertProgressSchema = z.object({
  percent: z.number().min(0).max(100).optional(),
  status: z.enum(["not_started", "in_progress", "blocked", "done"]).optional(),
  notes: z.string().trim().max(5000).optional(),
});

async function requireProjectMember(projectId, userId) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new HttpError(404, "Project not found");

  const room = await Room.findById(project.room).lean();
  if (!room) throw new HttpError(404, "Room not found");

  const isMember = (room.members || []).some((m) => m.toString() === userId.toString());
  if (!isMember) throw new HttpError(403, "Not a member of this room");

  return { project, room };
}

function registerProgressRoutes(router) {
  router.put(
    "/projects/:projectId/progress",
    asyncHandler(async (req, res) => {
      await requireProjectMember(req.params.projectId, req.user.id);
      const update = upsertProgressSchema.parse(req.body);

      const progress = await Progress.findOneAndUpdate(
        { project: req.params.projectId, user: req.user.id },
        { $set: update },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      res.json({
        progress: {
          id: progress._id.toString(),
          project: progress.project.toString(),
          user: progress.user.toString(),
          percent: progress.percent,
          status: progress.status,
          notes: progress.notes,
          createdAt: progress.createdAt,
          updatedAt: progress.updatedAt,
        },
      });
    })
  );

  router.get(
    "/projects/:projectId/progress/me",
    asyncHandler(async (req, res) => {
      await requireProjectMember(req.params.projectId, req.user.id);
      const progress = await Progress.findOne({ project: req.params.projectId, user: req.user.id }).lean();
      if (!progress) {
        return res.json({ progress: null });
      }
      return res.json({
        progress: {
          id: progress._id.toString(),
          project: progress.project.toString(),
          user: progress.user.toString(),
          percent: progress.percent,
          status: progress.status,
          notes: progress.notes,
          createdAt: progress.createdAt,
          updatedAt: progress.updatedAt,
        },
      });
    })
  );

  router.get(
    "/projects/:projectId/progress",
    asyncHandler(async (req, res) => {
      await requireProjectMember(req.params.projectId, req.user.id);

      const progressList = await Progress.find({ project: req.params.projectId })
        .populate("user", "name email")
        .sort({ updatedAt: -1 })
        .lean();

      res.json({
        progress: progressList.map((p) => ({
          id: p._id.toString(),
          project: p.project.toString(),
          user: {
            id: p.user?._id?.toString?.() || p.user?.toString?.() || "",
            name: p.user?.name,
            email: p.user?.email,
          },
          percent: p.percent,
          status: p.status,
          notes: p.notes,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      });
    })
  );
}

module.exports = { registerProgressRoutes };

