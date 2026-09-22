import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { userRepository } from '../repositories/userRepository';
import { authenticateToken } from '../middleware/auth';
import { SafeUser } from '../types';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Generate a JWT token for an authenticated user.
 */
function generateToken(user: { id: number; email: string; name: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );
}

/**
 * Strip sensitive fields (like password_hash) from a user object.
 */
function sanitizeUser(user: { id: number; name: string; email: string; created_at: Date }): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at,
  };
}

/**
 * POST /api/auth/register
 * Register a new user account.
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate name
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Name is required and must be at least 2 characters long',
      });
      return;
    }

    // 2. Validate email
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'A valid email address is required',
      });
      return;
    }

    // 3. Validate password
    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Password is required and must be at least 6 characters long',
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 4. Prevent duplicate email registration
    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      res.status(409).json({
        error: 'Conflict',
        message: 'An account with this email address already exists',
      });
      return;
    }

    // 5. Hash password with bcrypt (salt rounds = 10)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 6. Create user in database
    const newUser = await userRepository.create(name.trim(), normalizedEmail, passwordHash);

    // 7. Generate JWT token
    const token = generateToken(newUser);

    // 8. Return response (never return password_hash)
    res.status(201).json({
      message: 'User registered successfully',
      user: sanitizeUser(newUser),
      token,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Authenticate user credentials and return a JWT token.
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Both email and password are required',
      });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await userRepository.findByEmail(normalizedEmail);

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

    // Verify password hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      message: 'Login successful',
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user profile.
 */
router.get('/me', authenticateToken, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const user = await userRepository.findById(req.user.id);
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User account not found',
      });
      return;
    }

    res.json({
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
