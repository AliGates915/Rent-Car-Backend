import { db } from "../config/db.js";
import { cloudinary } from "../config/cloudinary.js";

// CREATE
export const createVehicle = (req, res) => {
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
    owner_id,
    owner_percentage,
    air_conditioner,
    heater,
    sunroof,
    android,
    front_camera,
    rear_camera,

    status,
  } = req.body;

  const sql = `
    INSERT INTO vehicles (
      registration_no, car_type, car_make, car_model, year_of_model,
      rate_per_day, color, transmission_type, fuel_type,
      engine_capacity, seating_capacity, location,
      air_conditioner, heater, sunroof, android,
      front_camera, rear_camera, status, owner_id, owner_percentage
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       owner_id,
    owner_percentage,
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
      if (err) return res.status(500).json(err);

      const vehicleId = result.insertId;

      // 🔥 SAVE IMAGES
      if (req.files && req.files.length > 0) {
        const imageValues = req.files.map((file) => [
          vehicleId,
          file.path,
          file.filename,
        ]);

        db.query(
          "INSERT INTO vehicle_images (vehicle_id, image_url, public_id) VALUES ?",
          [imageValues]
        );
      }

      res.json({ message: "Vehicle created successfully" });
    }
  );
};

// Update Vehicle
export const updateVehicle = (req, res) => {
  const { id } = req.params;

  const {
    car_type,
    car_make,
    car_model,
    year_of_model,
    rate_per_day,
    color,
     owner_id,
    owner_percentage,
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

  const sql = `
    UPDATE vehicles SET
      car_type=?,
      car_make=?,
      car_model=?,
      year_of_model=?,
      rate_per_day=?,
      color=?,
      owner_id=?,
      owner_percentage=?,
      transmission_type=?,
      fuel_type=?,
      engine_capacity=?,
      seating_capacity=?,
      location=?,
      air_conditioner=?,
      heater=?,
      sunroof=?,
      android=?,
      front_camera=?,
      rear_camera=?,
      status=?
    WHERE id=?
  `;

  db.query(
    sql,
    [
      car_type,
      car_make,
      car_model,
      year_of_model,
      rate_per_day,
      owner_id,
      owner_percentage,
    
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
      status,
      id,
    ],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Vehicle updated successfully" });
    }
  );
};

// Get All Vehicles
export const getVehicles = (req, res) => {
  const sql = `
    SELECT v.*, vi.image_url, vi.public_id
    FROM vehicles v
    LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);

    const vehiclesMap = {};

    rows.forEach((row) => {
      if (!vehiclesMap[row.id]) {
        vehiclesMap[row.id] = {
          id: row.id,
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
          air_conditioner: row.air_conditioner,
          heater: row.heater,
          sunroof: row.sunroof,
          android: row.android,
          front_camera: row.front_camera,
          rear_camera: row.rear_camera,
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

    res.json(Object.values(vehiclesMap));
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