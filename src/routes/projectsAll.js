const { asyncHandler } = require("../utils/asyncHandler");
const { Room } = require("../models/Room");
const { Project } = require("../models/Project");
const { Progress } = require("../models/Progress");

function registerAllProjectsRoutes(router) {
  // List every project the current user can access across all rooms.
  // Includes the current user's progress for each project (if any).
  router.get(
    "/projects",
    asyncHandler(async (req, res) => {
      const rooms = await Room.find({ members: req.user.id }).select("_id").lean();
      const roomIds = rooms.map((r) => r._id);

      const projects = await Project.find({ room: { $in: roomIds } }).sort({ updatedAt: -1 }).lean();
      const projectIds = projects.map((p) => p._id);

      const myProgress = await Progress.find({ user: req.user.id, project: { $in: projectIds } }).lean();
      const progressByProjectId = new Map(myProgress.map((p) => [p.project.toString(), p]));

      res.json({
        projects: projects.map((p) => {
          const progress = progressByProjectId.get(p._id.toString()) || null;
          return {
            id: p._id.toString(),
            room: p.room.toString(),
            name: p.name,
            description: p.description,
            createdBy: p.createdBy.toString(),
            state: p.state ?? null,
            myProgress: progress
              ? {
                  id: progress._id.toString(),
                  percent: progress.percent,
                  status: progress.status,
                  notes: progress.notes,
                  updatedAt: progress.updatedAt,
                }
              : null,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          };
        }),
      });
    })
  );
}

module.exports = { registerAllProjectsRoutes };

