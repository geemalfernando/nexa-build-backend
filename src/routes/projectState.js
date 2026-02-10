const mongoose = require("mongoose");
const { z } = require("zod");

const { asyncHandler } = require("../utils/asyncHandler");
const { HttpError } = require("../utils/httpError");
const { Project } = require("../models/Project");
const { Room } = require("../models/Room");

const customTemplateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    shape: z.union([z.literal("box"), z.literal("cylinder"), z.literal("sphere")]).optional(),
    color: z.string().trim().min(1).max(40).optional(),
    dimensions: z
      .object({
        x: z.number().min(0.01).max(50),
        y: z.number().min(0.01).max(50),
        z: z.number().min(0.01).max(50),
      })
      .partial()
      .optional(),
    cylinder: z
      .object({
        radius: z.number().min(0.01).max(50),
        height: z.number().min(0.01).max(50),
      })
      .partial()
      .optional(),
    sphere: z
      .object({
        radius: z.number().min(0.01).max(50),
      })
      .partial()
      .optional(),
  })
  // Allow forward-compatible additions from the frontend without breaking saves.
  .passthrough();

const furnitureItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
  scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
  color: z.string().trim().min(1).max(40).optional(),
  // Custom object instances
  templateId: z.string().min(1).optional(),
  custom: customTemplateSchema.optional(),
});

const floorPlanElementSchema = z.union([
  z.object({
    id: z.string().min(1),
    type: z.union([z.literal("line"), z.literal("wall")]),
    a: z.object({ x: z.number(), y: z.number() }),
    b: z.object({ x: z.number(), y: z.number() }),
    thicknessMeters: z.number().min(0.05).max(1).optional(),
    color: z.string().min(1).max(40).optional(),
    heightMeters: z.number().min(0.5).max(20).optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("curve"),
    a: z.object({ x: z.number(), y: z.number() }),
    b: z.object({ x: z.number(), y: z.number() }),
    c: z.object({ x: z.number(), y: z.number() }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("room"),
    name: z.string().trim().min(1).max(120).optional(),
    floorColor: z.string().trim().min(1).max(40).optional(),
    heightMeters: z.number().min(0.5).max(20).optional(),
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("outdoor"),
    name: z.string().trim().min(1).max(120).optional(),
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("road"),
    name: z.string().trim().min(1).max(120).optional(),
    surface: z.union([z.literal("gravel"), z.literal("bricks")]).optional(),
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("freehand"),
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("window"),
    wallId: z.string().min(1),
    startRatio: z.number().min(0).max(1),
    endRatio: z.number().min(0).max(1),
    bottomMeters: z.number().min(0).max(10).optional(),
    heightMeters: z.number().min(0.2).max(10).optional(),
    design: z.union([z.literal("single"), z.literal("double"), z.literal("sliding"), z.literal("arch")]).optional(),
    frameColor: z.string().trim().min(1).max(40).optional(),
  }),
]);

const floorPlanSchema = z.object({
  version: z.number().optional(),
  pxPerMeter: z.number().min(10).max(500).optional(),
  wallHeight: z.number().min(1).max(20).optional(),
  workspace: z
    .object({
      widthMeters: z.number().min(1).max(200),
      lengthMeters: z.number().min(1).max(200),
    })
    .optional(),
  elements: z.array(floorPlanElementSchema).optional(),
});

const projectStateSchema = z.object({
  width: z.number().min(1).max(100).optional(),
  length: z.number().min(1).max(100).optional(),
  furniture: z.array(furnitureItemSchema).optional(),
  customCatalog: z.array(customTemplateSchema).max(200).optional(),
  // Back-compat: older clients used a single `floorPlan`.
  floorPlan: floorPlanSchema.optional(),
  // New: multi-floor designs.
  floors: z.array(floorPlanSchema).min(1).max(6).optional(),
  activeFloorIndex: z.number().int().min(0).max(5).optional(),
});

async function requireProjectMember(projectId, userId) {
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    throw new HttpError(404, "Project not found");
  }
  const project = await Project.findById(projectId);
  if (!project) throw new HttpError(404, "Project not found");

  const room = await Room.findById(project.room).lean();
  if (!room) throw new HttpError(404, "Room not found");

  const isMember = (room.members || []).some((m) => m.toString() === userId.toString());
  if (!isMember) throw new HttpError(403, "Not a member of this room");

  return project;
}

function registerProjectStateRoutes(router) {
  router.get(
    "/projects/:projectId/state",
    asyncHandler(async (req, res) => {
      const project = await requireProjectMember(req.params.projectId, req.user.id);
      res.json({
        state: project.state ?? null,
        updatedAt: project.updatedAt,
      });
    })
  );

  router.put(
    "/projects/:projectId/state",
    asyncHandler(async (req, res) => {
      const project = await requireProjectMember(req.params.projectId, req.user.id);
      const state = projectStateSchema.parse(req.body);

      project.state = state;
      await project.save();

      res.json({
        state: project.state ?? null,
        updatedAt: project.updatedAt,
      });
    })
  );

  router.patch(
    "/projects/:projectId/state",
    asyncHandler(async (req, res) => {
      const project = await requireProjectMember(req.params.projectId, req.user.id);
      const patch = projectStateSchema.parse(req.body);

      const nextState = { ...(project.state || {}), ...patch };
      project.state = nextState;
      await project.save();

      res.json({
        state: project.state ?? null,
        updatedAt: project.updatedAt,
      });
    })
  );
}

module.exports = { registerProjectStateRoutes };
