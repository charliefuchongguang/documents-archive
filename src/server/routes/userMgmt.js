/**
 * 用户管理路由 - /api/departments, /api/roles, /api/users
 */
const express = require('express');
const deptRouter = express.Router();
const roleRouter = express.Router();
const userRouter = express.Router();
const userMgmtController = require('../controllers/userMgmtController');
const { requireAdmin } = require('../middleware/auth');

// 部门
deptRouter.get('/', requireAdmin, userMgmtController.listDepartments);
deptRouter.post('/', requireAdmin, userMgmtController.createDepartment);
deptRouter.put('/:id', requireAdmin, userMgmtController.updateDepartment);
deptRouter.delete('/:id', requireAdmin, userMgmtController.removeDepartment);

// 角色
roleRouter.get('/', requireAdmin, userMgmtController.listRoles);
roleRouter.post('/', requireAdmin, userMgmtController.createRole);
roleRouter.put('/:id', requireAdmin, userMgmtController.updateRole);
roleRouter.delete('/:id', requireAdmin, userMgmtController.removeRole);

// 用户
userRouter.get('/', requireAdmin, userMgmtController.listUsers);
userRouter.get('/:id', requireAdmin, userMgmtController.getUser);
userRouter.post('/', requireAdmin, userMgmtController.createUser);
userRouter.put('/:id', requireAdmin, userMgmtController.updateUser);
userRouter.delete('/:id', requireAdmin, userMgmtController.removeUser);
userRouter.put('/:id/reset-password', requireAdmin, userMgmtController.resetPassword);

module.exports = { deptRouter, roleRouter, userRouter };
