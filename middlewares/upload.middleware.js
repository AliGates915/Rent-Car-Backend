    import multer from "multer";
    import { storage } from "../config/cloudinary.js";

    const upload = multer({ storage });

    export default upload;

    // Handle multiple file uploads with specific field names for owners
export const uploadOwnerDocuments = upload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'cnic_front', maxCount: 1 },
  { name: 'cnic_back', maxCount: 1 },
  { name: 'driving_license_front', maxCount: 1 },
  { name: 'driving_license_back', maxCount: 1 }
]);
