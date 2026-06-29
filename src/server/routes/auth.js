/**
 * 认证路由 - /api/auth/*
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// 公开路由（不需要认证）
router.post('/login', authController.login);

// 需要认证的路由
router.get('/userinfo', requireAuth, authController.userinfo);
router.post('/users', requireAuth, authController.createUser);
router.get('/users', requireAuth, authController.listUsers);
router.put('/change-password', requireAuth, authController.changePassword);

module.exports = router;
