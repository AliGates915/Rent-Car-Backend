// backend/controllers/vehicleOwner.controller.js
import { pool } from "../../config/db.js";
import { validateDocument, validateFile } from "../../utils/ocrValidator.js";
import { cloudinary } from "../../config/cloudinary.js";

// ====================== CREATE OWNER ======================
export const createOwner = async (req, res) => {
  try {
    const {
      owner_name,
      father_name,
      cnic_no,
      phone_no,
      alternate_phone,
      address,
      city,
      notes,
      status = "active"
    } = req.body;

    if (!owner_name || !phone_no) {
      return res.status(400).json({ message: "Owner name and phone are required" });
    }

    // Handle image uploads (CNIC Front, CNIC Back, Driving License Front, Driving License Back)
    let cnicFrontUrl = null;
    let cnicBackUrl = null;
    let drivingLicenseFrontUrl = null;
    let drivingLicenseBackUrl = null;
    let cnicIsVerified = false;
    let drivingLicenseIsVerified = false;
    let cnicExtractedData = null;
    let drivingLicenseExtractedData = null;
    let cnicRejectionReason = null;
    let drivingLicenseRejectionReason = null;

    // Process uploaded files
    if (req.files) {
      // CNIC Front
      if (req.files.cnic_front) {
        const file = req.files.cnic_front[0];
        cnicFrontUrl = file.path || file.secure_url;
        
        // Validate with OCR
        try {
          const ocrResult = await validateDocument(cnicFrontUrl, 'cnic');
          if (ocrResult.isValid) {
            cnicIsVerified = true;
            cnicExtractedData = JSON.stringify(ocrResult.data);
          } else {
            cnicRejectionReason = ocrResult.errors.join(", ");
          }
        } catch (error) {
          console.error("CNIC Front OCR Error:", error);
          cnicRejectionReason = "OCR validation failed";
        }
      }

      // CNIC Back
      if (req.files.cnic_back) {
        const file = req.files.cnic_back[0];
        cnicBackUrl = file.path || file.secure_url;
      }

      // Driving License Front
      if (req.files.driving_license_front) {
        const file = req.files.driving_license_front[0];
        drivingLicenseFrontUrl = file.path || file.secure_url;
        
        // Validate with OCR
        try {
          const ocrResult = await validateDocument(drivingLicenseFrontUrl, 'license');
          if (ocrResult.isValid) {
            drivingLicenseIsVerified = true;
            drivingLicenseExtractedData = JSON.stringify(ocrResult.data);
          } else {
            drivingLicenseRejectionReason = ocrResult.errors.join(", ");
          }
        } catch (error) {
          console.error("License OCR Error:", error);
          drivingLicenseRejectionReason = "OCR validation failed";
        }
      }

      // Driving License Back
      if (req.files.driving_license_back) {
        const file = req.files.driving_license_back[0];
        drivingLicenseBackUrl = file.path || file.secure_url;
      }
    }

    const sql = `
      INSERT INTO vehicle_owners (
        owner_name, father_name, cnic_no, phone_no, alternate_phone,
        address, city, notes, status, created_by,
        cnic_front_url, cnic_back_url,
        driving_license_front_url, driving_license_back_url,
        cnic_is_verified, driving_license_is_verified,
        cnic_extracted_data, driving_license_extracted_data,
        cnic_rejection_reason, driving_license_rejection_reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(sql, [
      owner_name,
      father_name || null,
      cnic_no || null,
      phone_no,
      alternate_phone || null,
      address || null,
      city || null,
      notes || null,
      status,
      req.user?.id || null,
      cnicFrontUrl,
      cnicBackUrl,
      drivingLicenseFrontUrl,
      drivingLicenseBackUrl,
      cnicIsVerified,
      drivingLicenseIsVerified,
      cnicExtractedData,
      drivingLicenseExtractedData,
      cnicRejectionReason,
      drivingLicenseRejectionReason
    ]);

    res.status(201).json({
      message: "Owner created successfully",
      id: result.insertId,
      verification: {
        cnic: { isVerified: cnicIsVerified, rejectionReason: cnicRejectionReason },
        drivingLicense: { isVerified: drivingLicenseIsVerified, rejectionReason: drivingLicenseRejectionReason }
      }
    });
  } catch (error) {
    console.error("Error in createOwner:", error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== GET ALL OWNERS ======================
export const getOwners = async (req, res) => {
  try {
    const { search, status } = req.query;
    
    let sql = `
      SELECT id, owner_name, father_name, cnic_no, phone_no, alternate_phone,
             address, city, notes, status, created_at, updated_at,
             cnic_front_url, cnic_back_url,
             driving_license_front_url, driving_license_back_url,
             cnic_is_verified, driving_license_is_verified,
             cnic_rejection_reason, driving_license_rejection_reason
      FROM vehicle_owners
      WHERE 1=1
    `;
    
    const params = [];
    
    if (search) {
      sql += ` AND (owner_name LIKE ? OR phone_no LIKE ? OR cnic_no LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY id DESC`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("Error in getOwners:", error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== GET OWNER BY ID ======================
export const getOwnerById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(`SELECT * FROM vehicle_owners WHERE id = ?`, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: "Owner not found" });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error("Error in getOwnerById:", error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== UPDATE OWNER ======================
export const updateOwner = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      owner_name,
      father_name,
      cnic_no,
      phone_no,
      alternate_phone,
      address,
      city,
      notes,
      status
    } = req.body;

    // Handle image uploads for update
    let cnicFrontUrl = null;
    let cnicBackUrl = null;
    let drivingLicenseFrontUrl = null;
    let drivingLicenseBackUrl = null;
    let cnicIsVerified = false;
    let drivingLicenseIsVerified = false;
    let cnicExtractedData = null;
    let drivingLicenseExtractedData = null;
    let cnicRejectionReason = null;
    let drivingLicenseRejectionReason = null;

    // Process uploaded files
    if (req.files) {
      // CNIC Front
      if (req.files.cnic_front) {
        const file = req.files.cnic_front[0];
        cnicFrontUrl = file.path || file.secure_url;
        
        try {
          const ocrResult = await validateDocument(cnicFrontUrl, 'cnic');
          if (ocrResult.isValid) {
            cnicIsVerified = true;
            cnicExtractedData = JSON.stringify(ocrResult.data);
          } else {
            cnicRejectionReason = ocrResult.errors.join(", ");
          }
        } catch (error) {
          console.error("CNIC OCR Error:", error);
          cnicRejectionReason = "OCR validation failed";
        }
      }

      // CNIC Back
      if (req.files.cnic_back) {
        const file = req.files.cnic_back[0];
        cnicBackUrl = file.path || file.secure_url;
      }

      // Driving License Front
      if (req.files.driving_license_front) {
        const file = req.files.driving_license_front[0];
        drivingLicenseFrontUrl = file.path || file.secure_url;
        
        try {
          const ocrResult = await validateDocument(drivingLicenseFrontUrl, 'license');
          if (ocrResult.isValid) {
            drivingLicenseIsVerified = true;
            drivingLicenseExtractedData = JSON.stringify(ocrResult.data);
          } else {
            drivingLicenseRejectionReason = ocrResult.errors.join(", ");
          }
        } catch (error) {
          console.error("License OCR Error:", error);
          drivingLicenseRejectionReason = "OCR validation failed";
        }
      }

      // Driving License Back
      if (req.files.driving_license_back) {
        const file = req.files.driving_license_back[0];
        drivingLicenseBackUrl = file.path || file.secure_url;
      }
    }

    // Build dynamic update query
    let updateFields = [];
    let updateValues = [];

    if (owner_name) {
      updateFields.push("owner_name = ?");
      updateValues.push(owner_name);
    }
    if (father_name !== undefined) {
      updateFields.push("father_name = ?");
      updateValues.push(father_name || null);
    }
    if (cnic_no !== undefined) {
      updateFields.push("cnic_no = ?");
      updateValues.push(cnic_no || null);
    }
    if (phone_no) {
      updateFields.push("phone_no = ?");
      updateValues.push(phone_no);
    }
    if (alternate_phone !== undefined) {
      updateFields.push("alternate_phone = ?");
      updateValues.push(alternate_phone || null);
    }
    if (address !== undefined) {
      updateFields.push("address = ?");
      updateValues.push(address || null);
    }
    if (city !== undefined) {
      updateFields.push("city = ?");
      updateValues.push(city || null);
    }
    if (notes !== undefined) {
      updateFields.push("notes = ?");
      updateValues.push(notes || null);
    }
    if (status) {
      updateFields.push("status = ?");
      updateValues.push(status);
    }
    
    // Image fields
    if (cnicFrontUrl) {
      updateFields.push("cnic_front_url = ?");
      updateValues.push(cnicFrontUrl);
      updateFields.push("cnic_is_verified = ?");
      updateValues.push(cnicIsVerified);
      updateFields.push("cnic_extracted_data = ?");
      updateValues.push(cnicExtractedData);
      updateFields.push("cnic_rejection_reason = ?");
      updateValues.push(cnicRejectionReason);
    }
    
    if (cnicBackUrl) {
      updateFields.push("cnic_back_url = ?");
      updateValues.push(cnicBackUrl);
    }
    
    if (drivingLicenseFrontUrl) {
      updateFields.push("driving_license_front_url = ?");
      updateValues.push(drivingLicenseFrontUrl);
      updateFields.push("driving_license_is_verified = ?");
      updateValues.push(drivingLicenseIsVerified);
      updateFields.push("driving_license_extracted_data = ?");
      updateValues.push(drivingLicenseExtractedData);
      updateFields.push("driving_license_rejection_reason = ?");
      updateValues.push(drivingLicenseRejectionReason);
    }
    
    if (drivingLicenseBackUrl) {
      updateFields.push("driving_license_back_url = ?");
      updateValues.push(drivingLicenseBackUrl);
    }

    updateFields.push("updated_by = ?");
    updateValues.push(req.user?.id || null);
    
    updateFields.push("updated_at = NOW()");
    updateValues.push(id);

    if (updateFields.length === 2) { // Only updated_by and updated_at
      return res.status(400).json({ message: "No fields to update" });
    }

    const sql = `UPDATE vehicle_owners SET ${updateFields.join(", ")} WHERE id = ?`;
    const [result] = await pool.query(sql, updateValues);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Owner not found" });
    }

    res.json({ 
      message: "Owner updated successfully",
      verification: {
        cnic: { isVerified: cnicIsVerified, rejectionReason: cnicRejectionReason },
        drivingLicense: { isVerified: drivingLicenseIsVerified, rejectionReason: drivingLicenseRejectionReason }
      }
    });
  } catch (error) {
    console.error("Error in updateOwner:", error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function to delete images from Cloudinary
const deleteFromCloudinary = async (url) => {
  if (url) {
    try {
      const publicId = url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`vehicle-owners/${publicId}`);
    } catch (error) {
      console.error("Cloudinary delete error:", error);
    }
  }
};

// ====================== DELETE OWNER ======================
export const deleteOwner = async (req, res) => {
  try {
    const { id } = req.params;

    // First get the owner to delete images from Cloudinary
    const [rows] = await pool.query(
      "SELECT cnic_front_url, cnic_back_url, driving_license_front_url, driving_license_back_url FROM vehicle_owners WHERE id = ?",
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const owner = rows[0];
    
    // Delete images from Cloudinary
    await Promise.all([
      deleteFromCloudinary(owner.cnic_front_url),
      deleteFromCloudinary(owner.cnic_back_url),
      deleteFromCloudinary(owner.driving_license_front_url),
      deleteFromCloudinary(owner.driving_license_back_url)
    ]);

    // Delete from database
    const [result] = await pool.query("DELETE FROM vehicle_owners WHERE id = ?", [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Owner not found" });
    }
    
    res.json({ message: "Owner deleted successfully" });
  } catch (error) {
    console.error("Error in deleteOwner:", error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== UPLOAD OWNER DOCUMENT ======================
export const uploadOwnerDocument = async (req, res) => {
  try {
    const { owner_id } = req.params;
    const { document_type } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "File required" });
    }

    // Combine type and side for full document type
    let fullDocumentType = document_type;

    // FILE VALIDATION
    const fileError = validateFile(file);
    if (fileError) {
      return res.status(400).json({ message: fileError });
    }

    const fileUrl = file.secure_url || file.url;
    const publicId = file.filename;

    // Validate document based on type
    const validationResult = await validateDocument(fileUrl, document_type);
    
    let rejectionReason = null;
    let isValid = false;

    if (validationResult.isValid) {
      isValid = true;
    } else {
      isValid = false;
      rejectionReason = validationResult.reason || "OCR validation failed - document text doesn't match requirements";
    }

    // Check if owner exists
    const [ownerResult] = await pool.query(
      "SELECT id, cnic_no FROM vehicle_owners WHERE id = ?",
      [owner_id]
    );
    
    if (ownerResult.length === 0) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const owner = ownerResult[0];

    // Check if document already exists
    const [docResult] = await pool.query(
      "SELECT id, public_id FROM owner_documents WHERE owner_id = ? AND document_type = ?",
      [owner_id, fullDocumentType]
    );

    // If document exists, delete old file from Cloudinary
    if (docResult.length > 0 && docResult[0].public_id) {
      try {
        await cloudinary.uploader.destroy(docResult[0].public_id);
      } catch (cloudinaryError) {
        console.error("Error deleting old file from Cloudinary:", cloudinaryError);
      }
    }

    const extractedDataJSON = JSON.stringify(validationResult.extractedText || {});

    if (docResult.length > 0) {
      // Update existing document
      await pool.query(
        `UPDATE owner_documents
         SET file_url = ?,
             public_id = ?,
             is_verified = ?,
             rejection_reason = ?,
             extracted_data = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [fileUrl, publicId, isValid ? 1 : 0, rejectionReason, extractedDataJSON, docResult[0].id]
      );
    } else {
      // Insert new document
      await pool.query(
        `INSERT INTO owner_documents
         (owner_id, document_type, file_url, public_id, is_verified, rejection_reason, extracted_data)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [owner_id, fullDocumentType, fileUrl, publicId, isValid ? 1 : 0, rejectionReason, extractedDataJSON]
      );
    }

    // Update CNIC number in main table if it's a CNIC document and validation passed
    if (document_type === 'cnic' && isValid && validationResult.extractedText?.cnic_number) {
      await pool.query(
        "UPDATE vehicle_owners SET cnic_no = ? WHERE id = ?",
        [validationResult.extractedText.cnic_number, owner_id]
      );
    }

    res.json({
      success: true,
      message: isValid ? "Document uploaded & verified" : "Document uploaded but rejected",
      verified: isValid,
      rejectionReason: rejectionReason,
      extractedText: validationResult.extractedText,
      documentType: fullDocumentType
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ====================== GET OWNER DOCUMENTS ======================
export const getOwnerDocuments = async (req, res) => {
  try {
    const { owner_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM owner_documents
       WHERE owner_id = ?
       ORDER BY id DESC`,
      [owner_id]
    );

    res.json(rows);
  } catch (error) {
    console.error("Error in getOwnerDocuments:", error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== CHECK OWNER DOCUMENTS COMPLETE ======================
export const checkOwnerDocumentsComplete = async (req, res) => {
  try {
    const { owner_id } = req.params;

    const [rows] = await pool.query(
      `SELECT 
        cnic_front_url,
        cnic_back_url,
        cnic_is_verified,
        driving_license_front_url,
        driving_license_back_url,
        driving_license_is_verified
      FROM vehicle_owners
      WHERE id = ?`,
      [owner_id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const owner = rows[0];
    
    const cnicComplete = owner.cnic_front_url && owner.cnic_back_url;
    const cnicVerified = owner.cnic_is_verified === 1;
    const licenseComplete = owner.driving_license_front_url && owner.driving_license_back_url;
    const licenseVerified = owner.driving_license_is_verified === 1;

    res.json({
      cnic: {
        front_uploaded: !!owner.cnic_front_url,
        back_uploaded: !!owner.cnic_back_url,
        complete: cnicComplete,
        verified: cnicVerified,
        status: cnicComplete && cnicVerified ? 'complete' : (cnicComplete ? 'pending_verification' : 'incomplete')
      },
      driving_license: {
        front_uploaded: !!owner.driving_license_front_url,
        back_uploaded: !!owner.driving_license_back_url,
        complete: licenseComplete,
        verified: licenseVerified,
        status: licenseComplete && licenseVerified ? 'complete' : (licenseComplete ? 'pending_verification' : 'incomplete')
      },
      all_complete: (cnicComplete && cnicVerified) && (licenseComplete && licenseVerified)
    });
  } catch (error) {
    console.error("Error in checkOwnerDocumentsComplete:", error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== DELETE OWNER DOCUMENT ======================
export const deleteOwnerDocument = async (req, res) => {
  try {
    const { document_id } = req.params;

    // Get document details
    const [rows] = await pool.query(
      "SELECT public_id FROM owner_documents WHERE id = ?",
      [document_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Delete from Cloudinary
    if (rows[0].public_id) {
      try {
        await cloudinary.uploader.destroy(rows[0].public_id);
      } catch (cloudinaryError) {
        console.error("Error deleting file from Cloudinary:", cloudinaryError);
      }
    }

    // Delete from database
    await pool.query("DELETE FROM owner_documents WHERE id = ?", [document_id]);

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Error in deleteOwnerDocument:", error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== GET OWNER SUMMARY ======================
export const getOwnerSummary = async (req, res) => {
  try {
    // Get total owners count
    const [totalResult] = await pool.query(
      "SELECT COUNT(*) as total FROM vehicle_owners"
    );
    
    // Get active owners count
    const [activeResult] = await pool.query(
      "SELECT COUNT(*) as active FROM vehicle_owners WHERE status = 'active'"
    );
    
    // Get owners with vehicles
    const [withVehiclesResult] = await pool.query(`
      SELECT COUNT(DISTINCT v.owner_id) as with_vehicles
      FROM vehicles v
      WHERE v.owner_id IS NOT NULL
    `);
    
    // Get verification statistics
    const [verificationResult] = await pool.query(`
      SELECT 
        SUM(CASE WHEN cnic_is_verified = 1 THEN 1 ELSE 0 END) as cnic_verified,
        SUM(CASE WHEN driving_license_is_verified = 1 THEN 1 ELSE 0 END) as license_verified
      FROM vehicle_owners
    `);

    res.json({
      total_owners: totalResult[0]?.total || 0,
      active_owners: activeResult[0]?.active || 0,
      owners_with_vehicles: withVehiclesResult[0]?.with_vehicles || 0,
      verification_stats: {
        cnic_verified: verificationResult[0]?.cnic_verified || 0,
        license_verified: verificationResult[0]?.license_verified || 0
      }
    });
  } catch (error) {
    console.error("Error in getOwnerSummary:", error);
    res.status(500).json({ error: error.message });
  }
};