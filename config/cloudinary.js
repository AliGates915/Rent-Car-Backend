import cloudinary from 'cloudinary';
import pkg from 'multer-storage-cloudinary';
import dotenv from 'dotenv';

const CloudinaryStorage = pkg.default || pkg;

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
    limits: { fileSize: 5 * 1024 * 1024 },
  params: {
    folder: 'rent-cars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
    resource_type: 'auto',
  },
});

export { cloudinary, storage };