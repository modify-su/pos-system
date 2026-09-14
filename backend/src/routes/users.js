const express = require('express');
const bcrypt = require('bcryptjs');
const { run, get, all } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Only admin can manage users
router.use(authenticate, requireRole('admin'));

/**
 * GET /api/users
 * List all users with their permissions
 */
router.get('/', async (req, res) => {
  try {
    const users = await all(`
      SELECT id, username, name, role, active, permissions, created_at 
      FROM users 
      ORDER BY id ASC
    `);

    // Parse JSON permissions if present
    const sanitizedUsers = users.map((u) => {
      let parsedPerms = null;
      if (u.permissions) {
        try {
          parsedPerms = JSON.parse(u.permissions);
        } catch {
          parsedPerms = null;
        }
      }
      return {
        ...u,
        permissions: parsedPerms,
      };
    });

    res.json(sanitizedUsers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/users
 * Create a new user
 */
router.post('/', async (req, res) => {
  try {
    const { username, password, name, role = 'cashier', active = 1, permissions = null } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูล Username, Password และชื่อผู้ใช้งานให้ครบถ้วน' });
    }

    if (password.length < 4) {
      return res.status(400).json({ message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร' });
    }

    // Check duplicate username
    const existing = await get('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing) {
      return res.status(400).json({ message: `Username "${username}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const permsJson = Array.isArray(permissions) ? JSON.stringify(permissions) : null;

    const result = await run(
      'INSERT INTO users (username, password, name, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)',
      [username.trim(), hashedPassword, name.trim(), role, active ? 1 : 0, permsJson]
    );

    const newUser = await get(
      'SELECT id, username, name, role, active, permissions, created_at FROM users WHERE id = ?',
      [result.lastID]
    );

    res.status(201).json({
      ...newUser,
      permissions: newUser.permissions ? JSON.parse(newUser.permissions) : null,
      message: 'สร้างผู้ใช้งานสำเร็จ',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/users/:id
 * Update user details, permissions, or password
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { name, role, active, permissions, password } = req.body;

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
    }

    // Protection: Prevent admin from deactivating or demoting their own logged-in account
    if (req.user.id === userId) {
      if (active !== undefined && !active) {
        return res.status(400).json({ message: 'คุณไม่สามารถปิดการใช้งานบัญชีที่กำลังล็อกอินอยู่ได้' });
      }
      if (role && role !== 'admin') {
        return res.status(400).json({ message: 'คุณไม่สามารถลดระดับสิทธิ์ Admin ของบัญชีตนเองได้' });
      }
    }

    // Protection: Ensure at least one active admin remains
    if (user.role === 'admin' && (role !== 'admin' || (active !== undefined && !active))) {
      const adminCount = await get(
        'SELECT COUNT(*) as count FROM users WHERE role = "admin" AND active = 1 AND id != ?',
        [userId]
      );
      if (adminCount.count === 0) {
        return res.status(400).json({ message: 'ต้องมีผู้ดูแลระบบ (Admin) ที่เปิดใช้งานอย่างน้อย 1 คนในระบบ' });
      }
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }

    if (active !== undefined) {
      updates.push('active = ?');
      params.push(active ? 1 : 0);
    }

    if (permissions !== undefined) {
      updates.push('permissions = ?');
      params.push(Array.isArray(permissions) ? JSON.stringify(permissions) : null);
    }

    if (password && password.trim().length > 0) {
      if (password.trim().length < 4) {
        return res.status(400).json({ message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' });
      }
      const hashed = await bcrypt.hash(password.trim(), 10);
      updates.push('password = ?');
      params.push(hashed);
    }

    if (updates.length > 0) {
      params.push(userId);
      await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const updatedUser = await get(
      'SELECT id, username, name, role, active, permissions, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      ...updatedUser,
      permissions: updatedUser.permissions ? JSON.parse(updatedUser.permissions) : null,
      message: 'บันทึกข้อมูลผู้ใช้งานสำเร็จ',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/users/:id
 * Delete or deactivate user
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    if (req.user.id === userId) {
      return res.status(400).json({ message: 'คุณไม่สามารถลบบัญชีของตนเองที่กำลังล็อกอินอยู่ได้' });
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
    }

    if (user.role === 'admin') {
      const adminCount = await get(
        'SELECT COUNT(*) as count FROM users WHERE role = "admin" AND active = 1 AND id != ?',
        [userId]
      );
      if (adminCount.count === 0) {
        return res.status(400).json({ message: 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้' });
      }
    }

    // Try hard delete, fallback to soft deactivate if referenced by foreign keys
    try {
      await run('DELETE FROM users WHERE id = ?', [userId]);
      res.json({ message: 'ลบผู้ใช้งานเรียบร้อยแล้ว' });
    } catch (dbErr) {
      if (dbErr.message.includes('FOREIGN KEY')) {
        // Soft delete
        await run('UPDATE users SET active = 0 WHERE id = ?', [userId]);
        res.json({ message: 'ผู้ใช้งานมีประวัติการทำรายการในระบบ จึงได้ปิดการใช้งาน (Deactivate) แทนการลบ' });
      } else {
        throw dbErr;
      }
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
