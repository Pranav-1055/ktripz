const express = require('express');
const multer = require('multer');
const { storage } = require('../config/cloudinary');
const { sendResponse, sendError, asyncHandler } = require('../middleware');

const router = express.Router();

// File filter
const fileFilter = (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|webp|WEBP)$/)) {
        req.fileValidationError = 'Only image files are allowed!';
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

/**
 * POST /api/uploads/profile-image
 * Upload a profile image
 */
router.post('/profile-image', upload.single('image'), asyncHandler(async (req, res) => {
    if (req.fileValidationError) {
        return sendError(res, 400, 'INVALID_FILE', req.fileValidationError);
    }

    if (!req.file) {
        return sendError(res, 400, 'NO_FILE', 'Please upload a file');
    }

    // Cloudinary returns the full URL in path
    const imageUrl = req.file.path;

    sendResponse(res, 200, {
        imageUrl: imageUrl,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size
    }, 'Image uploaded successfully');
}));

/**
 * POST /api/uploads/license-image
 * Upload a license image
 */
router.post('/license-image', upload.single('image'), asyncHandler(async (req, res) => {
    if (req.fileValidationError) {
        return sendError(res, 400, 'INVALID_FILE', req.fileValidationError);
    }

    if (!req.file) {
        return sendError(res, 400, 'NO_FILE', 'Please upload a file');
    }

    // Cloudinary returns the full URL in path
    const imageUrl = req.file.path;

    sendResponse(res, 200, {
        imageUrl: imageUrl,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size
    }, 'License image uploaded successfully');
}));

module.exports = router;
