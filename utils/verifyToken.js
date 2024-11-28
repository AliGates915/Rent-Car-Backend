import jwt from 'jsonwebtoken';
import { createError } from './error.js';

export const verifyToken = (req, res, next) => {
    const token = req.cookies.access_token;
    if (!token) {
        return next(createError(401, 'You are not authenticated!'));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return next(createError(403, "Token is not valid!"));
        console.log(user);  // Log the decoded token for debugging
        req.user = user;
        next();
    });
};

export const verifyUser = (req, res, next) => {
    verifyToken(req, res, next, (err) => {
        if (err) return next(err); // Check if there's an error
        if (req.user.id === req.params.id || req.user.isAdmin) {
            next();
        } else {
            return next(createError(404, "You are not Authorized."));
        }
    });
};

export const verifyAdmin = (req, res, next) => {
    verifyToken(req, res, next, () => {
      if (req.user && req.user.isAdmin) {
        next();
      } else {
        return next(createError(403, "You are not authorized!"));
      }
    });
  };