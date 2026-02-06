const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const { env, requireEnv } = require("../config/env");
const { asyncHandler } = require("../utils/asyncHandler");
const { HttpError } = require("../utils/httpError");
const { User } = require("../models/User");
const { authRequired } = require("../middleware/auth");

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(200),
});

function signToken(userId) {
  const secret = env.JWT_SECRET || requireEnv("JWT_SECRET");
  return jwt.sign({}, secret, { subject: userId, expiresIn: "7d" });
}

async function ensureEmailUnique(email) {
  const existing = await User.findOne({ email }).lean();
  if (existing) throw new HttpError(409, "Email already in use");
}

function registerAuthRoutes(router) {
  router.post(
    "/signup",
    asyncHandler(async (req, res) => {
      const { name, email, password } = signupSchema.parse(req.body);
      await ensureEmailUnique(email);

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({ name, email, passwordHash });

      const token = signToken(user._id.toString());
      res.status(201).json({ token, user: user.toSafeJSON() });
    })
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { email, password } = loginSchema.parse(req.body);

      const user = await User.findOne({ email }).select("+passwordHash");
      if (!user) throw new HttpError(401, "Invalid email or password");

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) throw new HttpError(401, "Invalid email or password");

      const token = signToken(user._id.toString());
      res.json({ token, user: user.toSafeJSON() });
    })
  );

  router.get(
    "/me",
    authRequired,
    asyncHandler(async (req, res) => {
      const user = await User.findById(req.user.id);
      if (!user) throw new HttpError(404, "User not found");
      res.json({ user: user.toSafeJSON() });
    })
  );
}

module.exports = { registerAuthRoutes };

