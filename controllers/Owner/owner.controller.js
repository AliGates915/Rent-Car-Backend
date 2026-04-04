import { db } from "../../config/db.js";

import { validateDocument, validateFile } from "../../utils/ocrValidator.js";
import { cloudinary } from "../../config/cloudinary.js";

// ====================== CREATE OWNER ======================
export const createOwner = async (req, res) => {
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

  db.query(
    sql,
    [
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
    ],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        message: "Owner created successfully",
        id: result.insertId,
        verification: {
          cnic: { isVerified: cnicIsVerified, rejectionReason: cnicRejectionReason },
          drivingLicense: { isVerified: drivingLicenseIsVerified, rejectionReason: drivingLicenseRejectionReason }
        }
      });
    }
  );
};

// ====================== GET ALL OWNERS ======================
export const getOwners = (req, res) => {
  const sql = `
    SELECT id, owner_name, father_name, cnic_no, phone_no, alternate_phone,
           address, city, notes, status, created_at, updated_at,
           cnic_front_url, cnic_back_url,
           driving_license_front_url, driving_license_back_url,
           cnic_is_verified, driving_license_is_verified,
           cnic_rejection_reason, driving_license_rejection_reason
    FROM vehicle_owners
    ORDER BY id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};


// ====================== GET OWNER BY ID ======================
export const getOwnerById = (req, res) => {
  const { id } = req.params;

  const sql = `SELECT * FROM vehicle_owners WHERE id = ?`;

  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ message: "Owner not found" });
    res.json(rows[0]);
  });
};

// ====================== UPDATE OWNER ======================
export const updateOwner = async (req, res) => {
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

  db.query(sql, updateValues, (err, result) => {
    if (err) {
      console.error("Update error:", err);
      return res.status(500).json({ error: err.message });
    }

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
  });
};

// ====================== DELETE OWNER ======================
export const deleteOwner = (req, res) => {
  const { id } = req.params;

  // First get the owner to delete images from Cloudinary
  const getSql = "SELECT cnic_front_url, cnic_back_url, driving_license_front_url, driving_license_back_url FROM vehicle_owners WHERE id = ?";
  
  db.query(getSql, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (rows.length === 0) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const owner = rows[0];
    
    // Delete images from Cloudinary
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

    Promise.all([
      deleteFromCloudinary(owner.cnic_front_url),
      deleteFromCloudinary(owner.cnic_back_url),
      deleteFromCloudinary(owner.driving_license_front_url),
      deleteFromCloudinary(owner.driving_license_back_url)
    ]).then(() => {
      // Delete from database
      const deleteSql = "DELETE FROM vehicle_owners WHERE id = ?";
      db.query(deleteSql, [id], (deleteErr, result) => {
        if (deleteErr) return res.status(500).json({ error: deleteErr.message });
        res.json({ message: "Owner deleted successfully" });
      });
    }).catch(error => {
      console.error("Error deleting images:", error);
      // Still delete the record even if image deletion fails
      const deleteSql = "DELETE FROM vehicle_owners WHERE id = ?";
      db.query(deleteSql, [id], (deleteErr) => {
        if (deleteErr) return res.status(500).json({ error: deleteErr.message });
        res.json({ message: "Owner deleted successfully (images may not have been cleaned up)" });
      });
    });
  });
};


// ====================== UPLOAD CNIC ======================
export const uploadOwnerCNIC = async (req, res) => {
  const { id } = req.params;
  const { side } = req.body;

  if (!req.files || !req.files.document) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const file = req.files.document[0];
  const fileUrl = file.path || file.secure_url;

  try {
    // OCR Validation
    const ocrResult = await validateDocument(fileUrl, 'cnic');
    
    let updateFields = [];
    let updateValues = [];

    if (side === 'front') {
      updateFields.push("cnic_front_url = ?");
    } else {
      updateFields.push("cnic_back_url = ?");
    }
    updateValues.push(fileUrl);

    if (ocrResult.isValid) {
      updateFields.push("cnic_is_verified = ?");
      updateValues.push(true);
      updateFields.push("cnic_extracted_data = ?");
      updateValues.push(JSON.stringify(ocrResult.data));
      updateFields.push("cnic_rejection_reason = ?");
      updateValues.push(null);
    } else {
      updateFields.push("cnic_is_verified = ?");
      updateValues.push(false);
      updateFields.push("cnic_rejection_reason = ?");
      updateValues.push(ocrResult.errors.join(", "));
    }

    updateFields.push("updated_at = NOW()");
    updateValues.push(id);

    const sql = `UPDATE vehicle_owners SET ${updateFields.join(", ")} WHERE id = ?`;

    db.query(sql, updateValues, (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Owner not found" });
      }

      res.json({
        message: `${side.toUpperCase()} CNIC uploaded ${ocrResult.isValid ? 'and verified' : 'but validation failed'}`,
        isValid: ocrResult.isValid,
        fileUrl: fileUrl,
        errors: ocrResult.errors,
        extractedData: ocrResult.data
      });
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Error processing upload", error: error.message });
  }
};

// ====================== UPLOAD DRIVING LICENSE ======================
export const uploadOwnerDrivingLicense = async (req, res) => {
  const { id } = req.params;
  const { side } = req.body;

  if (!req.files || !req.files.document) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const file = req.files.document[0];
  const fileUrl = file.path || file.secure_url;

  try {
    // OCR Validation
    const ocrResult = await validateDocument(fileUrl, 'license');
    
    let updateFields = [];
    let updateValues = [];

    if (side === 'front') {
      updateFields.push("driving_license_front_url = ?");
    } else {
      updateFields.push("driving_license_back_url = ?");
    }
    updateValues.push(fileUrl);

    if (ocrResult.isValid) {
      updateFields.push("driving_license_is_verified = ?");
      updateValues.push(true);
      updateFields.push("driving_license_extracted_data = ?");
      updateValues.push(JSON.stringify(ocrResult.data));
      updateFields.push("driving_license_rejection_reason = ?");
      updateValues.push(null);
    } else {
      updateFields.push("driving_license_is_verified = ?");
      updateValues.push(false);
      updateFields.push("driving_license_rejection_reason = ?");
      updateValues.push(ocrResult.errors.join(", "));
    }

    updateFields.push("updated_at = NOW()");
    updateValues.push(id);

    const sql = `UPDATE vehicle_owners SET ${updateFields.join(", ")} WHERE id = ?`;

    db.query(sql, updateValues, (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Owner not found" });
      }

      res.json({
        message: `${side.toUpperCase()} Driving License uploaded ${ocrResult.isValid ? 'and verified' : 'but validation failed'}`,
        isValid: ocrResult.isValid,
        fileUrl: fileUrl,
        errors: ocrResult.errors,
        extractedData: ocrResult.data
      });
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Error processing upload", error: error.message });
  }
};

