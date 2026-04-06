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


// Owner Document Controller


export const uploadOwnerDocument = async (req, res) => {
  try {
    const { owner_id } = req.params;
    const { document_type } = req.body;
    const file = req.file;
    // console.log("req body ", req.body);
    // console.log("req. url ", file);
    
    

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
    
    // return;


    let rejectionReason = null;
    let isValid = false;

    if (validationResult.isValid) {
      isValid = true;
    } else {
      isValid = false;
      rejectionReason = validationResult.reason || "OCR validation failed - document text doesn't match requirements";
    }

    // Check if owner exists
    const checkOwnerSql = `SELECT id, cnic_no FROM vehicle_owners WHERE id = ?`;
    
    db.query(checkOwnerSql, [owner_id], async (err, ownerResult) => {
      if (err) return res.status(500).json(err);
      
      if (ownerResult.length === 0) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const owner = ownerResult[0];

      // Check if document already exists
      const checkDocSql = `
        SELECT id, public_id FROM owner_documents 
        WHERE owner_id = ? AND document_type = ?
      `;
      
      db.query(checkDocSql, [owner_id, fullDocumentType], async (err, docResult) => {
        if (err) return res.status(500).json(err);

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
          const updateSql = `
            UPDATE owner_documents
            SET file_url = ?,
                public_id = ?,
                is_verified = ?,
                rejection_reason = ?,
                extracted_data = ?,
                updated_at = NOW()
            WHERE id = ?
          `;

          db.query(
            updateSql,
            [fileUrl, publicId, isValid ? 1 : 0, rejectionReason, extractedDataJSON, docResult[0].id],
            (err) => {
              if (err) return res.status(500).json(err);

              // Update CNIC number in main table if it's a CNIC document and validation passed
              if (document_type === 'cnic' && isValid && validationResult.extractedText?.cnic_number) {
                const updateCnicSql = `UPDATE vehicle_owners SET cnic_no = ? WHERE id = ?`;
                db.query(updateCnicSql, [validationResult.extractedText.cnic_number, owner_id]);
              }

              res.json({
                success: true,
                message: isValid ? "Document uploaded & verified" : "Document uploaded but rejected",
                verified: isValid,
                rejectionReason: rejectionReason,
                extractedText: validationResult.extractedText,
                documentType: fullDocumentType
              });
            }
          );
        } else {
          // Insert new document
          const insertSql = `
            INSERT INTO owner_documents
            (owner_id, document_type, file_url, public_id, is_verified, rejection_reason, extracted_data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

          db.query(
            insertSql,
            [owner_id, fullDocumentType, fileUrl, publicId, isValid ? 1 : 0, rejectionReason, extractedDataJSON],
            (err, result) => {
              if (err) {
                console.error("Insert error:", err);
                return res.status(500).json({ message: "Database error", error: err.message });
              }

              // Update CNIC number in main table if it's a CNIC document and validation passed
              if (document_type === 'cnic' && isValid && validationResult.extractedText?.cnic_number) {
                const updateCnicSql = `UPDATE vehicle_owners SET cnic_no = ? WHERE id = ?`;
                db.query(updateCnicSql, [validationResult.extractedText.cnic_number, owner_id]);
              }

              res.json({
                success: true,
                message: isValid ? "Document uploaded & verified" : "Document uploaded but rejected",
                verified: isValid,
                rejectionReason: rejectionReason,
                extractedText: validationResult.extractedText,
                documentType: fullDocumentType
              });
            }
          );
        }
      });
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message });
  }
};


export const getOwnerDocuments = (req, res) => {
  const { owner_id } = req.params;

  const sql = `
    SELECT * FROM owner_documents
    WHERE owner_id = ?
    ORDER BY id DESC
  `;

  db.query(sql, [owner_id], (err, rows) => {
    if (err) return res.status(500).json(err);

    res.json(rows);
  });
};


// Function to check if both CNIC sides are uploaded and verified
export const checkOwnerDocumentsComplete = (req, res) => {
  const { owner_id } = req.params;

  const sql = `
    SELECT 
      cnic_front_url,
      cnic_back_url,
      cnic_is_verified,
      driving_license_front_url,
      driving_license_back_url,
      driving_license_is_verified
    FROM vehicle_owners
    WHERE id = ?
  `;

  db.query(sql, [owner_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    
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
  });
};