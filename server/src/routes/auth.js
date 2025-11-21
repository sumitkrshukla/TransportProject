import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ sub: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, role: user.role });
});

// Simple seed endpoint to create default users (disable in prod)
router.post('/seed-users', async (_req, res) => {
  const defaults = [
    { email: 'admin@fleetai.com', password: 'password123', role: 'Admin' },
    { email: 'manager@fleetai.com', password: 'password123', role: 'Manager' }
  ];
  const created = [];
  for (const u of defaults) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      created.push(await User.create({ email: u.email, passwordHash, role: u.role }));
    }
  }
  res.json({ ok: true, created: created.map((u) => u.email) });
});

export default router;
