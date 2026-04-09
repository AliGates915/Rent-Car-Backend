import { db } from "../config/db.js";
import { cloudinary } from "../config/cloudinary.js";

// CREATE
export const createVehicle = (req, res) => {
  // console.log('Request body:', req.body);
  // console.log('Files:', req.files);

  const {
    registration_no,
    car_type,
    car_make,
    car_model,
    year_of_model,
    rate_per_day,
    color,
    transmission_type,
    fuel_type,
    engine_capacity,
    seating_capacity,
    location,
    air_conditioner,
    heater,
    sunroof,
    android,
    front_camera,
    rear_camera,
    status,
  } = req.body;

  // Validate required fields
  if (!registration_no || !car_make || !car_model || !rate_per_day) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const sql = `
    INSERT INTO vehicles (
      registration_no, car_type, car_make, car_model, year_of_model,
      rate_per_day, color, transmission_type, fuel_type,
      engine_capacity, seating_capacity, location,
      air_conditioner, heater, sunroof, android,
      front_camera, rear_camera, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      registration_no,
      car_type,
      car_make,
      car_model,
      year_of_model,
      rate_per_day,
      color,
      transmission_type,
      fuel_type,
      engine_capacity,
      seating_capacity,
      location,
      air_conditioner || 0,
      heater || 0,
      sunroof || 0,
      android || 0,
      front_camera || 0,
      rear_camera || 0,
      status || "available",
    ],
    (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: err.message });
      }

      const vehicleId = result.insertId;

      // Handle multiple image uploads
      if (req.files && req.files.length > 0) {
        const imageValues = req.files.map((file) => [
          vehicleId,
          file.path || file.secure_url || file.url, // Cloudinary URL
          file.public_id || `vehicle_${vehicleId}_${Date.now()}`, // Cloudinary public_id
        ]);

        console.log('Inserting images:', imageValues);

        const insertSql = "INSERT INTO vehicle_images (vehicle_id, image_url, public_id) VALUES ?";
        
        db.query(insertSql, [imageValues], (imgErr, imgResult) => {
          if (imgErr) {
            console.error('Image insert error:', imgErr);
            return res.status(500).json({ 
              message: "Vehicle created but images failed to save", 
              id: vehicleId,
              imageError: imgErr.message
            });
          }
          console.log('Images inserted successfully:', imgResult);
          res.json({ message: "Vehicle created successfully with images", id: vehicleId });
        });
      } else {
        res.json({ message: "Vehicle created successfully (no images)", id: vehicleId });
      }
    }
  );
};
// Update Vehicle
export const updateVehicle = (req, res) => {
  const vehicleId = req.params.id;
  
  // console.log('Update Request body:', req.body);
  // console.log('Update Request files:', req.files);
  
  const {
    registration_no,
    car_type,
    car_make,
    car_model,
    year_of_model,
    rate_per_day,
    color,
    transmission_type,
    fuel_type,
    engine_capacity,
    seating_capacity,
    location,
    air_conditioner,
    heater,
    sunroof,
    android,
    front_camera,
    rear_camera,
    status,
    deleteImages
  } = req.body;

  // Validate required fields
  if (!registration_no || !car_make || !car_model || !rate_per_day) {
    return res.status(400).json({ 
      error: "Missing required fields",
      received: { registration_no, car_make, car_model, rate_per_day }
    });
  }

  const sql = `
    UPDATE vehicles SET
      registration_no = ?, car_type = ?, car_make = ?, car_model = ?,
      year_of_model = ?, rate_per_day = ?, color = ?, transmission_type = ?,
      fuel_type = ?, engine_capacity = ?, seating_capacity = ?, location = ?,
      air_conditioner = ?, heater = ?, sunroof = ?, android = ?,
      front_camera = ?, rear_camera = ?, status = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      registration_no,
      car_type,
      car_make,
      car_model,
      year_of_model,
      rate_per_day,
      color,
      transmission_type,
      fuel_type,
      engine_capacity,
      seating_capacity,
      location,
      air_conditioner !== undefined ? (air_conditioner === '1' || air_conditioner === 1 || air_conditioner === true ? 1 : 0) : 0,
      heater !== undefined ? (heater === '1' || heater === 1 || heater === true ? 1 : 0) : 0,
      sunroof !== undefined ? (sunroof === '1' || sunroof === 1 || sunroof === true ? 1 : 0) : 0,
      android !== undefined ? (android === '1' || android === 1 || android === true ? 1 : 0) : 0,
      front_camera !== undefined ? (front_camera === '1' || front_camera === 1 || front_camera === true ? 1 : 0) : 0,
      rear_camera !== undefined ? (rear_camera === '1' || rear_camera === 1 || rear_camera === true ? 1 : 0) : 0,
      status || "available",
      vehicleId,
    ],
    (err, result) => {
      if (err) {
        console.error('Update error:', err);
        return res.status(500).json({ error: err.message });
      }

      // Function to handle image operations after update
      const handleImages = () => {
        // Handle image deletions if requested
        if (deleteImages) {
          let imagesToDelete = deleteImages;
          if (typeof deleteImages === 'string') {
            try {
              imagesToDelete = JSON.parse(deleteImages);
            } catch (e) {
              imagesToDelete = [deleteImages];
            }
          }
          
          if (imagesToDelete.length > 0) {
            const placeholders = imagesToDelete.map(() => '?').join(',');
            const deleteSql = `DELETE FROM vehicle_images WHERE vehicle_id = ? AND public_id IN (${placeholders})`;
            db.query(deleteSql, [vehicleId, ...imagesToDelete], (delErr) => {
              if (delErr) {
                console.error('Image deletion error:', delErr);
              }
            });
          }
        }

        // Handle new images if uploaded
        if (req.files && req.files.length > 0) {
          const imageValues = req.files.map((file) => [
            vehicleId,
            file.path || file.secure_url || file.url, // Cloudinary URL
            file.public_id || `vehicle_${vehicleId}_${Date.now()}`, // Cloudinary public_id
          ]);

          console.log('Inserting new images:', imageValues);

          const insertSql = "INSERT INTO vehicle_images (vehicle_id, image_url, public_id) VALUES ?";
          
          db.query(insertSql, [imageValues], (imgErr, imgResult) => {
            if (imgErr) {
              console.error('Image insert error:', imgErr);
              return res.status(500).json({ 
                message: "Vehicle updated but images failed to save",
                error: imgErr.message 
              });
            }
            console.log('Images inserted successfully:', imgResult);
            res.json({ message: "Vehicle updated successfully with images", id: vehicleId });
          });
        } else {
          res.json({ message: "Vehicle updated successfully", id: vehicleId });
        }
      };

      // Execute image handling
      handleImages();
    }
  );
};

// Get All Vehicles
export const getVehicles = (req, res) => {
  const search = req.query.search || '';
  const status = req.query.status || '';
  const car_type = req.query.car_type || '';
  const fuel_type = req.query.fuel_type || '';
  
  // Build WHERE clause for filters
  let whereClauses = [];
  let queryParams = [];
  
  if (search) {
    whereClauses.push(`(v.registration_no LIKE ? OR v.car_make LIKE ? OR v.car_model LIKE ? OR v.location LIKE ?)`);
    queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  if (status) {
    whereClauses.push(`v.status = ?`);
    queryParams.push(status);
  }
  
  if (car_type) {
    whereClauses.push(`v.car_type = ?`);
    queryParams.push(car_type);
  }
  
  if (fuel_type) {
    whereClauses.push(`v.fuel_type = ?`);
    queryParams.push(fuel_type);
  }
  
  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  
  const sql = `
    SELECT v.*, vi.image_url, vi.public_id
    FROM vehicles v
    LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
    ${whereClause}
    ORDER BY v.id DESC
  `;
  
  db.query(sql, queryParams, (err, rows) => {
    if (err) {
      console.error('Query error:', err);
      return res.status(500).json({ error: err.message });
    }
    
    const vehiclesMap = {};
    
    rows.forEach((row) => {
      if (!vehiclesMap[row.id]) {
        vehiclesMap[row.id] = {
          id: row.id,
          owner_id: row.owner_id,
          registration_no: row.registration_no,
          car_type: row.car_type,
          car_make: row.car_make,
          car_model: row.car_model,
          year_of_model: row.year_of_model,
          rate_per_day: row.rate_per_day,
          color: row.color,
          transmission_type: row.transmission_type,
          fuel_type: row.fuel_type,
          engine_capacity: row.engine_capacity,
          seating_capacity: row.seating_capacity,
          location: row.location,
          air_conditioner: row.air_conditioner === 1,
          heater: row.heater === 1,
          sunroof: row.sunroof === 1,
          android: row.android === 1,
          front_camera: row.front_camera === 1,
          rear_camera: row.rear_camera === 1,
          status: row.status,
          images: [],
        };
      }
      
      if (row.image_url) {
        vehiclesMap[row.id].images.push({
          url: row.image_url,
          public_id: row.public_id,
        });
      }
    });
    
    res.json({
      data: Object.values(vehiclesMap),
      total: Object.keys(vehiclesMap).length,
      page: 1,
      limit: Object.keys(vehiclesMap).length,
      totalPages: 1
    });
  });
};

// Get Available Vehicles
export const getVehiclesforBooking = (req, res) => {
  const sql = `
    SELECT *
    FROM vehicles
    WHERE status = 'available'
    ORDER BY id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Error fetching available vehicles:", err);
      return res.status(500).json({ message: "Server Error" });
    }

    res.status(200).json({
      success: true,
      count: results.length,
      data: results,
    });
  });
};

// Get Single Vehicle
export const getVehicleById = (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT v.*, vi.image_url, vi.public_id
    FROM vehicles v
    LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
    WHERE v.id = ?
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json(err);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Not found" });
    }

    const vehicle = {
      ...rows[0],
      images: [],
    };

    rows.forEach((row) => {
      if (row.image_url) {
        vehicle.images.push({
          url: row.image_url,
          public_id: row.public_id,
        });
      }
    });

    res.json(vehicle);
  });
};


 // Delete Vehicle
export const deleteVehicle = (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT public_id FROM vehicle_images WHERE vehicle_id=?",
    [id],
    async (err, images) => {
      if (images && images.length > 0) {
        for (let img of images) {
          await cloudinary.uploader.destroy(img.public_id);
        }
      }

      db.query("DELETE FROM vehicles WHERE id=?", [id], (err) => {
        if (err) return res.status(500).json(err);

        res.json({ message: "Vehicle deleted successfully" });
      });
    }
  );
};

// Create new document for a vehicle (with file upload)
export const createVehicleDocument = (req, res) => {
  const {
    vehicle_id,
    document_type,
    document_number,
    issue_date,
    expiry_date,
    notes
  } = req.body;

  // Validate required fields
  if (!vehicle_id || !document_type) {
    return res.status(400).json({ 
      error: "Vehicle ID and Document Type are required" 
    });
  }

  // Check if file was uploaded
  if (!req.file) {
    return res.status(400).json({ error: "Document file is required" });
  }

  const fileUrl = req.file.path || req.file.secure_url;
  const publicId = req.file.public_id || req.file.filename;

  const sql = `
    INSERT INTO vehicle_documents (
      vehicle_id, document_type, document_number, 
      issue_date, expiry_date, file_url, public_id, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      vehicle_id,
      document_type,
      document_number || null,
      issue_date || null,
      expiry_date || null,
      fileUrl,
      publicId,
      notes || null
    ],
    (err, result) => {
      if (err) {
        console.error('Error creating document:', err);
        return res.status(500).json({ error: err.message });
      }

      res.json({
        success: true,
        message: "Document uploaded successfully",
        id: result.insertId,
        file_url: fileUrl
      });
    }
  );
};

// Update document (re-upload file)
export const updateVehicleDocument = (req, res) => {
  const documentId = req.params.id;
  const { document_number, issue_date, expiry_date, notes } = req.body;

  // Check if document exists
  const checkSql = "SELECT * FROM vehicle_documents WHERE id = ?";
  
  db.query(checkSql, [documentId], (err, results) => {
    if (err) {
      console.error('Error checking document:', err);
      return res.status(500).json({ error: err.message });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const existingDoc = results[0];
    
    // Prepare update fields
    let updateFields = [];
    let updateValues = [];

    if (document_number) {
      updateFields.push("document_number = ?");
      updateValues.push(document_number);
    }
    
    if (issue_date) {
      updateFields.push("issue_date = ?");
      updateValues.push(issue_date);
    }
    
    if (expiry_date) {
      updateFields.push("expiry_date = ?");
      updateValues.push(expiry_date);
    }
    
    if (notes !== undefined) {
      updateFields.push("notes = ?");
      updateValues.push(notes);
    }

    // If new file uploaded
    if (req.file) {
      updateFields.push("file_url = ?");
      updateValues.push(req.file.path || req.file.secure_url);
      
      updateFields.push("public_id = ?");
      updateValues.push(req.file.public_id || req.file.filename);
    }

    updateFields.push("updated_at = NOW()");
    updateValues.push(documentId);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const sql = `UPDATE vehicle_documents SET ${updateFields.join(", ")} WHERE id = ?`;

    db.query(sql, updateValues, (updateErr) => {
      if (updateErr) {
        console.error('Error updating document:', updateErr);
        return res.status(500).json({ error: updateErr.message });
      }

      // If there was an old file, you might want to delete it from Cloudinary
      if (req.file && existingDoc.public_id) {
        // Optional: Delete old file from Cloudinary
        // cloudinary.uploader.destroy(existingDoc.public_id);
      }

      res.json({
        success: true,
        message: "Document updated successfully",
        id: documentId
      });
    });
  });
};

// Delete document
export const deleteVehicleDocument = (req, res) => {
  const documentId = req.params.id;

  // First get the document to get public_id for cloudinary deletion
  const getSql = "SELECT public_id FROM vehicle_documents WHERE id = ?";
  
  db.query(getSql, [documentId], (err, results) => {
    if (err) {
      console.error('Error fetching document:', err);
      return res.status(500).json({ error: err.message });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const publicId = results[0].public_id;

    // Delete from database
    const deleteSql = "DELETE FROM vehicle_documents WHERE id = ?";
    
    db.query(deleteSql, [documentId], (deleteErr) => {
      if (deleteErr) {
        console.error('Error deleting document:', deleteErr);
        return res.status(500).json({ error: deleteErr.message });
      }

      // Optional: Delete file from Cloudinary
      // if (publicId) {
      //   cloudinary.uploader.destroy(publicId);
      // }

      res.json({
        success: true,
        message: "Document deleted successfully"
      });
    });
  });
};


// Get all documents for a specific vehicle
export const getVehicleDocuments = (req, res) => {
  const vehicleId = req.params.id;

  const sql = `
    SELECT * FROM vehicle_documents 
    WHERE vehicle_id = ? 
    ORDER BY created_at DESC
  `;

  db.query(sql, [vehicleId], (err, results) => {
    if (err) {
      console.error('Error fetching documents:', err);
      return res.status(500).json({ error: err.message });
    }

    res.json({
      success: true,
      data: results,
      count: results.length
    });
  });
};
